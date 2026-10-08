-- D1 schema for thoughts comments (current = v1 + migrations/0002). Fresh database: run this file only.
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
  author_role TEXT NOT NULL DEFAULT 'anon',   -- 'owner' | 'agent' | 'anon'
  author_name TEXT NOT NULL DEFAULT '',
  edited_at   INTEGER,
  resolved_at INTEGER,
  resolved_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_role ON comments (author_role, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_resolved ON comments (page, resolved_at);
