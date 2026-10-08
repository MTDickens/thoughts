-- D1 schema for thoughts comments (current = v1 + migrations/0002 + 0003). Fresh database: run this file only.
-- anchor_type:
--   text        -> anchor_id = data-section id; quote/prefix/suffix = text-quote selector
--   element     -> anchor_id = data-anchor-id of an element (image, table, viz widget) or 'page'
--   media_time  -> anchor_id = data-anchor-id of a <video>/<audio>; media_t = seconds
CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  page        TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK (anchor_type IN ('text', 'element', 'media_time')),
  anchor_id   TEXT NOT NULL,
  quote       TEXT NOT NULL DEFAULT '',
  prefix      TEXT NOT NULL DEFAULT '',
  suffix      TEXT NOT NULL DEFAULT '',
  media_t     REAL,
  parent_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  nickname    TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  ip_hash     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  author_role TEXT NOT NULL DEFAULT 'anon',   -- 'visitor' | 'agent'; old rows: 'anon', 'owner'
  author_name TEXT NOT NULL DEFAULT '',
  edited_at   INTEGER,
  edited_by   TEXT NOT NULL DEFAULT '',
  resolved_at INTEGER,
  resolved_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_role ON comments (author_role, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_resolved ON comments (page, resolved_at);

-- one row per write (create/edit/delete/resolve/reopen): rate limits + 30-day audit trail
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
