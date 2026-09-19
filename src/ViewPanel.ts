import * as vscode from "vscode";
import { generateTreeViewHtml } from "./TreeViewPanel";
import Puppeteer from "./puppeteer";
import DevtoolsBridge from "./devtoolsBridge";
import { wireBridgeToWebview } from "./bridgeWiring";
import type { ReactionConfig } from "./config";

// Shows the React component tree in a single webview panel.
export default class ViewPanel {
  public static currentPanel: ViewPanel | undefined;
  public static readonly viewType = "ReactION";

  private readonly treePanel: vscode.WebviewPanel;
  private readonly page: Puppeteer;
  private readonly bridge: DevtoolsBridge;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(
    treePanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    config: ReactionConfig,
  ) {
    this.treePanel = treePanel;
    this.treePanel.webview.html = generateTreeViewHtml(
      treePanel.webview,
      extensionUri,
      config.reactTheme,
    );

    this.page = new Puppeteer(config);
    this.bridge = new DevtoolsBridge();
    void this.start();

    this.treePanel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    config: ReactionConfig,
  ): void {
    const treeColumn = vscode.ViewColumn.Two;

    if (ViewPanel.currentPanel) {
      ViewPanel.currentPanel.treePanel.reveal(treeColumn);
      return;
    }

    const treePanel = vscode.window.createWebviewPanel(
      ViewPanel.viewType,
      "Virtual DOM Tree",
      treeColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
      },
    );

    ViewPanel.currentPanel = new ViewPanel(treePanel, extensionUri, config);
  }

  private async start(): Promise<void> {
    const relayPort = await this.bridge.start();
    this.disposables.push(
      wireBridgeToWebview(this.bridge, this.treePanel.webview),
    );

    try {
      await this.page.start(relayPort);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `ReactION: could not launch Chrome. Check "executablePath" in reactION-config.json. ${String(error)}`,
      );
      return;
    }

    if (this.disposed) {
      // Panel was closed while Chrome was launching; tear down the browser.
      void this.page.close();
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    ViewPanel.currentPanel = undefined;

    void this.page.close();
    this.bridge.dispose();
    this.treePanel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
