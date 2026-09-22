import { useState, type ReactNode } from "react";
import styled from "styled-components";

export interface TooltipProps {
  theme: "light" | "dark";
  label: string;
  // Suppresses the bubble even while hovered/focused -- used by
  // CoveragePanel/ContextMapPanel so this doesn't visually stack with their
  // own results panel, which is anchored at the same spot below the button.
  disabled?: boolean;
  children: ReactNode;
}

const TooltipWrapper = styled.span`
  position: relative;
  display: inline-flex;
`;

const TooltipBubble = styled.div<{ $theme: "light" | "dark" }>`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  max-width: 260px;
  width: max-content;
  padding: 5px 9px;
  border: 1px solid ${(props) => (props.$theme === "light" ? "#d0d7de" : "#30363d")};
  border-radius: 4px;
  background-color: ${(props) => (props.$theme === "light" ? "#ffffff" : "#252526")};
  color: ${(props) => (props.$theme === "light" ? "#181818" : "#f8f8f8")};
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 11px;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
`;

// Native `title` tooltips can't be restyled and carry a browser-imposed
// ~1s hover delay -- this replaces them with an instant, theme-matched
// bubble (see the toolbar buttons in TreeView.tsx/ContextMapPanel.tsx/
// CoveragePanel.tsx).
export default function Tooltip({ theme, label, disabled, children }: TooltipProps) {
  const [hovered, setHovered] = useState(false);
  const visible = hovered && !disabled;

  return (
    <TooltipWrapper
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {children}
      {visible && (
        <TooltipBubble $theme={theme} role="tooltip">
          {label}
        </TooltipBubble>
      )}
    </TooltipWrapper>
  );
}
