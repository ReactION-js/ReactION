import * as vscode from "vscode";
import { generateTreeViewHtml } from "./TreeViewPanel";
import { generateHtmlPreview } from "./htmlViewPanel";
import Puppeteer from "./puppeteer";
import { startTreeSync } from "./treeSync";
import { type ReactionConfig, toUrl } from "./config";

const REFRESH_INTERVAL_MS = 1000;

// Shows the running app (iframe preview) alongside its component tree.
export default class EmbeddedViewPanel {
  public static currentPanel: EmbeddedViewPanel | undefined;
  public static readonly viewType = "ReactION";

  private readonly htmlPanel: vscode.WebviewPanel;
  private readonly treePanel: vscode.WebviewPanel;
  private readonly page: Puppeteer;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(
    htmlPanel: vscode.WebviewPanel,
    treePanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    config: ReactionConfig,
  ) {
    this.htmlPanel = htmlPanel;
    this.treePanel = treePanel;

    this.htmlPanel.webview.html = generateHtmlPreview(toUrl(config.localhost));
    this.treePanel.webview.html = generateTreeViewHtml(
      treePanel.webview,
      extensionUri,
      config.reactTheme,
    );

    this.page = new Puppeteer(config);
    void this.start();

    this.htmlPanel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.treePanel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    config: ReactionConfig,
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
    );
  }

  private async start(): Promise<void> {
    try {
      await this.page.start();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `ReactION: could not launch Chrome. Check "executablePath" in reactION-config.json. ${String(error)}`,
      );
      return;
    }

    if (this.disposed) {
      // Panel was closed while Chrome was launching; tear down the browser.
      void this.page.close();
      return;
    }

    this.disposables.push(
      startTreeSync(this.page, this.treePanel.webview, REFRESH_INTERVAL_MS),
    );
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    EmbeddedViewPanel.currentPanel = undefined;

    void this.page.close();
    this.htmlPanel.dispose();
    this.treePanel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
