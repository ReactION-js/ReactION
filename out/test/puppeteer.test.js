"use strict";
//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'assert' provides assertion methods from node
const assert = require("assert");
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
const Puppeteer_1 = require("../Puppeteer");
const pptr = new Puppeteer_1.default();
// Defines a Mocha test suite to group tests of similar kind together
suite("Puppeteer Tests", function () {
    // Defines a Mocha unit test
    test("Running on Local 3000", function () {
        assert.equal('http://localhost:3000', pptr._url);
    });
});
//# sourceMappingURL=puppeteer.test.js.map