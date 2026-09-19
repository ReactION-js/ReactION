import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode as FlowNodeType } from "../flowLayout";

// Border/accent color per react-devtools-shared ElementType label.
const TYPE_COLORS: Record<string, string> = {
  Function: "#61dafb",
  Class: "#f0883e",
  Memo: "#a5d6ff",
  ForwardRef: "#d2a8ff",
  Context: "#7ee787",
  Host: "#8b949e",
  Root: "#e3e3e3",
  Suspense: "#ff7b72",
  SuspenseList: "#ff7b72",
  Profiler: "#d29922",
  Other: "#8b949e",
};

// Renders one component in the graph: name, type badge, and a collapse toggle
// when it has children. Dimmed when a search is active and it doesn't match.
function FlowNode({ id, data }: NodeProps<FlowNodeType>) {
  const color = TYPE_COLORS[data.typeLabel] ?? "#8b949e";

  return (
    <div
      className="reaction-flow-node"
      style={{
        borderColor: color,
        opacity: data.matchesSearch ? 1 : 0.25,
        boxShadow: data.selected ? `0 0 0 2px ${color}` : "none",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="reaction-flow-node__name">{data.label}</div>
      {data.typeLabel && (
        <div className="reaction-flow-node__type" style={{ color }}>
          {data.typeLabel}
        </div>
      )}
      {data.hasChildren && (
        <button
          type="button"
          className="reaction-flow-node__toggle"
          title={data.collapsed ? "Expand" : "Collapse"}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapse(id);
          }}
        >
          {data.collapsed ? "+" : "−"}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(FlowNode);
