-- agent-org communication database
-- Three channels with hard ACL separation:
--   c-suite     James (CTO), John (Chief Engineer), Tim (Exec Assistant)
--   dept-heads  Tim + the 5 department heads
--   dev-floor   Department heads + their juniors
--
-- ACL is enforced in comms.py, not at the SQL layer. The DB just stores facts.

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel     TEXT NOT NULL,
    from_agent  TEXT NOT NULL,
    to_agent    TEXT,
    thread_id   INTEGER REFERENCES messages(id),
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    work_order  TEXT,
    posted_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread     ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_to         ON messages(to_agent, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_wo         ON messages(work_order);

-- Per-agent read cursor so `read --unread` is cheap.
CREATE TABLE IF NOT EXISTS read_state (
    agent        TEXT NOT NULL,
    channel      TEXT NOT NULL,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent, channel)
);

-- Path claims for conflict avoidance and the path_guard hook.
CREATE TABLE IF NOT EXISTS claims (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT NOT NULL,
    agent       TEXT NOT NULL,
    work_order  TEXT,
    claimed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    released_at TEXT,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'released', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_claims_active ON claims(status, path);
CREATE INDEX IF NOT EXISTS idx_claims_agent  ON claims(agent, status);

-- Audit log for accountability (CTO / Chief Engineer can review who did what).
CREATE TABLE IF NOT EXISTS audit (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    agent  TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit(agent, id DESC);
