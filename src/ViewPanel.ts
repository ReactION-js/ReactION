import * as vscode from "vscode";
import { generateTreeViewHtml } from "./TreeViewPanel";
import Puppeteer from "./puppeteer";
import DevtoolsBridge from "./devtoolsBridge";
import { startLiveTreePipeline } from "./liveTreePipeline";
import { createModuleLogger } from "./outputChannelLogger";
import { type ReactionConfig } from "./config";

// Shows the React component tree in a single webview panel.
export default class ViewPanel {
  public static currentPanel: ViewPanel | undefined;
  public static readonly viewType = "ReactION";

  private readonly treePanel: vscode.WebviewPanel;
  private readonly page: Puppeteer;
  private readonly bridge: DevtoolsBridge;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(
    treePanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    config: ReactionConfig,
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
  ) {
    this.treePanel = treePanel;
    this.outputChannel = outputChannel;
    this.treePanel.webview.html = generateTreeViewHtml(
      treePanel.webview,
      extensionUri,
      config.reactTheme,
    );

    this.page = new Puppeteer(config, createModuleLogger(outputChannel, "puppeteer"));
    this.bridge = new DevtoolsBridge(createModuleLogger(outputChannel, "devtools-bridge"));
    void this.start(workspaceRoot);

    this.treePanel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  // Exposed for Task 5e's "ReactION.selectInstance" command: the way to get
  // at this panel's webview to post a host->webview message to, without
  // exposing the whole private treePanel (createOrShow/dispose still own its
  // full lifecycle).
  public get webview(): vscode.Webview {
    return this.treePanel.webview;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    config: ReactionConfig,
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
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

    ViewPanel.currentPanel = new ViewPanel(
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
    ViewPanel.currentPanel = undefined;

    void this.page.close();
    this.bridge.dispose();
    this.treePanel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
