import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { expect as chaiExpect } from 'chai';

// Puppeteer options
const opts: PuppeteerLaunchOptions = {
  headless: false,
  slowMo: 100,
  defaultViewport: null,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
};

describe('sample test', function () {
  let browser: Browser;
  let page: Page;

  // Setup before running the tests
  before(async function () {
    browser = await puppeteer.launch(opts);
    page = await browser.newPage();
    await page.goto('http://localhost:3000');
  });

  // Cleanup after running the tests
  after(async function () {
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
  });

  it('Should have the correct page title', async function () {
    const title = await page.title();
    chaiExpect(title).to.eql('Tree Example');
  });

  it('should have a single content section', async function () {
    const TREE_SELECTOR = '.treeChart';

    await page.waitForSelector(TREE_SELECTOR);

    const elements = await page.$$(TREE_SELECTOR);
    chaiExpect(elements).to.have.lengthOf(1);
  });
});
