import styled from "styled-components";
import type { CoverageController } from "../useCoverage";
import Tooltip from "./Tooltip";

export interface CoveragePanelProps {
  theme: "light" | "dark";
  controller: CoverageController;
  onOpenSource: (fileName: string, lineNumber: number, columnNumber: number) => void;
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
  min-width: 280px;
  max-width: 380px;
  max-height: 360px;
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

// The load-bearing "coverage, not dead code" disclaimer -- see
// client/coverage.ts's doc comment for the two correlation limitations this
// paraphrases. Kept visible alongside every result, not just on hover/a
// tooltip, per the Phase 5 task's "every piece of UI copy must make this
// clear" requirement.
const CaveatNote = styled.div`
  padding: 4px 12px 8px;
  margin-bottom: 4px;
  opacity: 0.7;
  font-size: 10.5px;
  font-style: italic;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
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

const ComponentLocation = styled.div`
  opacity: 0.65;
  font-size: 10.5px;
  word-break: break-all;
`;

const OpenLink = styled.button`
  border: none;
  background: transparent;
  color: #58a6ff;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  margin-top: 2px;
  text-decoration: underline;
  opacity: 0.85;
  &:hover {
    opacity: 1;
  }
`;

const EmptyNotice = styled.div`
  padding: 4px 12px;
  opacity: 0.7;
  font-style: italic;
`;

const ErrorNotice = styled.div`
  padding: 4px 12px;
  color: #ff7b72;
`;

// Toolbar action that triggers useCoverage's explicit, user-initiated
// "not rendered this session" check and shows its result as a plain
// percentage plus a list of not-yet-observed components. Deliberately not a
// graph overlay on the React Flow canvas, mirroring ContextMapPanel's own
// "plain list, not a canvas overlay" scope decision.
export default function CoveragePanel({ theme, controller, onOpenSource }: CoveragePanelProps) {
  const { result, isAnalyzing, error, runCoverageAnalysis, dismiss } = controller;
  const showPanel = result !== undefined || error !== undefined;

  return (
    <Wrapper className={`reaction-theme-${theme}`}>
      <Tooltip
        theme={theme}
        label={
          isAnalyzing
            ? "Running the static analysis on the extension host blocks its event loop, so live tree updates are paused until this finishes."
            : "Checks which statically-known components were not observed rendering during this live session. This is a coverage signal, not a dead-code report."
        }
        disabled={showPanel}
      >
        <button onClick={runCoverageAnalysis} disabled={isAnalyzing}>
          {/* The parse behind this blocks the extension host's event loop, so
              the SAME connection carrying live tree updates stalls for as long
              as this runs -- see coverageAnalysisWiring.ts's COST NOTE. This
              label is only a UX mitigation (tell the user why the tree just
              froze), not a fix for the underlying block. */}
          {isAnalyzing ? "Checking coverage… (tree paused)" : "Check Coverage"}
        </button>
      </Tooltip>
      {showPanel && (
        <ResultsPanel $theme={theme}>
          <Header>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            {result && (
              <SummaryLine>
                {Math.round(result.coverageFraction * 100)}% of {result.totalComponents} statically-known
                component{result.totalComponents === 1 ? "" : "s"} observed rendering this session
              </SummaryLine>
            )}
            <CloseButton onClick={dismiss} title="Close">
              &times;
            </CloseButton>
          </Header>
          {result && (
            <>
              <CaveatNote>
                "Not rendered" means not observed live during THIS session — not dead code. A modal
                that wasn't opened, an error state that wasn't triggered, or a route that wasn't
                visited will genuinely show up below despite being real, used components. Two
                differently-defined components sharing a display name, or a bundler that renames a
                component at build time (e.g. esbuild's Counter → Counter2), can also skew this list.
              </CaveatNote>
              {result.notRendered.length === 0 ? (
                <EmptyNotice>Every statically-known component was observed rendering this session.</EmptyNotice>
              ) : (
                result.notRendered.map((component) => (
                  <ComponentRow
                    key={`${component.filePath}:${component.line}:${component.column}:${component.displayName}`}
                  >
                    <ComponentName>{component.displayName}</ComponentName>
                    <ComponentLocation>
                      {component.filePath}:{component.line}
                    </ComponentLocation>
                    <div>
                      <OpenLink
                        onClick={() =>
                          onOpenSource(component.filePath, component.line, component.column)
                        }
                      >
                        Open in editor
                      </OpenLink>
                    </div>
                  </ComponentRow>
                ))
              )}
            </>
          )}
        </ResultsPanel>
      )}
    </Wrapper>
  );
}
