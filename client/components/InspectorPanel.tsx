import { useMemo } from "react";
import styled from "styled-components";
import type { DehydratedData, HooksNode } from "react-devtools-inline/frontend";
import {
  buildDehydrationIndex,
  type InspectableCategory,
  type InspectorState,
} from "../elementInspection";
import { HookRow, ValueRow } from "./ValueTree";

export interface RenderReason {
  description: string;
  wasted: boolean;
}

export interface InspectorPanelProps {
  theme: "light" | "dark";
  label: string;
  typeLabel: string;
  state: InspectorState;
  onExpand: (category: InspectableCategory, path: Array<string | number>) => void;
  onClose: () => void;
  onOpenSource: (fileName: string, lineNumber: number, columnNumber: number) => void;
  // Only set when the latest profiling run's most recent commit actually
  // recorded this element running. Absent otherwise -- never profiled and
  // "profiled but this element bailed out every commit" both render nothing
  // here, deliberately, so the panel never implies "this never re-renders"
  // when the real state is just "not observed".
  renderReason?: RenderReason;
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

const RenderReasonLine = styled.div`
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const WastedBadge = styled.span`
  border: 1px solid #ff8a4c;
  color: #ff8a4c;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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

const ErrorNotice = styled(Notice)`
  color: #ff7b72;
`;

function ObjectSection({
  title,
  dehydrated,
  onExpand,
}: {
  title: string;
  dehydrated: DehydratedData | null;
  onExpand: (path: Array<string | number>) => void;
}) {
  const index = useMemo(
    () => (dehydrated ? buildDehydrationIndex(dehydrated) : null),
    [dehydrated],
  );
  if (!dehydrated || !index) {
    return null;
  }
  const data = dehydrated.data;
  const entries =
    data !== null && typeof data === "object"
      ? Object.entries(data as Record<string, unknown>)
      : [];

  return (
    <Section>
      <SectionHeader>{title}</SectionHeader>
      {entries.length === 0 ? (
        <EmptyNotice>none</EmptyNotice>
      ) : (
        entries.map(([key, value]) => (
          <ValueRow
            key={key}
            name={key}
            value={value}
            path={[key]}
            index={index}
            depth={0}
            onExpand={onExpand}
          />
        ))
      )}
    </Section>
  );
}

function HooksSection({
  dehydrated,
  onExpand,
}: {
  dehydrated: DehydratedData | null;
  onExpand: (path: Array<string | number>) => void;
}) {
  const index = useMemo(
    () => (dehydrated ? buildDehydrationIndex(dehydrated) : null),
    [dehydrated],
  );
  if (!dehydrated || !index) {
    return null;
  }
  const hooks = (dehydrated.data as HooksNode[] | null) ?? [];

  return (
    <Section>
      <SectionHeader>hooks</SectionHeader>
      {hooks.length === 0 ? (
        <EmptyNotice>none</EmptyNotice>
      ) : (
        hooks.map((hook, hookIndex) => (
          <HookRow
            key={hookIndex}
            hook={hook}
            path={[hookIndex]}
            index={index}
            depth={0}
            onExpand={onExpand}
          />
        ))
      )}
    </Section>
  );
}

// Selected-element details panel: name/type header plus expandable Props /
// State / Hooks sections, fed by the live inspectElement/inspectedElement
// protocol (see elementInspection.ts).
export default function InspectorPanel({
  theme,
  label,
  typeLabel,
  state,
  onExpand,
  onClose,
  onOpenSource,
  renderReason,
}: InspectorPanelProps) {
  const { element, loading, error } = state;
  const source = element?.source ?? null;

  return (
    <Panel $theme={theme} className={`reaction-theme-${theme}`}>
      <Header>
        <div>
          <Title>{label}</Title>
          <TypeLine>
            {typeLabel}
            {element?.key != null ? ` · key: ${String(element.key)}` : ""}
          </TypeLine>
          {renderReason && (
            <RenderReasonLine>
              <span>{renderReason.description}</span>
              {renderReason.wasted && <WastedBadge>Wasted render</WastedBadge>}
            </RenderReasonLine>
          )}
          {source && (
            <div>
              <OpenSourceButton
                onClick={() => onOpenSource(source[1], source[2], source[3])}
                title={`${source[1]}:${source[2]}:${source[3]}`}
              >
                Open in editor
              </OpenSourceButton>
            </div>
          )}
        </div>
        <CloseButton onClick={onClose} title="Close">
          &times;
        </CloseButton>
      </Header>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {loading && <Notice>Loading…</Notice>}
      {element && (
        <Body>
          <ObjectSection
            title="props"
            dehydrated={element.props}
            onExpand={(path) => onExpand("props", path)}
          />
          <ObjectSection
            title="state"
            dehydrated={element.state}
            onExpand={(path) => onExpand("state", path)}
          />
          <HooksSection
            dehydrated={element.hooks}
            onExpand={(path) => onExpand("hooks", path)}
          />
        </Body>
      )}
    </Panel>
  );
}
