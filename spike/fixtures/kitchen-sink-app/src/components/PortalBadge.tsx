import React from "react";

export interface PortalBadgeProps {
  label: string;
}

// Rendered exclusively through PortalOverlay.tsx's ReactDOM.createPortal call
// -- this is the "portals" leg of Task 5f's new-territory verification (see
// spike/run-phase5f-kitchen-sink.js for the live-Store parentID check).
export function PortalBadge({ label }: PortalBadgeProps) {
  return <div className="portal-badge">{label}</div>;
}
