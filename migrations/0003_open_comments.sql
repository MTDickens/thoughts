-- 2026-10-08: open comments (anyone may edit/delete/resolve). Additive only.
-- write_log: one row per write (create/edit/delete/resolve/reopen); used for rate limits and as a 30-day audit trail.
CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  comment_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_write_log_ip ON write_log (ip_hash, at);
CREATE INDEX IF NOT EXISTS idx_write_log_role ON write_log (role, at);
CREATE INDEX IF NOT EXISTS idx_write_log_at ON write_log (at);
-- who last edited a comment (display name; '匿名' when empty)
ALTER TABLE comments ADD COLUMN edited_by TEXT NOT NULL DEFAULT '';
