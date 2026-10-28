import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="dy-empty">
      <h2 className="dy-empty__title">{title}</h2>
      {children ? <p className="dy-empty__body">{children}</p> : null}
      {action ? <div className="dy-empty__action">{action}</div> : null}
    </div>
  );
}
