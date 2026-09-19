import { useCallback, useState } from "react";
import Tree, {
  type CustomNodeElementProps,
  type RawNodeDatum,
} from "react-d3-tree";
import styled from "styled-components";
import type { ComponentNode } from "../types";
import NodeLabel from "./NodeLabel";

interface TreeChartProps {
  data: ComponentNode;
  theme: "light" | "dark";
}

const Container = styled.div<{ $theme: "light" | "dark" }>`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: ${(props) =>
    props.$theme === "light" ? "#ffffff" : "#1e1e1e"};
  color: ${(props) => (props.$theme === "light" ? "#181818" : "#f8f8f8")};
  font-family: "Segoe UI", system-ui, sans-serif;

  .rd3t-link {
    stroke: #888;
    stroke-width: 1.5px;
    fill: none;
  }
`;

const Toolbar = styled.div`
  padding: 8px;
`;

function renderNode({ nodeDatum, toggleNode }: CustomNodeElementProps) {
  const node = nodeDatum as unknown as ComponentNode;
  return (
    <g>
      <circle
        r={10}
        fill="#61dafb"
        stroke="#282c34"
        strokeWidth={1}
        onClick={toggleNode}
      />
      <foreignObject x={14} y={-14} width={220} height={200}>
        <NodeLabel name={node.name} attributes={node.attributes ?? []} />
      </foreignObject>
    </g>
  );
}

// Renders the scraped component hierarchy as an interactive D3 tree.
export default function TreeChart({ data, theme }: TreeChartProps) {
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(
    "vertical",
  );

  const toggleOrientation = useCallback(() => {
    setOrientation((current) =>
      current === "vertical" ? "horizontal" : "vertical",
    );
  }, []);

  return (
    <Container $theme={theme} className="treeChart">
      <Toolbar>
        <button onClick={toggleOrientation}>Change orientation</button>
      </Toolbar>
      <div style={{ flex: 1 }}>
        <Tree
          data={data as unknown as RawNodeDatum}
          orientation={orientation}
          translate={{ x: 200, y: 100 }}
          renderCustomNodeElement={renderNode}
          collapsible
        />
      </div>
    </Container>
  );
}
