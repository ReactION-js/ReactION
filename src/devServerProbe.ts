import * as http from "http";
import * as https from "https";
import type { LogFn } from "./logging";

const DEFAULT_FALLBACK_HOSTS = ["localhost:5173", "localhost:8080"];
const DEFAULT_PROBE_TIMEOUT_MS = 400;

function normalizeUrl(host: string): string {
  return /^https?:\/\//i.test(host) ? host : `http://${host}`;
}

// Configured host always comes first (an explicit user setting is never
// second-guessed); a fallback identical to it is dropped so it isn't probed
// twice (e.g. config.localhost already being "localhost:8080").
export function buildProbeCandidates(
  configuredHost: string,
  fallbackHosts: string[] = DEFAULT_FALLBACK_HOSTS,
): string[] {
  const configuredUrl = normalizeUrl(configuredHost);
  const candidates = [configuredUrl];
  for (const fallbackHost of fallbackHosts) {
    const fallbackUrl = normalizeUrl(fallbackHost);
    if (!candidates.includes(fallbackUrl)) {
      candidates.push(fallbackUrl);
    }
  }
  return candidates;
}

// Cheap reachability probe: a plain HTTP(S) GET with a short timeout, NOT a
// full Puppeteer page load (which is far more expensive per candidate). Any
// response at all -- including a non-2xx status -- counts as "reachable":
// this only answers "is something listening and speaking HTTP here", not
// "does this route exist".
function probeUrl(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(reachable);
    };

    try {
      const client = url.startsWith("https:") ? https : http;
      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        res.destroy();
        finish(true);
      });
      req.on("timeout", () => {
        req.destroy();
        finish(false);
      });
      req.on("error", () => {
        finish(false);
      });
    } catch {
      finish(false);
    }
  });
}

export type DevServerProbeSource = "configured" | "fallback" | "unreachable";

export interface DevServerProbeResult {
  url: string;
  source: DevServerProbeSource;
}

export interface DevServerProbeOptions {
  probeTimeoutMs?: number;
  fallbackHosts?: string[];
}

// Probes config.localhost first; only when it doesn't answer within the
// per-candidate timeout does this try the fallback candidates, in priority
// order, stopping at the first reachable one -- so a healthy configured
// dev server never pays for probing anything else. If nothing answers within
// the whole pass (most likely: the dev server is still booting), this falls
// back to the ORIGINAL configured URL so the existing, much longer
// gotoWithRetry loop still owns that case unchanged: a cold start must never
// get slower because of this probe.
export async function detectDevServerUrl(
  configuredHost: string,
  log: LogFn,
  options: DevServerProbeOptions = {},
): Promise<DevServerProbeResult> {
  const { probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS, fallbackHosts = DEFAULT_FALLBACK_HOSTS } =
    options;
  const candidates = buildProbeCandidates(configuredHost, fallbackHosts);
  const configuredUrl = candidates[0];

  const configuredReachable = await probeUrl(configuredUrl, probeTimeoutMs);
  log(`Dev-server probe: ${configuredUrl} -> ${configuredReachable ? "reachable" : "no response"}`);
  if (configuredReachable) {
    log(`Dev-server URL: using ${configuredUrl} (config default reachable)`);
    return { url: configuredUrl, source: "configured" };
  }

  for (const fallbackUrl of candidates.slice(1)) {
    const reachable = await probeUrl(fallbackUrl, probeTimeoutMs);
    log(`Dev-server probe: ${fallbackUrl} -> ${reachable ? "reachable" : "no response"}`);
    if (reachable) {
      log(`Dev-server URL: config default unreachable, falling back to ${fallbackUrl}`);
      return { url: fallbackUrl, source: "fallback" };
    }
  }

  log(
    `Dev-server URL: no candidate reachable within probe pass; using configured ${configuredUrl} and falling back to the normal retry/wait`,
  );
  return { url: configuredUrl, source: "unreachable" };
}
