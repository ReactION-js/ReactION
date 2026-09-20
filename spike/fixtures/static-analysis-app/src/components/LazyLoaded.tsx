import React from "react";

export interface LazyLoadedProps {
  message: string;
}

// Only ever reached through React.lazy(() => import("./LazyLoaded")) in
// App.tsx -- its named export has zero direct references anywhere, which is
// exactly the dynamic-import false-positive the plan warns about.
export default function LazyLoaded({ message }: LazyLoadedProps) {
  return <div>{message}</div>;
}
