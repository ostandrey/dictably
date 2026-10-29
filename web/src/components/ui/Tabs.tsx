"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type TabItem = {
  id: string;
  label: string;
  count?: number;
};

export function Tabs({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  "aria-label"?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const selected = root.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!selected) return;
    setIndicator({ left: selected.offsetLeft, width: selected.offsetWidth });
  }, [value, items]);

  return (
    <div
      className="dy-tabs"
      role="tablist"
      aria-label={ariaLabel}
      ref={listRef}
    >
      <span
        className="dy-tabs__indicator"
        aria-hidden
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: indicator.width,
        }}
      />
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="dy-tab"
            aria-selected={selected}
            id={`tab-${item.id}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count != null ? (
              <span className="dy-tab__count">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" aria-labelledby={`tab-${id}`} id={`panel-${id}`}>
      {children}
    </div>
  );
}
