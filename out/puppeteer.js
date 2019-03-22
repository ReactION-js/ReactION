"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer = require('puppeteer-core');
class Puppeteer {
    // Default properties for the Puppeteer class.
    constructor(parseInfo) {
        this._headless = false;
        this._executablePath = parseInfo.executablePath;
        this._pipe = true;
        this._url = parseInfo.localhost;
        this._page = '';
        this._browser = '';
    }
    // Creates an instance of puppeteer browser and page,
    // opens to _url, defaults to localhost:3000
    async start() {
        this._browser = await puppeteer.launch({
            headless: this._headless,
            executablePath: this._executablePath,
            pipe: this._pipe,
        }).catch((err) => console.log(err));
        this._page = await this._browser.pages()
            .then((pageArr) => {
            return pageArr[0];
        });
        this._page.goto(this._url);
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
                            "display": "none",
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