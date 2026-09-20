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

<h4 align="center">A React development environment inside your VS Code editor.</h4>

[ReactION](https://reactionjs.io/) turns your React app's live component tree into an interactive graph, right inside VS Code. It drives a real Chrome instance behind the scenes, injects the official React DevTools protocol, and streams live updates into a webview that renders them as an interactive graph — giving you an always-up-to-date visual map of your app plus insights a standalone DevTools panel can't offer, because it doesn't live in your editor. ReactION is in <i>active development</i>; we welcome constructive feedback and contributions. See `REARCHITECTURE-PLAN.md` in this repo for the full technical plan and phase-by-phase history behind the current architecture.

## Screenshot

<img src="https://github.com/ReactION-js/ReactION/blob/master/src/ReactION-sample.png?raw=true" alt="ReactION's React Flow graph with the inspector panel open, showing a render-count heatmap from a profiling session">
<br>

_The component graph mid-profiling-session: the number badges are per-component render counts (the heatmap), the selected "Panel" node shows why it re-rendered ("Props changed: children") in the inspector panel on the right, along with its live props and a jump-to-source link._

> The animated demo GIF that used to live here (`src/Demo.gif`) predates this architecture and has been retired. A new one showing a full interaction (selecting nodes, profiling, building a context map) should be re-recorded by hand — a smooth screen capture benefits from human editing more than automation.

## What ReactION does

1. **Works with any React app — no code changes required.** ReactION drives a real (optionally headless) Chrome instance via [Puppeteer](https://pptr.dev/) and injects the official React DevTools protocol backend before your app's own scripts run. Because it's a real browser hitting a real URL, it's bundler-agnostic (CRA, Vite, Next, and others); the underlying DevTools protocol targets React 16 through 19, and this repo's own fixture tests exercise React 19 (the sample app) and, for issue #72, an isolated React 16.9 + react-router v5 app.
2. **Live, interactive component graph.** The webview builds a genuine React DevTools `Store` from the live protocol stream and renders it as a pan/zoom/collapsible graph (built on [React Flow](https://reactflow.dev/), laid out with dagre), color-coded by component type (function, class, memo, forwardRef, context, and more). Updates stream in as your app renders — there's no polling, and no "re-render on save" delay.
3. **Click to inspect.** Select any node to see its live props, state, and hooks in a side panel, sourced from the same `inspectElement` protocol the official React DevTools use.
4. **Jump to source.** Click "Open in editor" on a selected node to open the exact file and line it's defined at, resolved from the source location React's DevTools hook records for that element (see Limitations below for when this can't resolve).
5. **Profile re-renders.** Start a profiling session to get a render-count heatmap over the graph, plus a per-component "why did this render" reason (props/state/hooks changed) and a "wasted render" flag when a component re-ran without its inputs actually changing.
6. **Map your context.** Build an on-demand provider → consumers map for React Context, so you can see who's actually reading from a given provider without tracing imports by hand.
7. **Embedded HTML preview.** Run `ReactION: Embedded Webview` to see your running app in an iframe alongside its live component graph.
8. **Diagnostics you can actually read.** A dedicated "ReactION" Output channel logs the Chrome launch, the DevTools relay, and webview activity, and the graph shows a clear message when no React app is detected at the configured URL instead of staying blank.
9. **Resilient to restarts.** ReactION auto-detects your dev server (probing common fallback ports if the configured one isn't answering yet) and automatically re-navigates and reconnects the graph if the dev server restarts mid-session. If the underlying Chrome window itself closes or crashes, ReactION shows a warning rather than silently going blank — close and reopen the panel to relaunch it.

### Limitations

- ReactION is built around **development-mode** React apps. If the graph stays empty, a production build is one likely cause (production builds can strip information the DevTools hook relies on) — ReactION surfaces this as an explicit message rather than staying blank with no explanation. Even when components do show up, "Open in editor" will show an informational message instead of opening a file whenever the build is minified enough that its source location can't be resolved back to a file in your workspace.
- The context map's provider/consumer matching is a **heuristic** based on `displayName`: two different `Context` objects that happen to share a name (or both leave it unset) can't be told apart from Store data alone.
- Class-component legacy context (`this.context` / `contextType`) isn't included in the context map — only `useContext` consumers are.
- There's no state-change timeline / time-travel UI yet (see Roadmap below).

## Prerequisite

- Make sure you have [Google Chrome](https://www.google.com/chrome/) installed on your computer. ReactION currently runs as a VS Code extension.
- You'll need a running React application in development mode. Feel free to fork and clone our sample app [here!](https://github.com/ReactION-js/sample-project-react)

## Roadmap

- [ ] **State-change timeline / time-travel UI.** Profiling data (the heatmap and render reasons above) is already captured live per commit; there's no UI yet to scrub backward through commit history.
- [ ] **Static analysis:** unused-component detection, dead-prop detection, and prop-drilling suggestions. Not yet started (Phase 5 of the rearchitecture plan).

See `REARCHITECTURE-PLAN.md` for the full phase-by-phase plan, including what's already shipped, the protocol-level gotchas behind each feature, and known follow-ups.

## How to Use

#### [Download Directly from GitHub]

1. Clone the repo and run `npm install`
2. Run `npm run compile` (extension) and `npm run build:webview` (webview bundle)
3. Open VS Code Extension mode by pressing `F5` or `ctr+5`
4. When a new VS Code window pops up, open the React code file that you want to run the extension on
5. `npm start` your React file and run your application in `localhost:3000` (default)
6. Run the main extension by clicking on the ReactION logo on the side panel or `ReactION:Launch`
7. Run the embedded HTML webview version with the command `cmd + shift + p` then `ReactION: Embedded Webview`
8. Enjoy the live component graph!

#### [Download From VS Code Marketplace]

You can download the extension directly from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=ReactION-js.ReactION).

## Configuring ReactION's Default Settings

You can change the following default settings in the Configuration file:

- React graph theme
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
- [Puppeteer](https://pptr.dev/) (`puppeteer-core`) - Drives a real headless/headful Chrome instance
- [react-devtools-core](https://www.npmjs.com/package/react-devtools-core) - The official DevTools backend, injected into the running app
- [react-devtools-inline](https://www.npmjs.com/package/react-devtools-inline) - The official DevTools frontend `Bridge`/`Store`, run inside the webview
- [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) (`ws`) - Relays the DevTools protocol between the injected backend and the extension host, which forwards it on to the webview via `postMessage`
- [React Flow](https://reactflow.dev/) (`@xyflow/react`) - Renders the live component graph
- [Dagre](https://github.com/dagrejs/dagre) (`@dagrejs/dagre`) - Automatic graph layout
- [React](https://reactjs.org/) - Webview UI
- [styled-components](https://styled-components.com/) - Webview styling
- [Mocha](https://mochajs.org/) / [`@vscode/test-cli`](https://www.npmjs.com/package/@vscode/test-cli) - Testing
- Love ❤️

## Contributing

ReactION is currently in beta release. Please let us know about bugs and suggestions at the [issue](https://github.com/ReactION-js/ReactION/issues) section. Feel free to fork this repo and submit pull requests!

## Team

[Andy Tran](http://github.com/andyxtran) |
[Carson Chen](http://github.com/CarsonCYChen) |
[Daniel Wu](http://github.com/wdanni) |
[Jinsung Park](http://github.com/jsliapark)

## Designer

[Yoojin Jung](https://github.com/jsliapark/ReactION/blob/staging/resources/Text_2.png)

## License

MIT - check out [license](https://github.com/ReactION-js/ReactION/LICENSE) page for more details
