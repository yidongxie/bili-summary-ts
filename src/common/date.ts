/** Shared date/time helpers — single source of truth across the project. */

/** e.g. "2026-07-28 15:55:47" — SQL datetime format */
export function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** e.g. "2026-07-28" — date only */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format seconds as "m:ss" or "h:mm:ss". */
export function formatDuration(seconds: number): string {
  seconds = Number(seconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
