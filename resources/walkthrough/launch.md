# Launch the live component graph

With your app running and the URL configured, click **Launch ReactION** on this
step (or use the **Launch** view in the ReactION activity-bar icon on the left).

### What happens

1. ReactION launches Chrome and opens your app's URL.
2. It streams your app's live component tree into an interactive graph.
3. The graph updates as your app renders — no polling, no "re-render on save"
   delay.

### What you can do

- **Pan & zoom** the graph; **collapse** subtrees; **search** to highlight.
- **Click a node** to inspect its live **props, state, and hooks**.
- **Open in editor** from a selected node to jump to its source file and line.
- **Profile re-renders** to get a render-count heatmap plus per-component
  "why did this render" reasons and wasted-render flags.

> Made a config change? Just close and relaunch the panel — the new settings
> are picked up automatically.
