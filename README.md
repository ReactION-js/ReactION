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

<h4 align="center">Visualize your React app's component tree — right inside VS Code.</h4>

[ReactION](https://reactionjs.io/) visualizes your React app's component structure right inside VS Code, two ways: an instant **static** composition tree from your source code (no dev server, no browser, no setup), and an opt-in **live** mode that drives a real Chrome instance, injects the official React DevTools protocol, and streams live updates into an interactive graph — giving you render counts, wasted-render detection, and live DOM highlighting a standalone DevTools panel can't offer, because it doesn't live in your editor. ReactION is in <i>active development</i>; we welcome constructive feedback and contributions.

## Screenshot

<img src="https://github.com/ReactION-js/ReactION/blob/master/resources/reaction-static-sample.png?raw=true" alt="ReactION's static composition tree, showing the component graph built directly from source with no dev server running">
<br>

_The static composition tree, built straight from your source — no dev server or browser required. Click any node to jump to its definition._

<img src="https://github.com/ReactION-js/ReactION/blob/master/src/ReactION-sample.png?raw=true" alt="ReactION's React Flow graph with the inspector panel open, showing a render-count heatmap from a profiling session">
<br>

_The live component graph mid-profiling-session: the number badges are per-component render counts (the heatmap), the selected "Panel" node shows why it re-rendered ("Props changed: children") in the inspector panel on the right, along with its live props and a jump-to-source link._

A short demo GIF is on the way — for now, the screenshots above and the feature list below cover what ReactION does.

## What ReactION does

1. **Static composition tree — no setup required.** Click "Launch ReactION Static" and instantly see your project's component structure straight from source, with no dev server, browser, or configuration needed. Click any node to jump to its definition.
2. **Static analysis diagnostics.** Alongside the tree, ReactION surfaces unused-component detection, dead-prop detection, and prop-drilling chains (a prop passed through several components before it's actually used) — all computed from your source, not a running app.
3. **Guided setup for live mode.** Opting into live rendering walks you through a short setup wizard: it auto-detects a dev server already running on the common ports, defaults to `localhost:3000` if it can't find one, and only asks about your Chrome location if it can't find that either.
4. **Works with any React app — no code changes required.** Live mode drives a real (optionally headless) Chrome instance via [Puppeteer](https://pptr.dev/) and injects the official React DevTools protocol backend before your app's own scripts run. Because it's a real browser hitting a real URL, it's bundler-agnostic (CRA, Vite, Next, and others); the underlying DevTools protocol targets React 16 through 19, and this repo's own fixture tests exercise React 19 (the sample app) and an isolated React 16.9 + react-router v5 app (the combination originally reported as broken in [#72](https://github.com/ReactION-js/ReactION/issues/72)).
5. **Live, interactive component graph.** The webview builds a genuine React DevTools `Store` from the live protocol stream and renders it as a pan/zoom/collapsible graph (built on [React Flow](https://reactflow.dev/), laid out with dagre), color-coded by component type (function, class, memo, forwardRef, context, and more). Updates stream in as your app renders — there's no polling, and no "re-render on save" delay.
6. **Click to inspect.** Select any node to see its live props, state, and hooks in a side panel, sourced from the same `inspectElement` protocol the official React DevTools use.
7. **Jump to source.** Click "Open in editor" on a selected node to open the exact file and line it's defined at, resolved from the source location React's DevTools hook records for that element (see Limitations below for when this can't resolve).
8. **Profile re-renders.** Start a profiling session to get a render-count heatmap over the graph, plus a per-component "why did this render" reason (props/state/hooks changed) and a "wasted render" flag when a component re-ran without its inputs actually changing.
9. **Initial Load Report.** A one-shot, automatic capture of everything that rendered while your app first loaded, grouped by component with instance/render/wasted counts — click a row to highlight that component live in the browser, and a minified/mangled name gets a `file:line` fallback label when its source is available.
10. **Map your context.** Build an on-demand provider → consumers map for React Context, so you can see who's actually reading from a given provider without tracing imports by hand.
11. **Diagnostics you can actually read.** A dedicated "ReactION" Output channel logs the Chrome launch, the DevTools relay, and webview activity, and the graph shows a clear message when no React app is detected at the configured URL instead of staying blank.
12. **Resilient to restarts.** ReactION auto-detects your dev server (probing common fallback ports if the configured one isn't answering yet) and automatically re-navigates and reconnects the graph if the dev server restarts mid-session. If the underlying Chrome window itself closes or crashes, ReactION shows a warning rather than silently going blank — close and reopen the panel to relaunch it.

### Limitations

- ReactION's live mode is built around **development-mode** React apps. If the graph stays empty, a production build is one likely cause (production builds can strip information the DevTools hook relies on) — ReactION surfaces this as an explicit message rather than staying blank with no explanation.
- Even when components do show up, "Open in editor" will show an informational message instead of opening a file whenever the build is minified enough that its source location can't be resolved back to a file in your workspace.
- The context map's provider/consumer matching is a **heuristic** based on `displayName`: two different `Context` objects that happen to share a name (or both leave it unset) can't be told apart from Store data alone.
- Class-component legacy context (`this.context` / `contextType`) isn't included in the context map — only `useContext` consumers are.
- There's no state-change timeline / time-travel UI yet.

## Prerequisite

ReactION currently runs as a VS Code extension. The static composition tree needs nothing beyond your source code — the items below are only needed if you want to opt into **live** rendering:

- [Google Chrome](https://www.google.com/chrome/) installed on your computer.
- A running React application in development mode. Feel free to fork and clone our sample app [here!](https://github.com/ReactION-js/sample-project-react)

## How to Use

#### [Download Directly from GitHub]

1. Clone the repo and run `npm install`
2. Run `npm run compile` (extension) and `npm run build:webview` (webview bundle)
3. Open VS Code Extension mode by pressing `F5` or `ctr+5`
4. When a new VS Code window pops up, open the project you want to run the extension on
5. Click the ReactION logo in the activity bar and use the step-by-step **Launch** view, or follow the **Get Started with ReactION** walkthrough that opens on first run (reopen anytime with `ReactION: Getting Started`)
6. Click **Launch ReactION Static** for the instant composition tree — no server needed
7. Want live render counts, a wasted-render heatmap, and live DOM highlighting too? Start your dev server, then click **Launch ReactION Live Rendering** instead; the setup wizard auto-detects it, has you confirm its address, and locates Chrome
8. Enjoy the component graph!

#### [Download From VS Code Marketplace]

You can download the extension directly from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=ReactION-js.ReactION).

## Configuring ReactION's Default Settings

You can change the following default settings in the Configuration file (the setup wizard writes most of these for you, but you can also edit the file directly):

- `localhost` — which URL your dev server runs on, e.g. `localhost:3000`
- `executablePath` — path to your Chrome/Chromium binary
- `headless_browser` — whether Chrome runs headless or as a visible window
- `reactTheme` — the graph's color theme, `"light"` or `"dark"`

You can configure ReactION's default settings through the reactION-config.json file, created in your workspace root the first time you run the setup wizard, as such:

```json
{
  "system": "darwin",
  "executablePath": "",
  "localhost": "localhost:3000",
  "headless_browser": false,
  "reactTheme": "dark"
}
```

(`system` records the detected platform and isn't something you need to change by hand.)

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
