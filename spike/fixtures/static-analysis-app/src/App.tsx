import React, { Suspense, lazy } from "react";
import { AllPropsUsed } from "./components/AllPropsUsed";
import { DeadProp } from "./components/DeadProp";
import { ThemedButton, ThemedCard } from "./components/Themed";
import { BarrelOnly } from "./components";
import { ExternalTypedComponent } from "./components/ExternalTypedComponent";
import { PropsAccessed } from "./components/PropsAccessed";
import { ChipGroup } from "./components/SelfReferencing";
import { ConciseArrow, BlockArrow } from "./components/ArrowComponents";
import {
  ThemeGrandparent,
  ThemeParent,
  ThemeLeaf,
  LabelParent,
  LabelLeaf,
  DirectConsumer,
  CountGrandparent,
  CountParent,
  CountMixed,
  CountLeaf,
  SpreadGreatGrandparent,
  SpreadGrandparent,
  SpreadForwarder,
  SpreadLeaf,
} from "./components/PropDrilling";

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
      <ChipGroup theme="dark" label="group" />
      <ConciseArrow value="concise" />
      <BlockArrow value="block" ghost="g" hint="tooltip" />
      {/* Every PropDrilling.tsx export below is imported and rendered here
          purely so computeUnusedComponents (which only tracks cross-file
          import edges, not same-file JSX usage) doesn't flag them -- this
          fixture is for Phase 5b's prop-drilling detection, not for
          exercising the unused-components metric. */}
      <ThemeGrandparent theme="dark" />
      <ThemeParent theme="dark" />
      <ThemeLeaf theme="dark" />
      <LabelParent label="hi" />
      <LabelLeaf label="hi" />
      <DirectConsumer value="hi" />
      <CountGrandparent count={1} />
      <CountParent count={1} />
      <CountMixed count={1} />
      <CountLeaf count={1} />
      <SpreadGreatGrandparent theme="dark" />
      <SpreadGrandparent theme="dark" />
      <SpreadForwarder theme="dark" />
      <SpreadLeaf theme="dark" />
      <Suspense fallback={null}>
        <Lazy message="lazy" />
      </Suspense>
    </div>
  );
}
