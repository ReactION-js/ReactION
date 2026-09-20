import React, { Suspense, lazy, useRef } from "react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { MemoBadge } from "./components/MemoBadge";
import { FancyInput } from "./components/FancyInput";
import { ThemeProvider, ThemedPanel } from "./components/ThemeContext";
import { PortalOverlay } from "./components/PortalOverlay";
import { DormantFeaturePanel } from "./components/DormantFeaturePanel";

// See LazyChart.tsx's own comment: this single component is both the
// lazy+Suspense fixture and the "no false delete on a dynamic-import target"
// fixture -- one component, two roles, called out explicitly here per the
// task spec rather than left implicit.
const LazyChart = lazy(() => import("./components/LazyChart"));

// Permanently false -- DormantFeaturePanel is imported and referenced right
// here (so computeUnusedComponents must not flag it), but this branch never
// runs during a normal render of this app, so it never actually mounts.
const SHOW_DORMANT_FEATURE = false;

// NeverGizmo (UnusedGizmo.tsx) is deliberately NOT imported anywhere in this
// file, or anywhere else in this fixture.

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <ThemeProvider>
      <div className="kitchen-sink-app">
        <Header />
        <Toolbar labelText="Actions" />
        <Sidebar />
        <MemoBadge count={3} />
        <FancyInput ref={inputRef} placeholder="type here" />
        <ThemedPanel />
        <PortalOverlay />
        <Suspense fallback={<div className="loading">Loading chart...</div>}>
          <LazyChart label="lazy chart loaded" />
        </Suspense>
        {SHOW_DORMANT_FEATURE && <DormantFeaturePanel message="dormant" />}
        <Footer />
      </div>
    </ThemeProvider>
  );
}
