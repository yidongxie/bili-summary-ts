import Database from "better-sqlite3";

const INTERRUPTED_TASK_ERROR = "服务重启，任务已中断，请重新提交";
const TERMINAL_TASK_RETENTION_MS = parseInt(
  process.env.SUMMARY_TASK_RETENTION_MS || String(14 * 24 * 60 * 60 * 1000),
  10
);

export function runStartupMaintenance(db: Database.Database): void {
  const now = Date.now();
  const cutoff = now - TERMINAL_TASK_RETENTION_MS;

  try {
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  } catch (err) {
    console.error("[maintenance] session cleanup failed", err);
  }

  try {
    db.prepare(
      "UPDATE summary_tasks SET status = 'error', progress = '', error = ?, updated_at = ? WHERE status IN ('pending', 'running')"
    ).run(INTERRUPTED_TASK_ERROR, now);
  } catch (err) {
    console.error("[maintenance] task interruption cleanup failed", err);
  }

  try {
    db.prepare("DELETE FROM summary_tasks WHERE status IN ('done', 'error') AND updated_at < ?").run(cutoff);
  } catch (err) {
    console.error("[maintenance] old task cleanup failed", err);
  }
}
