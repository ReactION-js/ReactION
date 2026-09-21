// Phase 5d fixture: a small, real, runnable React app for exercising
// "not rendered this session" coverage correlation end to end (see
// spike/run-phase5d-coverage.js). Deliberately a NEW fixture rather than an
// extension of spike/sample-app.jsx -- every prior phase's regression
// harness depends on that file's exact shape.
//
// Header, Counter, and Footer are all exported (so analyzeWorkspace
// discovers them as genuine components) AND rendered by App below, so a
// correct correlation must NOT flag any of them as "not rendered". App
// itself is also exported, PascalCase, and returns JSX, so it's discovered
// too -- and it genuinely does render, as the mounted root.
//
// NeverRenderedPanel is exported (so it's just as valid and discoverable a
// component as the others) but is deliberately never instantiated anywhere
// in this file's render tree. That's the one genuinely-never-rendered case
// this fixture exists to prove out.
import { useState } from "react";
import { createRoot } from "react-dom/client";

export function Header() {
  return <h1>Coverage fixture</h1>;
}

export function Counter({ initial }) {
  const [count] = useState(initial);
  return <div className="counter">Count: {count}</div>;
}

export function Footer() {
  return <footer>coverage fixture footer</footer>;
}

// Never instantiated below (or anywhere else in this fixture) -- the
// "not rendered this session" case.
export function NeverRenderedPanel() {
  return <div className="never-rendered">You should never see me mount.</div>;
}

export function App() {
  return (
    <div>
      <Header />
      <Counter initial={0} />
      <Footer />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
