export function sanitizeNotePosition(x: number, y: number): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x,
    y
  };
}
