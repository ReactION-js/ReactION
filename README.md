<h1 align="center">
  <br>
    <img src="https://github.com/jsliapark/ReactION/blob/staging/resources/Text_2.png?raw=true" alt="logo" width="400">
  <br>
  React Component Visualizer for VS Code
  <br>
  <br>
</h1>

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ReactION-js/ReactION/pulls) 
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ReactION-js/ReactION/LICENSE)

<h4 align="center">A real-time React component visualizer inside your editor.</h4>

[ReactION](https://github.com/ReactION-js/ReactION/) enables you to view the React component tree inside your editor, making it easier for you to develop React applications. [ReactION](https://github.com/ReactION-js/ReactION/) is powered by [Chrome Headless](https://developers.google.com/web/updates/2017/04/headless-chrome), and works by starting a headless Chrome instance in a new process. This enables a secure way to render web content inside VS Code, and enables interesting features such as in-editor debugging and more!

![](resources/demo.gif)

#### ReactION is in active development. Please follow this repo for contribution guidelines and our development road map.


## Setup
| ReactION beta |
| ------------- | ------------- |
| 1. Clone the repo and ```npm install``` |
| 2. ```npm run build ```|
|3. Open VS Code Extension mode by pressing ```F5``` or ```ctr+5```
|4. When a new VS Code window pops up, open the React code file that you want to run the extension on|
|5. ```npm start``` your React file and set it to ```localhost:3000``` (default) |
|6. Run the extension by clicking on the ReactION logo on the side pannel or ```ReactION:Launch```


Make sure you have Google Chrome installed on your computer.

## Features <hr>

- React Fiber Tree structure shown inside VS Code (Powered by [Chrome Headless](https://developers.google.com/web/updates/2017/04/headless-chrome)).
- Ability to edit components on the HTML preview and see the component hierarchy on the side panel.
- Alternatable theme based on user preference (i.e., Light and Dark).

## Add Browser Preview for the Ultimate Experience

You can enable in-editor HTML preview by installing [Browser Preview](https://marketplace.visualstudio.com/items?itemName=auchenberg.vscode-browser-preview)

## Changing Default Settings

You can change the following default seetings in the Configuration file:
- React Tree View Theme
- Server to launch when starting the extension

Configure by using the following configuration:

```json
{
    "version": "0.1.0",
    "configurations": [
        {
            "type": "browser-preview",
            "request": "attach",
            "name": "Browser Preview: Attach"
        },
        {
            "type": "browser-preview",
            "request": "launch",
            "name": "Browser Preview: Launch",
            "url": "http://localhost:3000"
        }
    ]
}
```

## Contributing 

ReactION is currently in beta release. Please let us know about bugs and suggestions at ReactION@email.com.  Feel free to fork this repo and submit pull requests! 

## Watch It

[Watch an animated gif](docs/DEBUGGING.md) showing how to open the preview and debug a browser app.

## Team
[Andy Tran](http://github.com/andyxtran) |
[Carson Chen](http://github.com/CarsonCYChen) |
[Daniel Wu](http://github.com/wdanni) |
[Jinsung Park](http://github.com/jsliapark) | 

## Designer
[Yoojin Jung](https://github.com/jsliapark/ReactION/blob/staging/resources/Text_2.png)

## License
MIT - check out [licence](https://github.com/ReactION-js/ReactION/LICENSE) page for more details

