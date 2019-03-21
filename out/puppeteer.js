"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer = require('puppeteer');
const pptr = require('puppeteer-core');
const chromeLauncher = require('chrome-launcher');
const request = require('request');
const util = require('util');
const path = require('path');
const fs = require('fs');
// const userConfigPath = path.join(vscode.workspace.rootPath,"reactION-config.json");
// need to wait for config file to be created in user's work directory if not found
// const intvl = setInterval(function() {
// 	if (fs.stat(userConfigPath)) {
// 		clearInterval(intvl);
// 	}
// }, 500)
class Puppeteer {
    // Default properties for the Puppeteer class.
    constructor(parseInfo) {
        // console.log('parse info in pptr', parseInfo)
        // console.log('config path', userConfigPath)
        // const configs = JSON.parse(fs.readFileSync(userConfigPath));
        // console.log(configs);
        this._headless = false;
        this._executablePath = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
        this._pipe = true;
        this._url = parseInfo.localhost;
        this._page = '';
        this._browser = '';
    }
    // Creates an instance of puppeteer browser and page,
    // opens to _url, defaults to localhost:3000
    async start() {
        // console.log('before chrome launch');
        // const chrome = await chromeLauncher.launch({
        // 	startingUrl: this._url,
        // 	chromeFlags: ['--disable-gpu', '--no-sandbox'],
        // 	headless: true
        // });
        // console.log('after chrome launch', chrome.port);
        // const resp = await util.promisify(request)(`http://localhost:${chrome.port}/json/version`);
        // console.log(resp, 'hereeee')
        // const { webSocketDebuggerUrl } = JSON.parse(resp.body);
        // console.log(webSocketDebuggerUrl, 'heasdfadsfksh;kreeee')
        // this._browser = await pptr.connect({ browserWSEndpoint: webSocketDebuggerUrl });
        // console.log('ok....');
        // this._page = await this._browser.pages()
        // 	.then((pageArr: any) => {
        // 			return pageArr[0];
        // 	});
        // const resp = util.promisify(request)
        this._browser = await pptr.launch({
            headless: this._headless,
            executablePath: this._executablePath,
            pipe: this._pipe,
        }).catch((err) => console.log(err));
        // 	const targets = await browser.targets();
        // const backgroundPageTarget = targets.find(target => target.type() === 'background_page');
        // const backgroundPage = await backgroundPageTarget.page();
        this._page = await this._browser.pages()
            .then((pageArr) => {
            return pageArr[0];
        });
        this._page.goto(this._url, { waitUntil: 'networkidle0' });
        // this._page.on('console', (log: any) => console.log('mutation'));
        // await this._page.evaluate(() => {
        // 	const target = document.documentElement;
        // 	var mutationObserver = new MutationObserver(function(mutations) {
        // 		mutations.forEach(function(mutation) {
        // 			console.log(mutation);
        // 		});
        // 	});
        // 	const config = {
        // 		attributes: true,
        // 		characterData: true,
        // 		childList: true,
        // 		subtree: true,
        // 		attributeOldValue: true,
        // 		characterDataOldValue: true
        // 	}
        // 	return mutationObserver.observe(target, config)
        //  })
        return await this._page;
    }
    // Recursive React component scraping algorithm
    scrape() {
        // All code inside .evaluate is executed in the pages context
        const reactData = this._page.evaluate(async () => {
            // Access the React Dom
            // & create entry point for fiber node through DOM element
            const _entry = (() => {
                // @ts-ignore
                const domElements = document.querySelector('body').children;
                for (let el of domElements) {
                    // @ts-ignore
                    if (el._reactRootContainer) {
                        // @ts-ignore
                        return el._reactRootContainer._internalRoot.current;
                    }
                }
            })();
            // Define function that traverses the fiber tree, starting from the entry point
            function fiberWalk(entry) {
                let dataArr = [], globalId = 1;
                // Recursively traversing through the fiber tree, pushing the node object into the dataArr array
                function traverse(root, level, parentId) {
                    if (root.sibling !== null) {
                        globalId += 1;
                        dataArr.push({
                            "name": root.sibling,
                            "level": `${level}`,
                            "id": `${globalId}`,
                            "parentId": `${parentId}`,
                            "props": Object.keys(root.sibling.memoizedProps)
                        });
                        traverse(root.sibling, level, parentId);
                    }
                    if (root.child !== null) {
                        parentId += 1;
                        globalId += 1;
                        dataArr.push({
                            "name": root.child,
                            "level": `${level}`,
                            "id": `${globalId}`,
                            "parentId": `${parentId}`,
                            "props": Object.keys(root.child.memoizedProps)
                        });
                        traverse(root.child, level + 1, parentId);
                    }
                }
                traverse(entry, 0, 0);
                // Extracts the type name of each fiber node
                dataArr.forEach((el) => {
                    if (typeof el.name.type === null) {
                        el.name = '';
                    }
                    else if (typeof el.name.type === 'function' && el.name.type.name) {
                        el.name = el.name.type.name;
                    }
                    else if (typeof el.name.type === 'function') {
                        el.name = 'function';
                    }
                    else if (typeof el.name.type === 'object') {
                        el.name = 'function';
                    }
                    else if (typeof el.name.type === 'string') {
                        el.name = el.name.type;
                    }
                });
                // Setting root parent to an empty string
                dataArr[0].parentId = '';
                return dataArr;
            }
            return fiberWalk(_entry);
        }).catch((err) => { console.log(err); });
        return reactData;
    }
}
exports.default = Puppeteer;
//# sourceMappingURL=Puppeteer.js.map