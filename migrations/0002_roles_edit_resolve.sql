-- 2026-10-08: owner/agent roles, edit, resolve. Additive only: existing rows keep working
-- (old rows become author_role='anon', not edited, open).
ALTER TABLE comments ADD COLUMN author_role TEXT NOT NULL DEFAULT 'anon';  -- 'owner' | 'agent' | 'anon'
ALTER TABLE comments ADD COLUMN author_name TEXT NOT NULL DEFAULT '';      -- 'Max' for owner; agent name; '' for anon (uses nickname)
ALTER TABLE comments ADD COLUMN edited_at INTEGER;                         -- ms; NULL = never edited
ALTER TABLE comments ADD COLUMN resolved_at INTEGER;                       -- ms; NULL = open (set on root + replies)
ALTER TABLE comments ADD COLUMN resolved_by TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_comments_role ON comments (author_role, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_resolved ON comments (page, resolved_at);
