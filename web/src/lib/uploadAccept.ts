/** Shared upload limits / accept list for RecordingsPanel + AppDropOverlay.
 * Keep in sync with backend `ALLOWED_EXTENSIONS` (T-046).
 */

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Extensions without dots — must match server allowlist. */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "ogg",
  "oga",
  "flac",
  "aac",
  "opus",
  "amr",
  "wma",
  "mp4",
  "mov",
  "webm",
  "mkv",
  "3gp",
  "m4v",
  "avi",
] as const;

const EXT_OK = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS);

export const ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isAcceptedUpload(file: File): boolean {
  return EXT_OK.has(extensionOf(file.name));
}
