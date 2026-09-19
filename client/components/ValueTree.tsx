import { useState } from "react";
import styled from "styled-components";
import type { Dehydrated, HooksNode } from "react-devtools-inline/frontend";
import {
  DEHYDRATED_META_KEYS,
  classifyPath,
  formatSentinel,
  type DehydrationIndex,
} from "../elementInspection";

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

export interface ValueRowProps {
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
export function ValueRow({ name, value, path, index, depth, onExpand }: ValueRowProps) {
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

export interface HookRowProps {
  hook: HooksNode;
  path: Array<string | number>;
  index: DehydrationIndex;
  depth: number;
  onExpand: (path: Array<string | number>) => void;
}

export function HookRow({ hook, path, index, depth, onExpand }: HookRowProps) {
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
