import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
  illustration,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="dy-empty dy-empty--rich">
      {illustration ? (
        <div className="dy-empty__ill" aria-hidden>
          {illustration}
        </div>
      ) : null}
      <h2 className="dy-empty__title">{title}</h2>
      {children ? <p className="dy-empty__body">{children}</p> : null}
      {action ? <div className="dy-empty__action">{action}</div> : null}
    </div>
  );
}
