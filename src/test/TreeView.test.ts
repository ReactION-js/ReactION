import * as assert from "node:assert";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

// End-to-end test against a running app. Requires Chrome and the sample React
// app. Override with CHROME_PATH and REACTION_APP_URL as needed.
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const appUrl = process.env.REACTION_APP_URL ?? "http://localhost:3000";

describe("rendered component tree", function () {
  this.timeout(30_000);

  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await puppeteer.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  });

  after(async () => {
    await browser?.close();
  });

  it("renders a single tree chart container", async () => {
    await page.waitForSelector(".treeChart");
    const elements = await page.$$(".treeChart");
    assert.strictEqual(elements.length, 1);
  });
});
