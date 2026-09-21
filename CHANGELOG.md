# Change Log

All notable changes to the "ReactION" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Guided first-run onboarding: a "Get Started with ReactION" walkthrough (start your app → configure the dev-server URL → launch the graph → troubleshooting) that opens automatically the first time the extension activates and is reopenable anytime via `ReactION: Getting Started`.
- Step-by-step welcome content in the ReactION activity-bar "Launch" view that reveals one step at a time (configure → launch → done) and advances as you complete each, replacing the bare "no data provider registered" placeholder.
- `ReactION: Configure Dev Server` setup wizard that auto-detects a running dev server on common ports, lets you confirm/enter the URL, checks that Chrome can be found, saves to `reactION-config.json`, and offers to launch immediately.
- `ReactION: Reset Onboarding` command to clear saved progress and replay the guided setup from step 1.

### Changed

- Config is now re-read on every launch, so changes from the setup wizard (or a hand-edit of `reactION-config.json`) take effect without reloading the window.
- The start-failure notification now offers a "Configure…" action that jumps straight to the setup wizard.
- Rebranded from a "Dedicated React IDE" to a **React component visualizer**, to match what the extension actually does.

### Removed

- The **Embedded Webview** (`ReactION: Embedded Webview`) command and its iframe preview. It duplicated the real Chrome window ReactION already drives, and the iframe was decoupled from the live graph; the single **Launch** flow is the supported way to view the component graph. The unused `headless_embedded` config field was removed with it.

### Fixed

- Auto-detect no longer reports "couldn't find a running dev server" when the app is up: a `localhost` URL is now probed over both IPv4 (`127.0.0.1`) and IPv6 (`::1`), fixing the macOS case where Node resolves `localhost` to `::1` while the dev server listens on IPv4 only. The setup wizard also checks more common ports and waits a little longer for a first response.

## [0.3.0] - 2026-09-21

### Added

- GitHub Actions workflow to automatically publish the extension to the VS Code Marketplace on `v*` tag pushes (or via manual `workflow_dispatch`). Runs lint and compiles before publishing using `VSCE_PAT`.

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
