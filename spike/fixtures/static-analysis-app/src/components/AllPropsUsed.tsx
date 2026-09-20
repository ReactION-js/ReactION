import React from "react";

export interface AllPropsUsedProps {
  title: string;
  count: number;
}

export function AllPropsUsed({ title, count }: AllPropsUsedProps) {
  return (
    <section>
      <h1>{title}</h1>
      <span>{count}</span>
    </section>
  );
}
