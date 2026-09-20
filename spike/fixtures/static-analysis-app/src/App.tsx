import React, { Suspense, lazy } from "react";
import { AllPropsUsed } from "./components/AllPropsUsed";
import { DeadProp } from "./components/DeadProp";
import { ThemedButton, ThemedCard } from "./components/Themed";
import { BarrelOnly } from "./components";
import { ExternalTypedComponent } from "./components/ExternalTypedComponent";
import { PropsAccessed } from "./components/PropsAccessed";

const Lazy = lazy(() => import("./components/LazyLoaded"));

export default function App() {
  return (
    <div>
      <AllPropsUsed title="hello" count={2} />
      <DeadProp used="value" unused="ignored" />
      <ThemedButton theme="dark" label="button" />
      <ThemedCard theme="dark" label="card" />
      <BarrelOnly text="barrel" />
      <ExternalTypedComponent known="k" ghost="g" />
      <PropsAccessed visible="v" ghost="g" />
      <Suspense fallback={null}>
        <Lazy message="lazy" />
      </Suspense>
    </div>
  );
}
