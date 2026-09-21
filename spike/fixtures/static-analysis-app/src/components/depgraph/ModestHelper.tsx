import React from "react";

export interface ModestHelperProps {
  text: string;
}

export function ModestHelper({ text }: ModestHelperProps) {
  return <span>{text}</span>;
}
