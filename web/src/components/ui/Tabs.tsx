"use client";

import type { ReactNode } from "react";

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
  return (
    <div className="dy-tabs" role="tablist" aria-label={ariaLabel}>
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
