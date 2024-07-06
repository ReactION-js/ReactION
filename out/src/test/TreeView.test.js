"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const chai_1 = require("chai");
// Puppeteer options
const opts = {
    headless: false,
    slowMo: 100,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
};
describe('sample test', function () {
    let browser;
    let page;
    // Setup before running the tests
    before(async function () {
        browser = await puppeteer_1.default.launch(opts);
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
        (0, chai_1.expect)(title).to.eql('Tree Example');
    });
    it('should have a single content section', async function () {
        const TREE_SELECTOR = '.treeChart';
        await page.waitForSelector(TREE_SELECTOR);
        const elements = await page.$$(TREE_SELECTOR);
        (0, chai_1.expect)(elements).to.have.lengthOf(1);
    });
});
//# sourceMappingURL=TreeView.test.js.map