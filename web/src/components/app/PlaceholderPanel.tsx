"use client";

import type { ReactNode } from "react";
import { AppLink } from "@/components/app/AppLink";

export function PlaceholderPanel({
  illustration,
  title,
  body,
  actionHref,
  actionLabel,
  "data-testid": testId,
}: {
  illustration: ReactNode;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  "data-testid"?: string;
}) {
  return (
    <div className="dy-empty dy-empty--rich" data-placeholder={testId}>
      <div className="dy-empty__ill" aria-hidden>
        {illustration}
      </div>
      <h1 className="dy-empty__title">{title}</h1>
      <p className="dy-empty__body">{body}</p>
      {actionHref && actionLabel ? (
        <div className="dy-empty__action">
          <AppLink href={actionHref} className="btn-primary">
            {actionLabel}
          </AppLink>
        </div>
      ) : null}
    </div>
  );
}
