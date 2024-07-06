import { Browser } from 'puppeteer';
import { expect as chaiExpect } from 'chai';

declare global {
  var browser: Browser;
  var expect: typeof chaiExpect;
}

export {};
