// Phase 4c dedicated multi-root fixture app. The shared spike/sample-app.jsx
// only ever mounts one React root, so client/storeBridge.ts's buildTree()
// "> 1 root -> wrap under a synthetic Roots node" branch has never been
// exercised against a real Store. This app mounts two INDEPENDENT roots into
// two separate containers, each with its own distinctly-named child so a
// replay/inspection can tell the two subtrees apart and confirm they aren't
// merged or confused with each other.
import { createRoot } from "react-dom/client";

function ChildOne() {
  return <p>child one</p>;
}

function AppOne() {
  return (
    <div>
      <ChildOne />
    </div>
  );
}

function ChildTwo() {
  return <p>child two</p>;
}

function AppTwo() {
  return (
    <div>
      <ChildTwo />
    </div>
  );
}

createRoot(document.getElementById("root-one")).render(<AppOne />);
createRoot(document.getElementById("root-two")).render(<AppTwo />);
