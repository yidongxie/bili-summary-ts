/** Shared date/time helpers — single source of truth across the project. */

/** e.g. "2026-07-28 15:55:47" — SQL datetime format */
export function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** e.g. "2026-07-28" — date only */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
