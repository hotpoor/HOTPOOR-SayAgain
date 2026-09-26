const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const newId = () => randomUUID().replaceAll('-', '');
const validId = id => typeof id === 'string' && /^[0-9a-f]{32}$/.test(id);
function shardFor(id) {
  if (!validId(id)) throw new Error('无效的实体 ID');
  return parseInt(id.at(-1), 16) % 2 + 1;
}
class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.directory, 'SayAgain'));
    try {
      if (this.db.prepare('PRAGMA user_version').get().user_version > 1) throw new Error('数据库来自更新版本的 SayAgain');
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
      this.db.exec(fs.readFileSync(path.join(__dirname, 'index.sql'), 'utf8'));
      for (const number of [1, 2]) {
        const filename = path.join(this.directory, `SayAgain${number}`);
        const shard = new DatabaseSync(filename);
        try { if (shard.prepare('PRAGMA user_version').get().user_version > 1) throw new Error('数据库来自更新版本的 SayAgain'); shard.exec('PRAGMA journal_mode=DELETE;'); shard.exec(fs.readFileSync(path.join(__dirname, 'entities.sql'), 'utf8')); }
        finally { shard.close(); }
        this.db.prepare(`ATTACH DATABASE ? AS shard${number}`).run(filename);
        this.db.exec(`PRAGMA shard${number}.synchronous=FULL;`);
      }
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) {
    if (this.inTransaction) throw new Error('不支持嵌套事务');
    this.db.exec('BEGIN IMMEDIATE'); this.inTransaction = true;
    try { const result = fn(); if (result?.then) throw new Error('事务内不能执行异步操作'); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.inTransaction = false; }
  }
  get(id) {
    const row = this.db.prepare(`SELECT * FROM shard${shardFor(id)}.entities WHERE block_id=?`).get(id);
    return row ? { ...row, body: JSON.parse(row.body) } : null;
  }
  list(type) {
    return this.db.prepare('SELECT block_id FROM entity_index WHERE entity_type=? ORDER BY createtime DESC,block_id').all(type).map(row => this.get(row.block_id)).filter(record => record.body.status !== 'deleted');
  }
  all() { return this.db.prepare('SELECT block_id FROM entity_index').all().map(row=>this.get(row.block_id)); }
  remove(id) {
    if(!this.inTransaction)throw Error('删除必须在事务内执行');
    this.db.prepare(`DELETE FROM shard${shardFor(id)}.entities WHERE block_id=?`).run(id);
    this.db.prepare('DELETE FROM entity_index WHERE block_id=?').run(id);
    this.db.prepare('DELETE FROM dedupe_index WHERE block_id=?').run(id);
    this.db.prepare('DELETE FROM relation_index WHERE source_id=? OR target_id=?').run(id,id);
  }
  // Internal operations only; callers expose explicit business methods, never arbitrary body writes.
  put(body, { id = newId(), expectedRevision = null } = {}) {
    if (!this.inTransaction) return this.transaction(() => this.put(body, { id, expectedRevision }));
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.type !== 'string') throw new Error('无效的实体内容');
    const current = this.get(id);
    if (current && current.body.revision !== expectedRevision) throw new Error('记录已更新，请刷新后再试');
    if (!current && expectedRevision !== null) throw new Error('记录不存在');
    if (current && body.type !== current.body.type) throw new Error('不能修改实体类型');
    const time = Math.max(Date.now(), current?.updatetime || 0);
    const record = {
      block_id: id,
      body: { schema_version: 1, status: 'active', archived_at: null, deleted_at: null, links: [], dedupe_keys: [], ...body, revision: (current?.body.revision || 0) + 1 },
      createtime: current?.createtime || time, updatetime: time,
    };
    const json = JSON.stringify(record.body);
    if (Buffer.byteLength(json) > 256 * 1024) throw new Error('记录内容过大');
    this.db.prepare(`INSERT INTO shard${shardFor(id)}.entities VALUES(?,?,?,?) ON CONFLICT(block_id) DO UPDATE SET body=excluded.body,updatetime=excluded.updatetime`).run(id, json, record.createtime, time);
    this.project(record);
    return record;
  }
  project(record) {
    const { block_id: id, body: b, createtime, updatetime } = record;
    this.db.prepare(`INSERT OR REPLACE INTO entity_index VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, shardFor(id), b.type, b.profile_id || null, b.voice_id || b.evaluation_id || null, b.status, b.native_language || b.language_pair?.native_language || null, b.target_language || b.language_pair?.target_language || null, b.source_occurred_at || b.recorded_at || createtime, createtime, updatetime, b.revision);
    this.db.prepare('DELETE FROM relation_index WHERE source_id=?').run(id);
    for (const link of b.links) {
      if (!validId(link.target_id) || typeof link.relation !== 'string') throw new Error('无效的实体引用');
      this.db.prepare('INSERT INTO relation_index VALUES(?,?,?)').run(id, link.relation, link.target_id);
    }
    this.db.prepare('DELETE FROM dedupe_index WHERE block_id=?').run(id);
    for (const key of b.dedupe_keys) this.db.prepare('INSERT INTO dedupe_index VALUES(?,?,?)').run(key.scope, key.key, id);
  }
  rebuild() {
    return this.transaction(() => {
      this.db.exec('DELETE FROM entity_index; DELETE FROM relation_index; DELETE FROM dedupe_index;');
      let count = 0;
      for (const number of [1, 2]) {
        for (const row of this.db.prepare(`SELECT * FROM shard${number}.entities`).all()) {
          if (shardFor(row.block_id) !== number) throw new Error('实体分库不匹配');
          this.project({ ...row, body: JSON.parse(row.body) }); count++;
        }
      }
      return count;
    });
  }
  close() { this.db.close(); }
}
module.exports = { Store, newId, shardFor, validId };
