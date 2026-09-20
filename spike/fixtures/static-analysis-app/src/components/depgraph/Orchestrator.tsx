import React from "react";
import { HubConsumerA } from "./HubConsumerA";
import { HubConsumerB } from "./HubConsumerB";
import { HubConsumerC } from "./HubConsumerC";
import { DualImporter } from "./DualImporter";

// The mirror-image fixture case from Hub.tsx: high fan-out (four distinct
// files imported below), zero fan-in -- deliberately never imported by
// App.tsx or anything else in the fixture, so this file's own fan-in stays
// genuinely zero.
export function Orchestrator() {
  return (
    <div>
      <HubConsumerA />
      <HubConsumerB />
      <HubConsumerC />
      <DualImporter showDynamic={false} />
    </div>
  );
}
