import * as assert from "node:assert";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { buildProbeCandidates, detectDevServerUrl } from "../devServerProbe";

function startServer(): Promise<{ server: http.Server; host: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({ server, host: `127.0.0.1:${address.port}` });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// Nothing listens here, and connecting refuses near-instantly (loopback, no
// firewall round trip) -- deterministic "unreachable" without depending on
// the real 5173/8080 being free in whatever environment runs this test.
const UNREACHABLE_HOST = "127.0.0.1:1";

suite("devServerProbe.buildProbeCandidates", () => {
  test("puts the configured host first, normalized to a URL", () => {
    const candidates = buildProbeCandidates("localhost:3000", ["localhost:8080"]);
    assert.deepStrictEqual(candidates, ["http://localhost:3000", "http://localhost:8080"]);
  });

  test("drops a fallback that duplicates the configured host", () => {
    const candidates = buildProbeCandidates("localhost:8080", ["localhost:8080", "localhost:5173"]);
    assert.deepStrictEqual(candidates, ["http://localhost:8080", "http://localhost:5173"]);
  });

  test("leaves an already-absolute configured URL unchanged", () => {
    const candidates = buildProbeCandidates("https://localhost:3000", ["localhost:5173"]);
    assert.deepStrictEqual(candidates, ["https://localhost:3000", "http://localhost:5173"]);
  });
});

suite("devServerProbe.detectDevServerUrl", () => {
  test("chooses the configured URL when it is reachable, without probing fallbacks", async function () {
    this.timeout(10_000);
    const configured = await startServer();
    const fallback = await startServer();
    try {
      const lines: string[] = [];
      const result = await detectDevServerUrl(configured.host, (m) => lines.push(m), {
        probeTimeoutMs: 300,
        fallbackHosts: [fallback.host],
      });

      assert.strictEqual(result.source, "configured");
      assert.strictEqual(result.url, `http://${configured.host}`);
      assert.ok(
        !lines.some((line) => line.includes(fallback.host)),
        `fallback ${fallback.host} should never have been probed once the configured host answered; log:\n${lines.join("\n")}`,
      );
    } finally {
      await closeServer(configured.server);
      await closeServer(fallback.server);
    }
  });

  test("falls back to a reachable alternate port when the configured URL is not reachable", async function () {
    this.timeout(10_000);
    const fallback = await startServer();
    try {
      const lines: string[] = [];
      const result = await detectDevServerUrl(UNREACHABLE_HOST, (m) => lines.push(m), {
        probeTimeoutMs: 300,
        fallbackHosts: [fallback.host],
      });

      assert.strictEqual(result.source, "fallback");
      assert.strictEqual(result.url, `http://${fallback.host}`);
      assert.ok(lines.some((line) => line.includes(UNREACHABLE_HOST)));
      assert.ok(lines.some((line) => line.includes(fallback.host)));
    } finally {
      await closeServer(fallback.server);
    }
  });

  test("falls back to the original configured URL (not a fallback) when nothing is reachable", async function () {
    this.timeout(10_000);
    const lines: string[] = [];
    const result = await detectDevServerUrl(UNREACHABLE_HOST, (m) => lines.push(m), {
      probeTimeoutMs: 300,
      fallbackHosts: ["127.0.0.1:2"],
    });

    assert.strictEqual(result.source, "unreachable");
    assert.strictEqual(result.url, `http://${UNREACHABLE_HOST}`);
    assert.ok(lines.some((line) => line.includes("falling back to the normal retry/wait")));
  });
});
