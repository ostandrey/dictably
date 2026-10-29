/** In-memory stash for drops on non-recordings routes (SPA-safe). */
let pending: File[] = [];

export function stashFiles(files: FileList | File[]) {
  pending = [...Array.from(files), ...pending];
}

export function takeStashedFiles(): File[] {
  const out = pending;
  pending = [];
  return out;
}
