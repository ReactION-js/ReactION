import styled from "styled-components";
import type { StaticComponentDetailController } from "../useStaticComponentDetail";

export interface StaticInspectorPanelProps {
  theme: "light" | "dark";
  controller: StaticComponentDetailController;
  onOpenSource: (fileName: string, lineNumber: number, columnNumber: number) => void;
  // Jumps the sidebar to a cross-referenced component (a "renders"/
  // "rendered by" entry) without needing to find and click it in the graph
  // itself -- the same id also drives the graph's own selection ring, via
  // TreeView.tsx keying its `selectedId` off this controller.
  onSelectComponent: (id: string) => void;
}

const Panel = styled.div<{ $theme: "light" | "dark" }>`
  width: 300px;
  flex: 0 0 auto;
  overflow-y: auto;
  border-left: 1px solid ${(props) => (props.$theme === "light" ? "#d0d7de" : "#30363d")};
  background-color: ${(props) => (props.$theme === "light" ? "#ffffff" : "#252526")};
  color: ${(props) => (props.$theme === "light" ? "#181818" : "#f8f8f8")};
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.3);
`;

const Title = styled.div`
  font-size: 13px;
  font-weight: 600;
  word-break: break-word;
`;

const TypeLine = styled.div`
  opacity: 0.7;
  margin-top: 2px;
`;

const CloseButton = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.7;
  &:hover {
    opacity: 1;
  }
`;

const OpenSourceButton = styled.button`
  border: none;
  background: transparent;
  color: #58a6ff;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  margin-top: 4px;
  text-decoration: underline;
  opacity: 0.85;
  &:hover {
    opacity: 1;
  }
`;

const Body = styled.div`
  padding: 4px 0 12px;
`;

const Section = styled.div`
  margin-top: 8px;
`;

const SectionHeader = styled.div`
  padding: 2px 12px;
  font-weight: 600;
  opacity: 0.85;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.04em;
`;

const EmptyNotice = styled.div`
  padding: 2px 12px 2px 20px;
  opacity: 0.6;
  font-style: italic;
`;

const Notice = styled.div`
  padding: 8px 12px;
  opacity: 0.8;
`;

const MetricRow = styled.div`
  padding: 2px 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

const OutlierBadge = styled.span`
  color: #d29922;
  font-weight: 600;
`;

const WarningBanner = styled.div`
  margin: 8px 12px 0;
  padding: 6px 8px;
  border: 1px solid #ff8a4c;
  border-radius: 4px;
  color: #ff8a4c;
  font-size: 11px;
`;

const PropRow = styled.div`
  padding: 4px 12px;
  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.15);
  }
`;

const PropName = styled.span`
  font-weight: 600;
`;

const PropMeta = styled.span`
  opacity: 0.65;
  margin-left: 6px;
`;

const PropDescription = styled.div`
  opacity: 0.75;
  margin-top: 2px;
`;

const DeadPropBadge = styled.span`
  color: #ff7b72;
  font-size: 10px;
  margin-left: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const DrilledPropBadge = styled.span`
  color: #8b949e;
  font-size: 10px;
  margin-left: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const RefButton = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 4px 12px;
  font-size: 12px;
  &:hover {
    background: rgba(128, 128, 128, 0.12);
  }
  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.15);
  }
`;

const ContextTag = styled.span`
  display: inline-block;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 3px;
  padding: 1px 6px;
  margin: 2px 4px 0 0;
  font-size: 11px;
`;

// Static-tree analog of InspectorPanel: instead of a live element's props/
// state/hooks (fed by the runtime bridge), this shows everything the
// codebase's static analysis already knows about a clicked static-tree
// node's component -- its declared prop signature, how central it is in the
// import graph, dead/drilled props, context provide/consume, and its static
// renders/rendered-by relationships (each clickable, so the sidebar doubles
// as a way to browse the composition graph without hunting for a node in
// the canvas).
export default function StaticInspectorPanel({
  theme,
  controller,
  onOpenSource,
  onSelectComponent,
}: StaticInspectorPanelProps) {
  const { detail, loading } = controller;

  return (
    <Panel $theme={theme} className={`reaction-theme-${theme}`}>
      <Header>
        <div>
          <Title>{detail?.displayName ?? "…"}</Title>
          <TypeLine>Static analysis</TypeLine>
          {detail && (
            <div>
              <OpenSourceButton
                onClick={() => onOpenSource(detail.filePath, detail.line, detail.column)}
                title={`${detail.filePath}:${detail.line}:${detail.column}`}
              >
                Open in editor
              </OpenSourceButton>
            </div>
          )}
        </div>
        <CloseButton onClick={controller.deselect} title="Close">
          &times;
        </CloseButton>
      </Header>

      {loading && <Notice>Loading…</Notice>}

      {detail && (
        <Body>
          {detail.unused && (
            <WarningBanner>
              Never referenced anywhere else in the workspace — likely unused.
            </WarningBanner>
          )}

          <Section>
            <SectionHeader>Dependency metrics</SectionHeader>
            <MetricRow>
              <span>Fan-in (files depending on this one)</span>
              <span>
                {detail.fanIn}
                {detail.fanInOutlier && <OutlierBadge> ⚠ outlier</OutlierBadge>}
              </span>
            </MetricRow>
            <MetricRow>
              <span>Fan-out (files this one depends on)</span>
              <span>
                {detail.fanOut}
                {detail.fanOutOutlier && <OutlierBadge> ⚠ outlier</OutlierBadge>}
              </span>
            </MetricRow>
          </Section>

          {(detail.providesContext.length > 0 || detail.consumesContext.length > 0) && (
            <Section>
              <SectionHeader>Context</SectionHeader>
              {detail.providesContext.length > 0 && (
                <MetricRow style={{ display: "block" }}>
                  <div>Provides:</div>
                  {detail.providesContext.map((name) => (
                    <ContextTag key={name}>{name}</ContextTag>
                  ))}
                </MetricRow>
              )}
              {detail.consumesContext.length > 0 && (
                <MetricRow style={{ display: "block" }}>
                  <div>Consumes:</div>
                  {detail.consumesContext.map((name) => (
                    <ContextTag key={name}>{name}</ContextTag>
                  ))}
                </MetricRow>
              )}
            </Section>
          )}

          <Section>
            <SectionHeader>Props</SectionHeader>
            {detail.props.length === 0 ? (
              <EmptyNotice>none</EmptyNotice>
            ) : (
              detail.props.map((prop) => (
                <PropRow key={prop.name}>
                  <div>
                    <PropName>{prop.name}</PropName>
                    <PropMeta>
                      {prop.type}
                      {prop.required ? "" : " · optional"}
                    </PropMeta>
                    {detail.deadProps.includes(prop.name) && <DeadPropBadge>dead</DeadPropBadge>}
                    {detail.drilledProps.includes(prop.name) && (
                      <DrilledPropBadge>drilled through</DrilledPropBadge>
                    )}
                  </div>
                  {prop.description && <PropDescription>{prop.description}</PropDescription>}
                </PropRow>
              ))
            )}
          </Section>

          <Section>
            <SectionHeader>Renders ({detail.renders.length})</SectionHeader>
            {detail.renders.length === 0 ? (
              <EmptyNotice>none found</EmptyNotice>
            ) : (
              detail.renders.map((ref) => (
                <RefButton key={ref.id} onClick={() => onSelectComponent(ref.id)}>
                  {ref.displayName}
                </RefButton>
              ))
            )}
          </Section>

          <Section>
            <SectionHeader>Rendered by ({detail.renderedBy.length})</SectionHeader>
            {detail.renderedBy.length === 0 ? (
              <EmptyNotice>nothing found — a likely entry point</EmptyNotice>
            ) : (
              detail.renderedBy.map((ref) => (
                <RefButton key={ref.id} onClick={() => onSelectComponent(ref.id)}>
                  {ref.displayName}
                </RefButton>
              ))
            )}
          </Section>
        </Body>
      )}
    </Panel>
  );
}
