import * as vscode from "vscode";
import { generateTreeViewHtml } from "./TreeViewPanel";
import { generateHtmlPreview } from "./htmlViewPanel";
import Puppeteer from "./puppeteer";
import DevtoolsBridge from "./devtoolsBridge";
import { startLiveTreePipeline } from "./liveTreePipeline";
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
    void this.start(workspaceRoot);

    this.htmlPanel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.treePanel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  // Exposed for Task 5e's "ReactION.selectInstance" command -- the TREE
  // panel's webview specifically (it runs client/App.tsx and the live Store),
  // not htmlPanel (a plain iframe preview with no Store to select an element
  // in). Mirrors ViewPanel's own `webview` getter.
  public get webview(): vscode.Webview {
    return this.treePanel.webview;
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

  private async start(workspaceRoot: string): Promise<void> {
    await startLiveTreePipeline({
      bridge: this.bridge,
      page: this.page,
      treeWebview: this.treePanel.webview,
      workspaceRoot,
      outputChannel: this.outputChannel,
      pushDisposable: (disposable) => this.disposables.push(disposable),
      isDisposed: () => this.disposed,
    });
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
