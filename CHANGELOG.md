# Change Log

All notable changes to the "ReactION" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-09-19

### Changed

- Modernized the toolchain: TypeScript 5.9, webpack 5, and the ESLint flat config.
- Upgraded core dependencies to React 19, react-d3-tree 3.x, and styled-components 6.
- Switched the headless browser integration to `puppeteer-core`.
- Tree updates now stream to the webview via `postMessage` instead of reloading the panel on every tick.

### Added

- Automated extension tests via `@vscode/test-cli`, plus end-to-end tests via Mocha.

### Fixed

- Fiber tree scraping now supports the React 18/19 `__reactContainer$` / `__reactFiber$` keys in addition to the legacy `_reactRootContainer`.

## [0.1.4] - 2019

### Added

- Initial beta release.
- React Fiber tree visualization inside VS Code, powered by headless Chrome.
- Embedded HTML webview kept in sync with the tree view.
- Light and dark theme support.
- Configuration through `reactION-config.json`.
