import React from "react";
import { IconButton } from "./IconButton";
import { ToolbarSection } from "./ToolbarSection";

export interface ToolbarProps {
  labelText: string;
}

// Root of the genuine prop-drilling chain this fixture exists to prove out
// (Toolbar -> ToolbarSection -> ActionButton): labelText's only use in this
// component is forwarding it to ToolbarSection under the same name --
// forwarding layer 1 of 2. The IconButton render below is unrelated (a
// different, non-drilled prop) and must not affect labelText's own
// classification.
export function Toolbar({ labelText }: ToolbarProps) {
  return (
    <div className="toolbar">
      <IconButton icon="menu" />
      <ToolbarSection labelText={labelText} />
    </div>
  );
}
