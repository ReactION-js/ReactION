import * as assert from 'assert';
import puppeteer from 'puppeteer';
const { describe, it, before } = require('mocha');

describe('on page load', () => {
  it('h1 loads correctly', async () => {
    let browser = await puppeteer.launch({});
    let page = await browser.newPage();
    assert.ok(browser);

    await page.emulate({
      viewport: {
        width: 500,
        height: 2400,
      },
      userAgent: ''
    });

    await browser.close(); // Don't forget to close the browser after tests
  });
});

describe('Simple test suite:', function () {
  it('1 === 1 should be true', function () {
    assert.strictEqual(1, 1);
  });
});
