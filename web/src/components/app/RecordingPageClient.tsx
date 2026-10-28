"use client";

import { useSyncExternalStore } from "react";
import { RecordingView } from "./RecordingView";

type Props = {
  locale: "en" | "uk";
  recordingsHref: string;
  recordingsLabel: string;
  renameLabel: string;
  findPlaceholder: string;
  ourLabel: string;
  theirLabel: string;
  saveLabel: string;
  cancelLabel: string;
  errorLabel: string;
  missingLabel: string;
  backToNowLabel: string;
  matchCountLabel: string;
  transcriptTab: string;
  minutesTab: string;
  minutesStub: string;
};

function subscribe() {
  return () => undefined;
}

function readMediaId(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("id");
  if (q) return q;
  const m = window.location.pathname.match(
    /\/(?:uk\/)?app\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1] ?? null;
}

export function RecordingPageClient(props: Props) {
  const mediaId = useSyncExternalStore(subscribe, readMediaId, () => null);

  if (!mediaId) {
    return (
      <p className="dy-muted" data-recording="missing">
        {props.missingLabel}{" "}
        <a href={props.recordingsHref}>{props.recordingsLabel}</a>
      </p>
    );
  }

  return (
    <RecordingView
      mediaId={mediaId}
      locale={props.locale}
      recordingsHref={props.recordingsHref}
      recordingsLabel={props.recordingsLabel}
      renameLabel={props.renameLabel}
      findPlaceholder={props.findPlaceholder}
      ourLabel={props.ourLabel}
      theirLabel={props.theirLabel}
      saveLabel={props.saveLabel}
      cancelLabel={props.cancelLabel}
      errorLabel={props.errorLabel}
      backToNowLabel={props.backToNowLabel}
      matchCountLabel={props.matchCountLabel}
      transcriptTab={props.transcriptTab}
      minutesTab={props.minutesTab}
      minutesStub={props.minutesStub}
    />
  );
}
