import { useState } from "react";
import styled from "styled-components";
import type { InitialLoadReportController } from "../useInitialLoadReport";
import Tooltip from "./Tooltip";

export interface InitialLoadReportPanelProps {
  theme: "light" | "dark";
  controller: InitialLoadReportController;
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
  min-width: 260px;
  max-width: 360px;
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
  justify-content: space-between;
  gap: 8px;
`;

const SummaryLine = styled.div`
  padding: 4px 12px;
  font-weight: 600;
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

const SectionLabel = styled.div`
  padding: 4px 12px;
  opacity: 0.7;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const ComponentRow = styled.div`
  padding: 4px 12px;
  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.15);
  }
`;

const ComponentName = styled.div`
  font-weight: 500;
`;

const RenderDetail = styled.div`
  opacity: 0.65;
  font-size: 10.5px;
`;

const WastedCount = styled.span`
  color: #ff7b72;
  opacity: 1;
`;

const EmptyNotice = styled.div`
  padding: 4px 12px;
  opacity: 0.7;
  font-style: italic;
`;

// Toolbar entry for useInitialLoadReport's automatic, one-shot capture: this
// component only owns whether the already-computed report is shown or
// hidden, not the capture itself (which starts on connect with no user
// action, unlike ContextMapPanel/CoveragePanel's explicit user-triggered
// scans).
export default function InitialLoadReportPanel({ theme, controller }: InitialLoadReportPanelProps) {
  const { report, isCapturing } = controller;
  const [open, setOpen] = useState(false);

  return (
    <Wrapper className={`reaction-theme-${theme}`}>
      <Tooltip
        theme={theme}
        label="How many components rendered while the app was first loading, and which of those re-rendered more than once."
        disabled={open}
      >
        <button onClick={() => setOpen((current) => !current)} disabled={!report}>
          {isCapturing ? "Capturing initial load…" : "Initial Load Report"}
        </button>
      </Tooltip>
      {open && report && (
        <ResultsPanel $theme={theme}>
          <Header>
            <SummaryLine>
              {report.totalRendered} component{report.totalRendered === 1 ? "" : "s"} rendered on
              initial load
            </SummaryLine>
            <CloseButton onClick={() => setOpen(false)} title="Close">
              &times;
            </CloseButton>
          </Header>
          {report.rerendered.length === 0 ? (
            <EmptyNotice>None of them re-rendered more than once.</EmptyNotice>
          ) : (
            <>
              <SectionLabel>Rendered more than once</SectionLabel>
              {report.rerendered.map((group) => (
                <ComponentRow key={group.displayName}>
                  <ComponentName>{group.displayName}</ComponentName>
                  <RenderDetail>
                    {group.instanceCount} instance{group.instanceCount === 1 ? "" : "s"} ·{" "}
                    {group.totalRenders} renders ·{" "}
                    {group.wastedRenders > 0 ? (
                      <WastedCount>{group.wastedRenders} wasted</WastedCount>
                    ) : (
                      "0 wasted"
                    )}
                  </RenderDetail>
                </ComponentRow>
              ))}
            </>
          )}
        </ResultsPanel>
      )}
    </Wrapper>
  );
}
