import React from "react";
import { createPortal } from "react-dom";
import { PortalBadge } from "./PortalBadge";

// Renders into "portal-root", a DOM node the harness's HTML places as a
// sibling of the main "root" container -- genuinely outside the React root's
// own DOM subtree, the well-known edge case for a naive DOM/fiber-walking
// approach. The official DevTools protocol this project now runs on tracks
// portals via the FIBER tree (where a portal's HostPortal fiber is a child of
// whatever called createPortal), not the DOM tree, so PortalBadge should
// still show up as a live-Store descendant of THIS component, not as a
// second disconnected root pointed at the portal target.
export function PortalOverlay() {
  const portalRoot = document.getElementById("portal-root");
  if (!portalRoot) {
    return null;
  }
  return createPortal(<PortalBadge label="portaled content" />, portalRoot);
}
