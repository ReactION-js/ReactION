"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const { describe, it, before } = require('mocha');
describe('on page load', () => {
    it('h1 loads correctly', async () => {
        let browser = await puppeteer_1.default.launch({});
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
//# sourceMappingURL=puppeteer.test.js.map