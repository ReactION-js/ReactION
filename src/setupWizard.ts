import * as fs from "fs";
import * as vscode from "vscode";
import { configFilePath, loadConfig, saveConfig, toUrl } from "./config";
import { detectDevServerUrl } from "./devServerProbe";
import { createModuleLogger } from "./outputChannelLogger";

// Common dev-server ports across the popular React toolchains, so the wizard's
// auto-detect finds a running app even when it isn't on the configured port.
// The configured host is always probed first (see detectDevServerUrl); these
// are only tried if it doesn't answer, and a closed port refuses instantly, so
// a broad list stays cheap.
const COMMON_DEV_SERVER_HOSTS = [
  "localhost:3000", // Create React App, Next.js, Remix
  "localhost:3001",
  "localhost:3002",
  "localhost:5173", // Vite
  "localhost:5174",
  "localhost:8080", // webpack-dev-server
  "localhost:8000", // Gatsby, others
  "localhost:4200", // Angular-style
  "localhost:4321", // Astro
  "localhost:1234", // Parcel
  "localhost:5000",
  "localhost:9000",
];

// Accepts "localhost:3000", "127.0.0.1:3000", "example.com", or a full
// http(s) URL. Returns an error string for VS Code's validateInput (which
// treats a string as "invalid, show this") or undefined when the value is OK.
function validateHostInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "Enter the URL your React dev server runs on, e.g. localhost:3000.";
  }
  try {
    const url = new URL(toUrl(trimmed));
    if (!url.hostname) {
      return "That doesn't look like a valid address. Try something like localhost:3000.";
    }
    return undefined;
  } catch {
    return "That doesn't look like a valid address. Try something like localhost:3000.";
  }
}

// Interactive first-run/setup flow: find the running dev server, confirm the
// URL, make sure Chrome is locatable, save it all to reactION-config.json, and
// offer to launch. Reused by the ReactION.setup command, the Launch view's
// "Configure" button, and the start-failure toast's "Configure…" action.
// Resolves true when the config was saved AND the user picked "Launch now"
// specifically; false when the user cancelled, the write failed, or they
// used the final step's "Edit config file" action without ever picking
// "Launch now".
export async function runSetupWizard(
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel,
): Promise<boolean> {
  const log = createModuleLogger(outputChannel, "setup");
  const config = loadConfig(workspaceRoot);

  // Step 1 -- one combined "start your dev server, then confirm its
  // address" step. Looks for a dev server already listening first, so the
  // URL prompt can default to something that actually works instead of a
  // stale guess; when nothing answers, the prompt itself reminds the user
  // to start their dev server and defaults to config.localhost
  // (localhost:3000 out of the box, see config.ts) instead. Shown as a busy
  // Quick Input in the same top-center spot the editable box below takes
  // right after, with the same title, so it reads as one step that starts
  // busy and then becomes editable, not two.
  const detectingPick = vscode.window.createQuickPick();
  detectingPick.title = "ReactION setup (1 of 2): Dev server";
  detectingPick.placeholder = "Looking for your running React dev server…";
  detectingPick.busy = true;
  detectingPick.enabled = false;
  detectingPick.ignoreFocusOut = true;
  detectingPick.show();

  const detected = await detectDevServerUrl(config.localhost, log, {
    fallbackHosts: COMMON_DEV_SERVER_HOSTS,
    // Longer than the launch-path default: a dev server that compiles
    // on-demand (e.g. Next.js) can be slow to answer its first request,
    // and this path is interactive so the extra wait is acceptable.
    probeTimeoutMs: 1500,
  }).finally(() => detectingPick.dispose());

  const foundRunningServer = detected.source !== "unreachable";
  const suggestedValue = foundRunningServer ? detected.url : toUrl(config.localhost);

  const prompt = foundRunningServer
    ? `Found a server running at ${detected.url}. Press Enter to use it, or type a different address.`
    : "Start your dev server (e.g. npm run dev or npm start), then confirm its address above — include the port shown in your terminal, or press Enter to use the default.";

  const enteredUrl = await vscode.window.showInputBox({
    title: "ReactION setup (1 of 2): Dev server",
    prompt,
    value: suggestedValue,
    valueSelection: [0, suggestedValue.length],
    placeHolder: "http://localhost:3000",
    ignoreFocusOut: true,
    validateInput: validateHostInput,
  });

  // Cancelled (Escape) -- leave config untouched.
  if (enteredUrl === undefined) {
    return false;
  }

  // Step 2 -- make sure we can find Chrome. Only prompt when the configured
  // binary is missing (empty on Linux by default, or moved/uninstalled), so
  // users whose Chrome is in the standard place never see this step.
  let executablePath = config.executablePath;
  if (executablePath === "" || !fileExists(executablePath)) {
    const enteredPath = await vscode.window.showInputBox({
      title: "ReactION setup (2 of 2): Chrome location",
      prompt:
        "ReactION drives a real Chrome/Chromium. We couldn't find it at the configured path — " +
        "enter the full path to your browser binary.",
      value: executablePath,
      placeHolder: chromePlaceholder(),
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() === "" || fileExists(value.trim())
          ? undefined
          : "No file exists at that path. Double-check the location of your Chrome/Chromium binary.",
    });
    // Only overwrite when the user actually provided a path; cancelling this
    // optional step still saves the URL from step 1.
    if (enteredPath !== undefined && enteredPath.trim() !== "") {
      executablePath = enteredPath.trim();
    }
  }

  const updated = { ...config, localhost: enteredUrl.trim(), executablePath };
  try {
    saveConfig(workspaceRoot, updated);
  } catch (error) {
    log(`Failed to save config: ${String(error)}`);
    void vscode.window.showErrorMessage(
      `ReactION: couldn't write ${configFilePath(workspaceRoot)}. ${String(error)}`,
    );
    return false;
  }
  log(`Saved config: localhost=${updated.localhost}, executablePath=${updated.executablePath}`);

  // Step 3 -- offer to launch straight away ("then it loads, then it opens").
  // createQuickPick (not the showQuickPick convenience wrapper) because
  // "Edit config file" is a side action, not a final choice: picking it
  // opens the file but deliberately leaves this picker open, so the user
  // can go tweak something and still come back to "Launch now" without
  // restarting the whole wizard. Only "Launch now" (via picker.hide()) or
  // dismissing (Escape) ends it, and both funnel through the single
  // onDidHide below -- the only place that resolves/disposes, so there's
  // no re-entrancy to guard against. Each item's explanation is folded
  // into its own label with a " - " separator, rather than QuickPickItem's
  // separate `description` field (which reads as a dim, secondary
  // annotation, not part of the choice itself).
  type LaunchChoice = vscode.QuickPickItem & { id: "launch" | "edit" };
  const launchNow = await new Promise<boolean>((resolve) => {
    const picker = vscode.window.createQuickPick<LaunchChoice>();
    picker.title = "ReactION setup: ready to launch";
    picker.placeholder = `Configured for ${toUrl(updated.localhost)}.`;
    picker.ignoreFocusOut = true;
    picker.items = [
      { id: "launch", label: "Launch now - opens a live browser session and starts analyzing." },
      {
        id: "edit",
        label: "Edit config file - opens reactION-config.json so you can change settings by hand.",
      },
    ];
    let selectedLaunch = false;
    picker.onDidAccept(() => {
      const selected = picker.selectedItems[0]?.id;
      if (selected === "launch") {
        selectedLaunch = true;
        picker.hide();
      } else if (selected === "edit") {
        void vscode.workspace.openTextDocument(configFilePath(workspaceRoot)).then((doc) => {
          void vscode.window.showTextDocument(doc);
        });
        // Deliberately no hide() here -- see this step's own comment.
      }
    });
    picker.onDidHide(() => {
      picker.dispose();
      resolve(selectedLaunch);
    });
    picker.show();
  });

  // A pure "gather config" helper: reports the user's final choice back to
  // the caller instead of acting on it directly. This wizard is reused by
  // three entry points -- ViewPanel.connectToLiveApp (already mid-connect
  // on an open live panel), the standalone ReactION.setup command, and the
  // start-failure toast's "Configure…" action -- and each needs to decide
  // for itself what "the user picked Launch now" should do from wherever
  // IT was called from. Executing a launch command unconditionally here
  // would cause the whole wizard to run a second time whenever this
  // function is reached from a caller that hasn't already guarded against
  // re-entry (see ViewPanel.ts's connectWithFreshConfig for how the
  // standalone entry points launch without re-prompting).
  return launchNow;
}

function fileExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function chromePlaceholder(): string {
  switch (process.platform) {
    case "darwin":
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    case "win32":
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    default:
      return "/usr/bin/google-chrome";
  }
}
