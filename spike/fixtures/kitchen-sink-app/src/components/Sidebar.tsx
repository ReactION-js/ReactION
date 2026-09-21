import React from "react";
import { IconButton } from "./IconButton";

// Plain composition, no props of its own -- adds a bit of realistic file
// structure (and another IconButton importer) without exercising anything
// new on its own.
export function Sidebar() {
  return (
    <nav className="sidebar">
      <IconButton icon="home" />
      <IconButton icon="settings" />
    </nav>
  );
}
