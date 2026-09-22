import styled from "styled-components";
import type { ContextMapController } from "../useContextMap";
import Tooltip from "./Tooltip";

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

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
`;

const CloseButton = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 4px 8px 0 0;
  opacity: 0.7;
  &:hover {
    opacity: 1;
  }
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
  const { entries, isBuilding, build, dismiss } = controller;

  return (
    <Wrapper className={`reaction-theme-${theme}`}>
      <Tooltip
        theme={theme}
        label="Scan the tree for React Context providers and list which components consume each one."
        disabled={entries !== undefined}
      >
        <button onClick={build} disabled={isBuilding}>
          {isBuilding ? "Building context map…" : "Build context map"}
        </button>
      </Tooltip>
      {entries && (
        <ResultsPanel $theme={theme}>
          <Header>
            <CloseButton onClick={dismiss} title="Close">
              &times;
            </CloseButton>
          </Header>
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
