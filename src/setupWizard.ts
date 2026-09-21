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
// Resolves true when a config was saved (so the caller can advance onboarding
// progress), false when the user cancelled or the write failed.
export async function runSetupWizard(
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel,
): Promise<boolean> {
  const log = createModuleLogger(outputChannel, "setup");
  const config = loadConfig(workspaceRoot);

  // Step 1 -- look for a dev server already listening, so the URL prompt can
  // default to something that actually works instead of a stale guess.
  const detected = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "ReactION: looking for your running React dev server…",
    },
    () =>
      detectDevServerUrl(config.localhost, log, {
        fallbackHosts: COMMON_DEV_SERVER_HOSTS,
        // Longer than the launch-path default: a dev server that compiles
        // on-demand (e.g. Next.js) can be slow to answer its first request,
        // and this path is interactive so the extra wait is acceptable.
        probeTimeoutMs: 1500,
      }),
  );

  const foundRunningServer = detected.source !== "unreachable";
  const suggestedValue = foundRunningServer ? detected.url : toUrl(config.localhost);

  // Step 2 -- confirm/override the dev-server URL.
  const prompt = foundRunningServer
    ? `Found a server running at ${detected.url}. Press Enter to use it, or type a different address.`
    : "Couldn't auto-detect your dev server on the usual ports. If it's running, enter its exact address below — include the port shown in your terminal (for example http://localhost:3000).";

  const enteredUrl = await vscode.window.showInputBox({
    title: "ReactION setup (1 of 2): Dev server URL",
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

  // Step 3 -- make sure we can find Chrome. Only prompt when the configured
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
    // optional step still saves the URL from step 2.
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

  // Step 4 -- offer to launch straight away ("then it loads, then it opens").
  const choice = await vscode.window.showInformationMessage(
    `ReactION is configured for ${toUrl(updated.localhost)}.`,
    "Launch now",
    "Edit config file",
  );
  if (choice === "Launch now") {
    void vscode.commands.executeCommand("ReactION.openTree");
  } else if (choice === "Edit config file") {
    const doc = await vscode.workspace.openTextDocument(configFilePath(workspaceRoot));
    void vscode.window.showTextDocument(doc);
  }

  return true;
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
