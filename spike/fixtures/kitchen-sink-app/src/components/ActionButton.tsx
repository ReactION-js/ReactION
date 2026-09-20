import React from "react";
import { IconButton } from "./IconButton";

export interface ActionButtonProps {
  labelText: string;
}

// The terminal consumer of the labelText prop-drilling chain rooted at
// Toolbar (see Toolbar.tsx / ToolbarSection.tsx): labelText is genuinely
// read here (rendered as text), not merely forwarded onward, so this is
// where computePropDrilling's chain must stop.
export function ActionButton({ labelText }: ActionButtonProps) {
  return (
    <div className="action-button">
      <IconButton icon="star" />
      <span>{labelText}</span>
    </div>
  );
}
