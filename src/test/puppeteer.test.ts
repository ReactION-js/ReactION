import * as assert from "node:assert";
import puppeteer from "puppeteer-core";

// Integration smoke test. Requires Chrome; set CHROME_PATH to override the path.
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("puppeteer smoke test", function () {
  this.timeout(30_000);

  it("launches Chrome and opens a page", async () => {
    const browser = await puppeteer.launch({ executablePath });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 600 });
      assert.ok(page);
    } finally {
      await browser.close();
    }
  });
});
