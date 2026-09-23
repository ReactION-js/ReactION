# Launch ReactION Static (recommended)

Click **Launch ReactION Static** on this step (or use the **Launch** view in
the ReactION activity-bar icon on the left) to instantly see your project's
component structure — no dev server, no browser, no setup required.

### What happens

1. ReactION parses your project's own source with static analysis.
2. It builds a graph of which components render which other components,
   straight from your code.
3. The graph opens immediately.

### What you can do

- **Pan & zoom** the graph; **collapse/expand** subtrees; **search** to
  highlight.
- **Click a node** to open a details sidebar — context/provider usage, props,
  and an **Open in editor** link to jump straight to its source file and line.
- Launch **ReactION: Launch Live Rendering** at any time (its own step below,
  or the **Launch** view in the ReactION activity-bar icon) to connect to
  your running app, in a separate tab, for real render counts and a
  wasted-render heatmap.

> **A real limitation, not a bug**: this view can't see runtime-only
> behavior — which branch of a conditional actually renders, how many
> instances a list produces, or a component chosen dynamically at runtime.
> For that, connect to the live app (the next steps below).
