import { useMemo, useState } from "react";
import styled from "styled-components";
import type { Dehydrated, DehydratedData, HooksNode } from "react-devtools-inline/frontend";
import {
  DEHYDRATED_META_KEYS,
  buildDehydrationIndex,
  classifyPath,
  formatSentinel,
  type DehydrationIndex,
  type InspectableCategory,
  type InspectorState,
} from "../elementInspection";

export interface InspectorPanelProps {
  theme: "light" | "dark";
  label: string;
  typeLabel: string;
  state: InspectorState;
  onExpand: (category: InspectableCategory, path: Array<string | number>) => void;
  onClose: () => void;
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

const RowLine = styled.div<{ $depth: number }>`
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 12px 1px ${(props) => 20 + props.$depth * 12}px;
  white-space: nowrap;
  overflow: hidden;
`;

const RowName = styled.span`
  color: #a5d6ff;
  flex: 0 0 auto;
`;

const RowValue = styled.span`
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Toggle = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  width: 12px;
  flex: 0 0 auto;
  opacity: 0.7;
  font-family: monospace;
  &:hover {
    opacity: 1;
  }
`;

const ToggleSpacer = styled.span`
  display: inline-block;
  width: 12px;
  flex: 0 0 auto;
`;

const HookLabel = styled.div<{ $depth: number }>`
  padding: 3px 12px 0 ${(props) => 20 + props.$depth * 12}px;
  font-weight: 600;
  opacity: 0.85;
`;

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return String(value);
}

interface ValueRowProps {
  name: string;
  value: unknown;
  path: Array<string | number>;
  index: DehydrationIndex;
  depth: number;
  onExpand: (path: Array<string | number>) => void;
}

// Recursively renders one value in a props/state/hooks tree, aware that any
// node may be a Dehydrated placeholder (leaf, expandable if `inspectable`) or
// an "unserializable" wrapper (its real children are extra own keys) rather
// than a plain value.
function ValueRow({ name, value, path, index, depth, onExpand }: ValueRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const kind = classifyPath(index, path);

  if (kind === "placeholder") {
    const placeholder = value as Dehydrated;
    const sentinel = formatSentinel(placeholder.type);
    if (sentinel !== undefined) {
      return (
        <RowLine $depth={depth}>
          <ToggleSpacer />
          <RowName>{name}</RowName>
          <RowValue>{sentinel}</RowValue>
        </RowLine>
      );
    }

    const handleToggle = () => {
      if (!isOpen && placeholder.inspectable) {
        onExpand(path);
      }
      setIsOpen((open) => !open);
    };

    return (
      <RowLine $depth={depth} title={placeholder.preview_long ?? undefined}>
        {placeholder.inspectable ? (
          <Toggle onClick={handleToggle}>{isOpen ? "−" : "+"}</Toggle>
        ) : (
          <ToggleSpacer />
        )}
        <RowName>{name}</RowName>
        <RowValue>{placeholder.preview_short ?? placeholder.type}</RowValue>
      </RowLine>
    );
  }

  if (kind === "unserializable") {
    const wrapper = value as Record<string, unknown>;
    const entries = Object.entries(wrapper).filter(
      ([key]) => !DEHYDRATED_META_KEYS.has(key),
    );
    return (
      <>
        <RowLine $depth={depth} title={String(wrapper.preview_long ?? "")}>
          {entries.length > 0 ? (
            <Toggle onClick={() => setIsOpen((open) => !open)}>
              {isOpen ? "−" : "+"}
            </Toggle>
          ) : (
            <ToggleSpacer />
          )}
          <RowName>{name}</RowName>
          <RowValue>{String(wrapper.preview_short ?? wrapper.type ?? "")}</RowValue>
        </RowLine>
        {isOpen &&
          entries.map(([key, child]) => (
            <ValueRow
              key={key}
              name={key}
              value={child}
              path={path.concat(key)}
              index={index}
              depth={depth + 1}
              onExpand={onExpand}
            />
          ))}
      </>
    );
  }

  if (value === null || typeof value !== "object") {
    return (
      <RowLine $depth={depth}>
        <ToggleSpacer />
        <RowName>{name}</RowName>
        <RowValue>{formatPrimitive(value)}</RowValue>
      </RowLine>
    );
  }

  const isArrayValue = Array.isArray(value);
  const entries: Array<[string | number, unknown]> = isArrayValue
    ? (value as unknown[]).map((item, itemIndex): [string | number, unknown] => [itemIndex, item])
    : Object.entries(value as Record<string, unknown>);

  return (
    <>
      <RowLine $depth={depth}>
        {entries.length > 0 ? (
          <Toggle onClick={() => setIsOpen((open) => !open)}>
            {isOpen ? "−" : "+"}
          </Toggle>
        ) : (
          <ToggleSpacer />
        )}
        <RowName>{name}</RowName>
        <RowValue>{isArrayValue ? `Array(${entries.length})` : "Object"}</RowValue>
      </RowLine>
      {isOpen &&
        entries.map(([key, child]) => (
          <ValueRow
            key={key}
            name={String(key)}
            value={child}
            path={path.concat(key)}
            index={index}
            depth={depth + 1}
            onExpand={onExpand}
          />
        ))}
    </>
  );
}

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

function HookRow({
  hook,
  path,
  index,
  depth,
  onExpand,
}: {
  hook: HooksNode;
  path: Array<string | number>;
  index: DehydrationIndex;
  depth: number;
  onExpand: (path: Array<string | number>) => void;
}) {
  const label = hook.id !== null ? `${hook.id + 1}. ${hook.name}` : hook.name;
  return (
    <>
      <HookLabel $depth={depth}>{label}</HookLabel>
      <ValueRow
        name="value"
        value={hook.value}
        path={path.concat("value")}
        index={index}
        depth={depth + 1}
        onExpand={onExpand}
      />
      {hook.subHooks.map((sub, subIndex) => (
        <HookRow
          key={subIndex}
          hook={sub}
          path={path.concat("subHooks", subIndex)}
          index={index}
          depth={depth + 1}
          onExpand={onExpand}
        />
      ))}
    </>
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
// protocol (see elementInspection.ts). Structured so a follow-up task can add
// a "jump to source" button into the header alongside the close button.
export default function InspectorPanel({
  theme,
  label,
  typeLabel,
  state,
  onExpand,
  onClose,
}: InspectorPanelProps) {
  const { element, loading, error } = state;

  return (
    <Panel $theme={theme} className={`reaction-theme-${theme}`}>
      <Header>
        <div>
          <Title>{label}</Title>
          <TypeLine>
            {typeLabel}
            {element?.key != null ? ` · key: ${String(element.key)}` : ""}
          </TypeLine>
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
