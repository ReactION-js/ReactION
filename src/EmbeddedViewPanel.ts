import * as vscode from "vscode";
import { generateTreeViewHtml } from "./TreeViewPanel";
import { generateHtmlPreview } from "./htmlViewPanel";
import Puppeteer, { describeStartFailure } from "./puppeteer";
import DevtoolsBridge from "./devtoolsBridge";
import { wireBridgeToWebview } from "./bridgeWiring";
import { wireSourceOpening } from "./sourceOpeningWiring";
import { wireCoverageAnalysis } from "./coverageAnalysisWiring";
import { wireEmptyStateDiagnostics } from "./diagnosticsWiring";
import { wireConnectionResilience } from "./connectionResilience";
import { createModuleLogger } from "./outputChannelLogger";
import { type ReactionConfig, toUrl } from "./config";

// Shows the running app (iframe preview) alongside its component tree.
export default class EmbeddedViewPanel {
  public static currentPanel: EmbeddedViewPanel | undefined;
  public static readonly viewType = "ReactION";

  private readonly htmlPanel: vscode.WebviewPanel;
  private readonly treePanel: vscode.WebviewPanel;
  private readonly page: Puppeteer;
  private readonly bridge: DevtoolsBridge;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(
    htmlPanel: vscode.WebviewPanel,
    treePanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    config: ReactionConfig,
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
  ) {
    this.htmlPanel = htmlPanel;
    this.treePanel = treePanel;
    this.outputChannel = outputChannel;

    this.htmlPanel.webview.html = generateHtmlPreview(toUrl(config.localhost));
    this.treePanel.webview.html = generateTreeViewHtml(
      treePanel.webview,
      extensionUri,
      config.reactTheme,
    );

    this.page = new Puppeteer(config, createModuleLogger(outputChannel, "puppeteer"));
    this.bridge = new DevtoolsBridge(createModuleLogger(outputChannel, "devtools-bridge"));
    void this.start(workspaceRoot, toUrl(config.localhost));

    this.htmlPanel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.treePanel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    config: ReactionConfig,
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
  ): void {
    const htmlColumn = vscode.ViewColumn.Two;
    const treeColumn = vscode.ViewColumn.Three;

    if (EmbeddedViewPanel.currentPanel) {
      EmbeddedViewPanel.currentPanel.htmlPanel.reveal(htmlColumn);
      EmbeddedViewPanel.currentPanel.treePanel.reveal(treeColumn);
      return;
    }

    const options: vscode.WebviewPanelOptions & vscode.WebviewOptions = {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
    };

    const htmlPanel = vscode.window.createWebviewPanel(
      EmbeddedViewPanel.viewType,
      "HTML Preview",
      htmlColumn,
      options,
    );
    const treePanel = vscode.window.createWebviewPanel(
      EmbeddedViewPanel.viewType,
      "Virtual DOM Tree",
      treeColumn,
      options,
    );

    EmbeddedViewPanel.currentPanel = new EmbeddedViewPanel(
      htmlPanel,
      treePanel,
      extensionUri,
      config,
      workspaceRoot,
      outputChannel,
    );
  }

  private async start(workspaceRoot: string, url: string): Promise<void> {
    const relayPort = await this.bridge.start();
    this.disposables.push(
      wireBridgeToWebview(this.bridge, this.treePanel.webview),
      wireSourceOpening(this.treePanel.webview, workspaceRoot),
      wireCoverageAnalysis(this.treePanel.webview, workspaceRoot),
      wireEmptyStateDiagnostics(
        this.treePanel.webview,
        createModuleLogger(this.outputChannel, "webview"),
        url,
      ),
    );

    try {
      await this.page.start(relayPort);
    } catch (error) {
      void vscode.window
        .showErrorMessage(describeStartFailure(error), "Show Log")
        .then((choice) => {
          if (choice === "Show Log") {
            this.outputChannel.show();
          }
        });
      return;
    }

    if (this.disposed) {
      // Panel was closed while Chrome was launching; tear down the browser.
      void this.page.close();
      return;
    }

    this.disposables.push(
      wireConnectionResilience({
        bridge: this.bridge,
        page: this.page,
        url: this.page.connectedUrl,
        log: createModuleLogger(this.outputChannel, "resilience"),
        isTornDown: () => this.disposed,
        onReconnectExhausted: () => {
          void vscode.window.showWarningMessage(
            "ReactION: lost connection to the dev server and could not reconnect. " +
              "Check that it's running, then close and reopen the panel.",
          );
        },
        onBrowserLost: () => {
          void vscode.window.showWarningMessage(
            "ReactION: the Chrome window closed or crashed unexpectedly. " +
              "Close and reopen the panel to reconnect.",
          );
        },
      }),
    );
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    EmbeddedViewPanel.currentPanel = undefined;

    void this.page.close();
    this.bridge.dispose();
    this.htmlPanel.dispose();
    this.treePanel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
