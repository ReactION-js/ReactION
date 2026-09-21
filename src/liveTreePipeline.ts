import * as vscode from "vscode";
import type DevtoolsBridge from "./devtoolsBridge";
import { describeStartFailure, errorDetail } from "./puppeteer";
import { wireBridgeToWebview } from "./bridgeWiring";
import { wireSourceOpening } from "./sourceOpeningWiring";
import { wireCoverageAnalysis } from "./coverageAnalysisWiring";
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
  workspaceRoot: string;
  outputChannel: vscode.OutputChannel;
  pushDisposable: (disposable: vscode.Disposable) => void;
  // By the time this ever reports true, the caller's own dispose() has
  // already run synchronously (and so already closed `page`/`bridge` itself)
  // -- this pipeline's own teardown on that path is defensive, not load-
  // bearing.
  isDisposed: () => boolean;
}

// The startup sequence ViewPanel.start()/EmbeddedViewPanel.start() both ran
// byte-for-byte identically: start the relay, wire the tree webview to it and
// to source-opening/coverage-analysis, launch Chrome, then wire empty-state
// diagnostics and connection resilience against the URL actually reached.
// Nothing here needs EmbeddedViewPanel's extra htmlPanel field, so one shared
// function serves both panels.
export async function startLiveTreePipeline(options: LiveTreePipelineOptions): Promise<void> {
  const { bridge, page, treeWebview, workspaceRoot, outputChannel, pushDisposable, isDisposed } =
    options;

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
    return;
  }

  if (isDisposed()) {
    // Panel was closed while the relay was still binding; nothing else has
    // been created yet, so there's only the bridge itself to tear down.
    bridge.dispose();
    return;
  }

  pushDisposable(wireBridgeToWebview(bridge, treeWebview));
  pushDisposable(wireSourceOpening(treeWebview, workspaceRoot));
  pushDisposable(wireCoverageAnalysis(treeWebview, workspaceRoot));

  try {
    await page.start(relayPort);
  } catch (error) {
    if (!isDisposed()) {
      void vscode.window
        .showErrorMessage(describeStartFailure(error), "Show Log")
        .then((choice) => {
          if (choice === "Show Log") {
            outputChannel.show();
          }
        });
    }
    return;
  }

  if (isDisposed()) {
    // Panel was closed while Chrome was launching; tear down the browser.
    void page.close();
    return;
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
}
