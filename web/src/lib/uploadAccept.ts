/** Shared upload limits / accept list for RecordingsPanel + AppDropOverlay. */

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const ACCEPT =
  ".mp3,.m4a,.wav,.ogg,.oga,.flac,.aac,.mp4,.mov,.webm,.mkv,audio/*,video/*";

const EXT_OK = new Set([
  "mp3",
  "m4a",
  "wav",
  "ogg",
  "oga",
  "flac",
  "aac",
  "mp4",
  "mov",
  "webm",
  "mkv",
]);

export function isAcceptedUpload(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    return true;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_OK.has(ext);
}
