import { useState } from "react";
import type { CSSProperties } from "react";

interface NodeLabelProps {
  name: string;
  attributes: string[];
}

const boxStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  lineHeight: 1.3,
};

// Shows a component's name, revealing its prop list on hover.
export default function NodeLabel({ name, attributes }: NodeLabelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={boxStyle}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <strong>{name}</strong>
      {expanded && attributes.length > 0 && (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
          {attributes.map((attr) => (
            <li key={attr}>{attr}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
