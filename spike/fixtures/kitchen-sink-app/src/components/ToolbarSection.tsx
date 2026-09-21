import React from "react";
import { ActionButton } from "./ActionButton";

export interface ToolbarSectionProps {
  labelText: string;
}

// Middle layer of the drilling chain: labelText's only use here is
// forwarding it straight to ActionButton under the same name -- forwarding
// layer 2 of 2.
export function ToolbarSection({ labelText }: ToolbarSectionProps) {
  return (
    <section className="toolbar-section">
      <ActionButton labelText={labelText} />
    </section>
  );
}
