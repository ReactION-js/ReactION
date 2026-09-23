import * as vscode from "vscode";
import type DevtoolsBridge from "./devtoolsBridge";
import { describeStartFailure, describeStartFailureBrief, errorDetail } from "./puppeteer";
import { wireBridgeToWebview } from "./bridgeWiring";
import { wireEmptyStateDiagnostics } from "./diagnosticsWiring";
import { wireConnectionResilience, type ResilientPage } from "./connectionResilience";
import { createModuleLogger } from "./outputChannelLogger";

// The subset of Puppeteer this pipeline drives -- narrower than the concrete
// class (which has private fields a plain object literal can't satisfy, see
// connectionResilience.ts's own ResilientPage for the same reasoning) so a
// unit test can supply a lightweight fake instead of launching a real Chrome.
export interface LiveTreePipelinePage extends ResilientPage {
  start(relayPort: number): Promise<void>;
  close(): Promise<void>;
  readonly connectedUrl: string;
}

export interface LiveTreePipelineOptions {
  bridge: DevtoolsBridge;
  page: LiveTreePipelinePage;
  treeWebview: vscode.Webview;
  outputChannel: vscode.OutputChannel;
  pushDisposable: (disposable: vscode.Disposable) => void;
  // By the time this ever reports true, the caller's own dispose() has
  // already run synchronously (and so already closed `page`/`bridge` itself)
  // -- this pipeline's own teardown on that path is defensive, not load-
  // bearing.
  isDisposed: () => boolean;
}

// The opt-in "connect to live app" sequence ViewPanel.connectToLiveApp() runs
// once the user asks for it (never automatically -- see ViewPanel.ts's own
// comment on why Chrome shouldn't launch on every panel open): start the
// relay, wire the tree webview to it, launch Chrome, then wire empty-state
// diagnostics and connection resilience against the URL actually reached.
// Source-opening/coverage-analysis/the static composition tree are wired
// separately, by ViewPanel's constructor, since none of them need this --
// they work from panel open, with no live connection at all. Kept as a
// standalone function (rather than a ViewPanel method) so it stays unit-
// testable against a fake page/webview.
//
// Resolves `true` once every stage actually completes (Chrome reached the
// dev server, resilience/diagnostics wired), `false` if it bailed out early
// for any reason -- a relay bind failure, page.start() failing (dev server
// unreachable, bad Chrome path), or the panel being disposed mid-flow. Every
// early-return branch already shows the user its own actionable toast/
// webview message before returning `false`; the boolean itself exists so
// ViewPanel.connectToLiveApp can tell "still trying to connect" apart from
// "gave up" and let the user retry in the latter case, rather than this
// pipeline's own failure toast being the only sign anything went wrong.
export async function startLiveTreePipeline(options: LiveTreePipelineOptions): Promise<boolean> {
  const { bridge, page, treeWebview, outputChannel, pushDisposable, isDisposed } = options;

  let relayPort: number;
  try {
    relayPort = await bridge.start();
  } catch (error) {
    // Reuses puppeteer.ts's errorDetail() rather than a second copy: a relay
    // bind/startup failure can reject with a non-Error value (the same
    // realistic Node-rejection shapes that helper guards against), and
    // String() on those collapses to "[object Object]" or the literal word
    // "undefined" -- the exact bug already fixed twice elsewhere in this
    // codebase for this same class of error text.
    const detail = errorDetail(error);
    createModuleLogger(outputChannel, "devtools-bridge")(`Relay failed to start: ${detail}`);
    // A panel closed while the relay was still binding can itself surface as
    // a rejection here (dispose() closes the not-yet-listening server); that
    // is not a real failure worth a toast for a panel nobody is looking at
    // anymore, mirroring the disposed guard around page.start() below.
    if (!isDisposed()) {
      void vscode.window
        .showErrorMessage(`ReactION: could not start the DevTools relay. ${detail}`, "Show Log")
        .then((choice) => {
          if (choice === "Show Log") {
            outputChannel.show();
          }
        });
    }
    bridge.dispose();
    return false;
  }

  if (isDisposed()) {
    // Panel was closed while the relay was still binding; nothing else has
    // been created yet, so there's only the bridge itself to tear down.
    bridge.dispose();
    return false;
  }

  pushDisposable(wireBridgeToWebview(bridge, treeWebview));

  try {
    await page.start(relayPort);
  } catch (error) {
    if (!isDisposed()) {
      // Tell the webview too, so the empty panel shows an actionable "start
      // your dev server" message instead of an endless "Connecting…" -- the
      // toast alone is easy to miss and doesn't explain the blank tree.
      void treeWebview.postMessage({ type: "start-failed", ...describeStartFailureBrief(error) });
      // "Configure…" jumps straight to the setup wizard so the most common
      // failure (wrong URL / dev server not running) is one click from the
      // fix, not a hunt through reactION-config.json.
      void vscode.window
        .showErrorMessage(describeStartFailure(error), "Configure…", "Show Log")
        .then((choice) => {
          if (choice === "Show Log") {
            outputChannel.show();
          } else if (choice === "Configure…") {
            void vscode.commands.executeCommand("ReactION.setup");
          }
        });
    }
    return false;
  }

  if (isDisposed()) {
    // Panel was closed while Chrome was launching; tear down the browser.
    void page.close();
    return false;
  }

  pushDisposable(
    wireEmptyStateDiagnostics(
      treeWebview,
      createModuleLogger(outputChannel, "webview"),
      page.connectedUrl,
    ),
  );

  pushDisposable(
    wireConnectionResilience({
      bridge,
      page,
      url: page.connectedUrl,
      log: createModuleLogger(outputChannel, "resilience"),
      isTornDown: isDisposed,
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

  return true;
}
