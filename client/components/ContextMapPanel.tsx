import styled from "styled-components";
import type { ContextMapController } from "../useContextMap";

export interface ContextMapPanelProps {
  theme: "light" | "dark";
  controller: ContextMapController;
}

const Wrapper = styled.div`
  position: relative;
  display: flex;
`;

const ResultsPanel = styled.div<{ $theme: "light" | "dark" }>`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  min-width: 240px;
  max-width: 320px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px 0;
  border: 1px solid ${(props) => (props.$theme === "light" ? "#d0d7de" : "#30363d")};
  border-radius: 4px;
  background-color: ${(props) => (props.$theme === "light" ? "#ffffff" : "#252526")};
  color: ${(props) => (props.$theme === "light" ? "#181818" : "#f8f8f8")};
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
`;

const EntryBlock = styled.div`
  padding: 4px 12px;
  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.2);
  }
`;

const ProviderName = styled.div`
  font-weight: 600;
`;

const ConsumerList = styled.ul`
  margin: 4px 0 0;
  padding-left: 16px;
`;

const EmptyNotice = styled.div`
  padding: 4px 12px;
  opacity: 0.7;
  font-style: italic;
`;

// Toolbar action that triggers useContextMap's explicit, user-initiated scan
// and shows its result as a plain provider -> consumers list. Deliberately
// not a graph overlay on the React Flow canvas -- out of scope per the
// Phase 3d task brief.
export default function ContextMapPanel({ theme, controller }: ContextMapPanelProps) {
  const { entries, isBuilding, build } = controller;

  return (
    <Wrapper className={`reaction-theme-${theme}`}>
      <button
        onClick={build}
        disabled={isBuilding}
        title="Scan the tree for React Context providers and list which components consume each one."
      >
        {isBuilding ? "Building context map…" : "Build context map"}
      </button>
      {entries && (
        <ResultsPanel $theme={theme}>
          {entries.length === 0 ? (
            <EmptyNotice>No consumed contexts found.</EmptyNotice>
          ) : (
            entries.map((entry) => (
              <EntryBlock key={entry.providerId}>
                <ProviderName>{entry.providerName}</ProviderName>
                <ConsumerList>
                  {entry.consumers.map((consumer) => (
                    <li key={consumer.id}>{consumer.name}</li>
                  ))}
                </ConsumerList>
              </EntryBlock>
            ))
          )}
        </ResultsPanel>
      )}
    </Wrapper>
  );
}
