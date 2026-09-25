import * as vscode from "vscode";
import { generateTreeViewHtml } from "./TreeViewPanel";
import Puppeteer from "./puppeteer";
import DevtoolsBridge from "./devtoolsBridge";
import { startLiveTreePipeline } from "./liveTreePipeline";
import { wireSourceOpening } from "./sourceOpeningWiring";
import { wireCoverageAnalysis } from "./coverageAnalysisWiring";
import { wireStaticComponentTree } from "./staticComponentTreeWiring";
import { wireStaticComponentDetail } from "./staticComponentDetailWiring";
import { createStaticAnalysisSession } from "./staticAnalysisSession";
import { runSetupWizard } from "./setupWizard";
import { loadConfig, type ReactionConfig } from "./config";
import { createModuleLogger } from "./outputChannelLogger";

export type ViewPanelMode = "static" | "live";

const PANEL_TITLES: Record<ViewPanelMode, string> = {
  static: "ReactION Static",
  live: "ReactION Live",
};

interface ConnectToLiveAppMessage {
  type?: string;
}

// Shows the React component tree in one of two separate webview panels/tabs
// -- "static" and "live" are independent tabs with disjoint capability
// sets, not a single panel with a runtime toggle. Static analysis (source-
// opening, the static composition tree and its per-node detail sidebar)
// needs no browser and is available immediately; the live tab (Chrome/
// Puppeteer, Check Coverage, profiling) is opt-in and real render data
// only exists there. Keeping them as separate tabs means neither webview
// ever needs to know about the other's capabilities or show controls that
// don't apply to it (see client/App.tsx / TreeView.tsx, which read
// window.__REACTION_MODE__ once and never toggle).
export default class ViewPanel {
  public static currentStaticPanel: ViewPanel | undefined;
  public static currentLivePanel: ViewPanel | undefined;
  public static readonly viewType = "ReactION";

  private readonly treePanel: vscode.WebviewPanel;
  private readonly mode: ViewPanelMode;
  private page: Puppeteer | undefined;
  private bridge: DevtoolsBridge | undefined;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;
  // Sent true the moment a "connectToLiveApp" request is accepted, so a
  // second click (or a second message somehow arriving) while the wizard/
  // Chrome launch is already in flight -- or after it already succeeded --
  // is simply ignored, rather than running the wizard twice or replacing an
  // already-live page/bridge out from under startLiveTreePipeline. Reset to
  // false if the wizard is cancelled/fails, so the user can try again.
  // Only ever meaningful for a "live" mode panel.
  private liveConnectionRequested = false;

  private constructor(
    mode: ViewPanelMode,
    treePanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    config: ReactionConfig,
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
  ) {
    this.mode = mode;
    this.treePanel = treePanel;
    this.outputChannel = outputChannel;
    this.treePanel.webview.html = generateTreeViewHtml(
      treePanel.webview,
      extensionUri,
      config.reactTheme,
      mode,
    );

    // Opening a file needs no live connection and no static analysis
    // either, so it's wired unconditionally in both modes.
    this.disposables.push(wireSourceOpening(this.treePanel.webview, workspaceRoot));

    if (mode === "static") {
      // The static tab's whole reason to exist: source-analysis-only
      // features, no Chrome/dev-server connection ever involved.
      // One analysis snapshot, computed once and shared by both wirings for
      // this panel's whole lifetime -- see staticAnalysisSession.ts for why
      // that matters (a node clicked well after the tree was built must
      // still resolve against the SAME result object, both for
      // tree/sidebar consistency and to actually get the cache hit
      // staticComponentDetail.ts's own per-object cache depends on).
      const getStaticAnalysis = createStaticAnalysisSession(workspaceRoot);
      this.disposables.push(wireStaticComponentTree(this.treePanel.webview, getStaticAnalysis));
      this.disposables.push(wireStaticComponentDetail(this.treePanel.webview, getStaticAnalysis));
    } else {
      // Check Coverage correlates static components against LIVE
      // ever-rendered data, so it only belongs in the live tab -- in a
      // static-only tab it would just always read 0%, which isn't useful
      // (see client/App.tsx's mode split, which hides its button entirely
      // in static mode; this is the matching host-side half).
      this.disposables.push(wireCoverageAnalysis(this.treePanel.webview, workspaceRoot));

      const connectSubscription = this.treePanel.webview.onDidReceiveMessage(
        (msg: ConnectToLiveAppMessage) => {
          if (msg?.type === "connectToLiveApp") {
            void this.connectToLiveApp(workspaceRoot);
          }
        },
      );
      this.disposables.push(connectSubscription);
    }

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
    mode: ViewPanelMode,
    extensionUri: vscode.Uri,
    config: ReactionConfig,
    workspaceRoot: string,
    outputChannel: vscode.OutputChannel,
  ): ViewPanel {
    const treeColumn = vscode.ViewColumn.Two;
    const existing = mode === "static" ? ViewPanel.currentStaticPanel : ViewPanel.currentLivePanel;
    if (existing) {
      existing.treePanel.reveal(treeColumn);
      return existing;
    }

    const treePanel = vscode.window.createWebviewPanel(
      ViewPanel.viewType,
      PANEL_TITLES[mode],
      treeColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
      },
    );

    treePanel.iconPath = vscode.Uri.joinPath(extensionUri, "resources", "color.png");

    const panel = new ViewPanel(mode, treePanel, extensionUri, config, workspaceRoot, outputChannel);
    if (mode === "static") {
      ViewPanel.currentStaticPanel = panel;
    } else {
      ViewPanel.currentLivePanel = panel;
    }
    return panel;
  }

  // Runs in response to the live tab's own "connectToLiveApp" message (see
  // client/App.tsx's "Connect to live app" action) OR to the
  // "ReactION: Launch Live Rendering" command (extension.ts) driving the
  // exact same flow right after opening the live tab -- public so
  // extension.ts can call it directly on an already-open panel. Guides the
  // user through runSetupWizard (confirm/detect the dev server URL, confirm
  // Chrome's location) every time, not just on first use or on failure,
  // since "is a dev server actually running right now" is worth
  // re-checking on every connect attempt. `launchNow` is true only when the
  // wizard's final step was answered with "Launch now" specifically --
  // false covers a cancelled wizard AND one that completed but ended on
  // "Edit config file" instead, both of which leave the panel showing its
  // not-yet-connected state, untouched. Same for a wizard that completes but
  // then fails to actually connect (dev server unreachable, bad Chrome path,
  // relay bind failure) -- startLiveTreePipeline resolves `false` rather
  // than rejecting in every one of those cases (it's already shown the user
  // its own actionable toast/webview message), so liveConnectionRequested is
  // reset the same way as a cancelled wizard. Without that reset, the first
  // real-world failure -- most commonly "clicked connect before starting
  // `npm run dev`" -- would permanently wedge this panel: every later retry,
  // whether from the webview's own button or the "Launch Live Rendering"
  // command hitting this same already-open panel, would silently no-op
  // forever against a guard that could only ever have been cleared here.
  //
  // Deliberately does NOT execute any command in response to "Launch now"
  // (that decision belongs to runSetupWizard's OTHER callers, which aren't
  // already mid-connect on a live panel like this one is) -- see
  // connectWithFreshConfig below for the standalone entry points that do
  // need to act on it.
  public async connectToLiveApp(workspaceRoot: string): Promise<void> {
    if (this.mode !== "live" || this.liveConnectionRequested || this.disposed) {
      return;
    }
    this.liveConnectionRequested = true;

    const launchNow = await runSetupWizard(workspaceRoot, this.outputChannel);
    if (this.disposed) {
      return;
    }
    if (!launchNow) {
      this.liveConnectionRequested = false; // let the user try again
      return;
    }

    await this.startConnection(workspaceRoot);
  }

  // For callers that already ran runSetupWizard themselves and got back
  // "Launch now" -- the standalone ReactION.setup command and the
  // start-failure toast's "Configure…" action, both of which reuse the
  // wizard outside of connectToLiveApp's own flow above. Skips the wizard
  // entirely rather than routing through connectToLiveApp, which would
  // otherwise run it a SECOND time back-to-back (the config was just
  // gathered a moment ago). Shares the exact same guard as
  // connectToLiveApp so it's still a no-op against an already-connecting
  // or already-connected panel.
  public async connectWithFreshConfig(workspaceRoot: string): Promise<void> {
    if (this.mode !== "live" || this.liveConnectionRequested || this.disposed) {
      return;
    }
    this.liveConnectionRequested = true;
    await this.startConnection(workspaceRoot);
  }

  // Shared tail end of both connect paths above: load whatever config is
  // on disk right now (fresh, since the wizard may just have changed
  // localhost/executablePath -- the config this panel was constructed with
  // was only ever used to render the webview's initial theme, and is stale
  // by this point) and actually launch Chrome/attach the live pipeline.
  private async startConnection(workspaceRoot: string): Promise<void> {
    const config = loadConfig(workspaceRoot);
    this.page = new Puppeteer(config, createModuleLogger(this.outputChannel, "puppeteer"));
    this.bridge = new DevtoolsBridge(createModuleLogger(this.outputChannel, "devtools-bridge"));

    const connected = await startLiveTreePipeline({
      bridge: this.bridge,
      page: this.page,
      treeWebview: this.treePanel.webview,
      outputChannel: this.outputChannel,
      pushDisposable: (disposable) => this.disposables.push(disposable),
      isDisposed: () => this.disposed,
    });
    if (!connected && !this.disposed) {
      this.liveConnectionRequested = false; // let the user try again
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.mode === "static") {
      if (ViewPanel.currentStaticPanel === this) {
        ViewPanel.currentStaticPanel = undefined;
      }
    } else if (ViewPanel.currentLivePanel === this) {
      ViewPanel.currentLivePanel = undefined;
    }
    void this.page?.close();
    this.bridge?.dispose();
    this.treePanel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
