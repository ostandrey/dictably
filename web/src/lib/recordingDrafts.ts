/** Unsaved recording edits survive reload / re-login (T-040). */

export type RecordingDraft = {
  title?: string;
  meetingDate?: string;
  words?: Record<string, string>;
};

const KEY = (mediaId: string) => `dictably.draft.${mediaId}`;

export function loadRecordingDraft(mediaId: string): RecordingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY(mediaId));
    if (!raw) return null;
    return JSON.parse(raw) as RecordingDraft;
  } catch {
    return null;
  }
}

export function saveRecordingDraft(mediaId: string, draft: RecordingDraft): void {
  if (typeof window === "undefined") return;
  try {
    const cur = loadRecordingDraft(mediaId) ?? {};
    const next: RecordingDraft = { ...cur };
    if ("title" in draft) {
      if (draft.title) next.title = draft.title;
      else delete next.title;
    }
    if ("meetingDate" in draft) {
      if (draft.meetingDate) next.meetingDate = draft.meetingDate;
      else delete next.meetingDate;
    }
    if ("words" in draft) {
      if (draft.words && Object.keys(draft.words).length) next.words = draft.words;
      else delete next.words;
    }
    const empty =
      !next.title &&
      !next.meetingDate &&
      (!next.words || !Object.keys(next.words).length);
    if (empty) localStorage.removeItem(KEY(mediaId));
    else localStorage.setItem(KEY(mediaId), JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function clearRecordingDraft(mediaId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY(mediaId));
  } catch {
    /* ignore */
  }
}
