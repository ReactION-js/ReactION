
const puppeteer = require('puppeteer')
const { expect } = require('chai');
const _ = require('lodash');
const globalVariables = _.pick(global, ['browser', 'expect']);

// puppeteer options
const opts = {
  headless: false,
  slowMo: 100,
  timeout: 10000
};

// expose variables
before(async function () {
  global.expect = expect;
  global.browser = await puppeteer.launch(opts);
});

// close browser and reset global variables
after(function () {
  browser.close();

  global.browser = globalVariables.browser;
  global.expect = globalVariables.expect;
});

describe('sample test', function () {
  let page;

  before(async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:3000');
  })

  after(async () => {
    await page.close();
  })

  it('Should have the correct page title', async () => {
    expect(await page.title()).to.eql('Tree Example');
  });

  it('should have a single content section', async function () {
    const TREE_SELECTOR = '.treeChart';

    await page.waitFor(TREE_SELECTOR);

    expect(await page.$$(TREE_SELECTOR)).to.have.lengthOf(1);
  });
});

