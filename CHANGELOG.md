# Change Log

All notable changes to the "ReactION" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-09-19

### Changed

- Rearchitected the runtime pipeline around the official React DevTools protocol (`react-devtools-core`/`react-devtools-inline`) instead of a hand-rolled, polling fiber walk. Fixes the empty-tree bug for react-router v5 + React 16.9 apps (#72).
- Replaced `react-d3-tree` with a [React Flow](https://reactflow.dev/) (`@xyflow/react`) graph, laid out with `@dagrejs/dagre`: pan/zoom, collapsible nodes, search-to-highlight, and orientation toggle.
- Component updates now stream live from the Store as the app renders, instead of polling and reloading the panel on every tick.
- Modernized the toolchain: TypeScript 5.9, webpack 5, and the ESLint flat config.
- Upgraded core dependencies to React 19 and styled-components 6.

### Added

- Click a component to inspect its live props, state, and hooks; jump to its source file/line from the inspector panel.
- Profiling: a render-count heatmap over the graph, per-component re-render reasons, and wasted-render flags.
- An on-demand context provider/consumer map.
- A dedicated "ReactION" Output channel logging Chrome launch, DevTools relay, and webview activity, plus a clear empty state when no React app is detected instead of an unexplained blank panel (#73).
- Dev-server URL auto-detection (with fallback ports) and automatic reconnection after a dev-server restart. A crashed/closed Chrome window now surfaces a warning instead of failing silently.
- Automated extension tests via `@vscode/test-cli`, plus end-to-end and recorded-fixture tests via Mocha.

## [0.1.4] - 2019

### Added

- Initial beta release.
- React Fiber tree visualization inside VS Code, powered by headless Chrome.
- Embedded HTML webview kept in sync with the tree view.
- Light and dark theme support.
- Configuration through `reactION-config.json`.
