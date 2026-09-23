-- Execute separately in SayAgain1 and SayAgain2. Each has one application table.
CREATE TABLE IF NOT EXISTS entities (
    block_id TEXT NOT NULL PRIMARY KEY
        CHECK(length(block_id) = 32 AND block_id NOT GLOB '*[^0-9a-f]*'),
    body TEXT NOT NULL
        CHECK(json_valid(body))
        CHECK(json_type(body) = 'object')
        CHECK(json_type(body, '$.type') IS 'text')
        CHECK(json_type(body, '$.schema_version') IS 'integer')
        CHECK(json_type(body, '$.revision') IS 'integer'),
    createtime INTEGER NOT NULL CHECK(typeof(createtime) = 'integer' AND createtime >= 0),
    updatetime INTEGER NOT NULL CHECK(typeof(updatetime) = 'integer' AND updatetime >= createtime)
) WITHOUT ROWID;
PRAGMA user_version = 1;
