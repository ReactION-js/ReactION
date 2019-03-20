"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const puppeteer = require('puppeteer');
const { describe, it, before } = require('mocha');
const { expect } = require('chai');
const global = undefined;
describe('on page load', () => {
    test('h1 loads correctly', async () => {
        let browser = await puppeteer.launch({});
        let page = await browser.newPage();
        assert(browser);
        page.emulate({
            viewport: {
                width: 500,
                height: 2400,
            },
            userAgent: ''
        });
    });
});
describe('Simple test suite:', function () {
    it('1 === 1 should be true', function () {
        assert(1 === 1);
    });
});
//# sourceMappingURL=puppeteer.test.js.map