import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface ReactionConfig {
  system: NodeJS.Platform;
  executablePath: string;
  localhost: string;
  headless_browser: boolean;
  reactTheme: "light" | "dark";
}

const CONFIG_FILENAME = "reactION-config.json";

// Absolute path to the workspace's reactION-config.json -- exported so the
// setup wizard can write to (and open) the same file loadConfig() reads.
export function configFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONFIG_FILENAME);
}

// Best-guess Chrome location per platform; Linux has no reliable default.
function defaultExecutablePath(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    case "win32":
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    default:
      return "";
  }
}

export function defaultConfig(): ReactionConfig {
  const system = process.platform;
  return {
    system,
    executablePath: defaultExecutablePath(system),
    localhost: "localhost:3000",
    headless_browser: false,
    reactTheme: "dark",
  };
}

// Loads reactION-config.json from the workspace root, creating it with defaults
// when absent. Reads synchronously so config is ready before any command runs.
export function loadConfig(workspaceRoot: string): ReactionConfig {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);
  const defaults = defaultConfig();

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, "\t"));
    if (defaults.executablePath === "") {
      void vscode.window.showInformationMessage(
        `ReactION: set "executablePath" to your Chrome binary in ${CONFIG_FILENAME}.`,
      );
    }
    return defaults;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(configPath, "utf8"),
    ) as Partial<ReactionConfig>;
    return { ...defaults, ...parsed };
  } catch (error) {
    void vscode.window.showErrorMessage(
      `ReactION: could not parse ${CONFIG_FILENAME}, using defaults. ${String(error)}`,
    );
    return defaults;
  }
}

// Persists config back to reactION-config.json (used by the setup wizard).
// Writes the full object with the same tab indentation loadConfig() creates,
// so a hand-edited file and a wizard-written one stay formatted identically.
export function saveConfig(workspaceRoot: string, config: ReactionConfig): void {
  fs.writeFileSync(configFilePath(workspaceRoot), JSON.stringify(config, null, "\t"));
}

// Normalizes a host such as "localhost:3000" into a navigable URL.
export function toUrl(localhost: string): string {
  return /^https?:\/\//i.test(localhost) ? localhost : `http://${localhost}`;
}
