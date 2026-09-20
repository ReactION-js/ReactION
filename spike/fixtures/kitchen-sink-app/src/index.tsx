import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// The harness's served HTML supplies a second, sibling "portal-root" div
// (outside this root's own DOM container) for PortalOverlay.tsx to portal
// into -- see spike/run-phase5f-kitchen-sink.js.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
