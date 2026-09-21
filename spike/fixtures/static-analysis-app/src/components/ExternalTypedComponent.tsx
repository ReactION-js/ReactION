import React from "react";
import type { ExternalProps } from "../types";

export function ExternalTypedComponent({ known }: ExternalProps) {
  return <span>{known}</span>;
}
