-- Memory tables schema (v1)
CREATE TABLE IF NOT EXISTS schema_info (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT,
    version TEXT,
    description TEXT,
    schema TEXT NOT NULL,
    injection TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    is_default BOOLEAN DEFAULT 0,
    is_builtin BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    contact_id TEXT,
    group_id TEXT,
    row_data TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    is_pinned BOOLEAN DEFAULT 0,
    priority INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (template_id) REFERENCES templates(id)
);

CREATE INDEX IF NOT EXISTS idx_memories_contact ON memories(contact_id);
CREATE INDEX IF NOT EXISTS idx_memories_group ON memories(group_id);
CREATE INDEX IF NOT EXISTS idx_memories_template ON memories(template_id, table_id);
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(is_active);
CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(is_pinned);
