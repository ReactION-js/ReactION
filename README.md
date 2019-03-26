<h1 align="center">
  <br>
    <img src="https://github.com/jsliapark/ReactION/blob/staging/resources/Text_2.png?raw=true" alt="logo" width="400">
  <br>
  Dedicated React IDE in VS Code
  <br>
  <br>
</h1>

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ReactION-js/ReactION/pulls) 
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ReactION-js/ReactION/LICENSE)

<h4 align="center">A React development enviornment inside your VS Code editor.</h4>

[ReactION](https://github.com/ReactION-js/ReactION/)'s hot-reloading HTML previewer and component visualizer helps you streamline your React development workflow. ReactION is currently in <i>active development</i> so we welcome any constructive feedback or contributions to this product. Please follow this repo for contribution guidelines and our development road map.

## Features in the pipeline
<img src="https://github.com/ReactION-js/ReactION/blob/master/src/ReactION-sample.png" alt="features">
1. No setup required- ReactION requires NO modification to your codebase, but installing the VS Code extension.
2. Works with any React application - ReactION supports React 16.1+ (including React Fiber) and React Router v4.
3. Visualize your app - ReactION shows the current structure of your application in real time on hot reload.
4. Preview your HTML - Live render of your App through the in-editor HTML preview in sync with the tree view.
5. From Tree to Codes - ReactION will open up the React file that is associated with the particular component on the tree view when you click it. 
6. Gain quick insights into your React tree state - the React tree nodes will have different colors based on its current state and props, including the latest component change.
7. Debug your React - With ReactION, you can travel through different state changes of your React application

## Prerequisite
Make sure you have *Google Chrome* installed on your computer. Also, our extension currently only runs in VS Code environment, so make sure you are using VS Code as the code editor.

## Demo of current product
![](src/Demo.gif)

## Current Features  
- [x] React Fiber Tree structure shown inside VS Code (Powered by [Chrome Headless](https://developers.google.com/web/updates/2017/04/headless)).
- [x] Ability to edit components on the HTML preview and see the component hierarchy on the side panel.
- [x] Alternatable theme based on user preference (i.e., Light and Dark).

## In Progress
- [ ] In-editor HTML preview in sync with the tree view
- [ ] Clicking on the node triggering associated React component file
- [ ] Re-rendering on save
- [ ] Node color difference based on its status
- [ ] Time Traveling your React application

## How to Use 
#### [Download Directly from GitHub]  
1. Clone the repo and run ```npm install```
2. Run ```npm run build ```
3. Open VS Code Extension mode by pressing ```F5``` or ```ctr+5```
4. When a new VS Code window pops up, open the React code file that you want to run the extension on
5. ```npm start``` your React file and run your application in ```localhost:3000``` (default) 
6. Run the main extension by clicking on the ReactION logo on the side panel or ```ReactION:Launch```
7. Run the embedded HTML webview version with the command ```cmd + shift + p``` then ```ReactION: Embedded Webview```
8. Enjoy the tree view!

#### [Download From VS Code Marketplace]
You can download the extension directly from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=ReactION-js.ReactION).

## Configuring ReactION's Default Settings  
You can change the following default settings in the Configuration file:
- React Tree View Theme
- Change the server port that ReactION listens to
- Change whether or not to have an external Chrome instance

You can configure ReactION's default settings through the ReactION-config.json file as such:

```json
{
  "system": "darwin",
  "executablePath": "",
  "localhost": "localhost:3000",
  "headless_browser": false,
  "headless_embedded": true,
  "reactTheme": "dark"
}
```

## Built With
- [TypeScript](https://www.typescriptlang.org/) - For the codebase
- [Node.js](https://nodejs.org/en/) - File system, testing, core extension functionality
- [Puppeteer](https://pptr.dev/) - Headless Chrome browser
- [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) - Connection between HTML and tree view
- [React](https://reactjs.org/) - Webview
- [React-D3-Tree](https://github.com/bkrem/react-d3-tree) - Visualize components
- [Mocha](https://mochajs.org/) - Testing
- Love ❤️

## Contributing  
ReactION is currently in beta release. Please let us know about bugs and suggestions at the [issue](https://github.com/ReactION-js/ReactION/issues) section.  Feel free to fork this repo and submit pull requests! 

## Team  
[Andy Tran](http://github.com/andyxtran) |
[Carson Chen](http://github.com/CarsonCYChen) |
[Daniel Wu](http://github.com/wdanni) |
[Jinsung Park](http://github.com/jsliapark) 

## Designer  
[Yoojin Jung](https://github.com/jsliapark/ReactION/blob/staging/resources/Text_2.png)

## License  
MIT - check out [licence](https://github.com/ReactION-js/ReactION/LICENSE) page for more details

