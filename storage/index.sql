-- SayAgain: rebuildable indexes only. Entity bodies remain the source of truth.
CREATE TABLE IF NOT EXISTS entity_index (
    block_id TEXT NOT NULL PRIMARY KEY
        CHECK(length(block_id) = 32 AND block_id NOT GLOB '*[^0-9a-f]*'),
    shard INTEGER NOT NULL CHECK(shard IN (1,2)),
    entity_type TEXT NOT NULL,
    profile_id TEXT,
    parent_id TEXT,
    status TEXT NOT NULL,
    native_language TEXT,
    target_language TEXT,
    occurred_at INTEGER,
    createtime INTEGER NOT NULL,
    updatetime INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_entity_browse
    ON entity_index(profile_id, entity_type, status, target_language, occurred_at, block_id);
CREATE INDEX IF NOT EXISTS idx_entity_parent ON entity_index(parent_id, entity_type);

-- Rebuildable deduplication projection; never insert a key without its owner entity.
CREATE TABLE IF NOT EXISTS dedupe_index (
    scope TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    block_id TEXT NOT NULL,
    PRIMARY KEY(scope, dedupe_key)
) WITHOUT ROWID;

-- Backend-neutral edges; avoid cross-database FK claims.
CREATE TABLE IF NOT EXISTS relation_index (
    source_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY(source_id, relation, target_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_relation_target ON relation_index(target_id, relation);
PRAGMA user_version = 1;
