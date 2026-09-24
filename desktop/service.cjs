const { normalizeCategory } = require('./categories.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Store, newId } = require('../storage/store.cjs');
function str(value, label, max = 5000, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}格式不正确`);
  return value.trim();
}
function language(value) {
  const raw = str(value, '语言', 50, true);
  try { return Intl.getCanonicalLocales(raw)[0]; } catch { throw new Error('请使用有效的语言代码，例如 zh-CN、en-US'); }
}
class Service {
  constructor(directory) {
    this.store = new Store(directory);
    this.directory = this.store.directory;
    fs.mkdirSync(path.join(this.directory, 'assets'), { recursive: true, mode: 0o700 });
    this.store.transaction(() => {
      let profile = this.store.list('profile')[0];
      if (!profile) profile = this.store.put({ type: 'profile', display_name: '本地学习者', native_language: 'zh-CN', ui_language: 'zh-CN', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      this.profileId = profile.block_id;
      if (!this.store.list('learning_config').length) this.store.put({ type: 'learning_config', profile_id: this.profileId, native_language: 'zh-CN', target_language: 'en-US', explanation_language: 'zh-CN', onboarding_complete: false, default_voice_ids: [], auto_synthesize: false, waveform_expanded: true });
    });
  }
  config() { return this.store.list('learning_config')[0]; }
  state() {
    return { recordings:this.store.list('recording'),recording_sources:this.store.list('recording_source'),recording_clips:this.store.list('recording_clip').filter(c=>c.body.status!=='archived'),config: this.config(), expressions: this.store.list('expression'), voices: this.store.list('voice'), samples: this.store.list('voice_sample'), integration: this.integration(), evaluations: this.store.list('evaluation'), syntheses: this.store.list('synthesis'), directory: this.directory };
  }
  entity(id, type) {
    const entity = this.store.get(id);
    if (!entity || entity.body.type !== type) throw new Error('记录不存在');
    return entity;
  }
  update(record, changes) { return this.store.put({ ...record.body, ...changes }, { id: record.block_id, expectedRevision: record.body.revision }); }
  saveSettings(input) {
    const native = language(input.native_language), target = language(input.target_language);
    if (native === target) throw new Error('母语和目标语言需要不同');
    return this.store.transaction(() => {
      const config = this.config();
      if (input.revision !== config.body.revision) throw new Error('设置已更新，请刷新后再试');
      return this.update(config, { native_language: native, target_language: target, explanation_language: native, onboarding_complete: true });
    });
  }
  addExpression(input) {
    const original = str(input.original, '原句', 10000, true);
    const improved = str(input.improved, '建议表达', 10000, true);
    const category = normalizeCategory(input.category ?? 'naturalness');
    const fields = {};
    for (const name of ['translation', 'explanation', 'pattern']) fields[name] = str(input[name] || '', name, 10000);
    const config = this.config().body;
    if (!config.onboarding_complete) throw new Error('请先设置母语和目标语言');
    return this.store.transaction(() => this.store.put({ type: 'expression', profile_id: this.profileId, original, improved, ...fields, category, language_pair: { native_language: config.native_language, target_language: config.target_language }, source: 'manual', source_occurred_at: Date.now(), content_revision: 1, acceptance: 'pending', favorite: false }));
  }
  editExpression(input) {
    return this.store.transaction(() => {
      const record = this.entity(input.id, 'expression');
      if (input.revision !== record.body.revision) throw new Error('记录已更新，请刷新后再试');
      if (input.action === 'favorite') return this.update(record, { favorite: !record.body.favorite });
      if (input.action === 'archive') return this.update(record, { status: record.body.status === 'archived' ? 'active' : 'archived', archived_at: record.body.status === 'archived' ? null : Date.now() });
      throw new Error('未知操作');
    });
  }
  saveVoice(input) {
    const name = str(input.name, '音色名称', 120, true), note = str(input.note || '', '备注', 2000);
    return this.store.transaction(() => {
      if (!input.id) return this.store.put({ type: 'voice', profile_id: this.profileId, name, note, default_sample_id: null, voice_revision: 1 });
      const record = this.entity(input.id, 'voice');
      if (input.revision !== record.body.revision) throw new Error('音色已更新，请刷新后再试');
      return this.update(record, { name, note });
    });
  }
  archiveVoice(input) {
    return this.store.transaction(() => {
      const record = this.entity(input.id, 'voice');
      if (input.revision !== record.body.revision) throw new Error('音色已更新，请刷新后再试');
      const archive = record.body.status !== 'archived';
      if (archive) {
        for (const config of this.store.list('learning_config')) {
          if (config.body.default_voice_ids.includes(input.id)) this.update(config, { default_voice_ids: config.body.default_voice_ids.filter(id => id !== input.id), links: config.body.links.filter(link => !(link.relation === 'default_voice' && link.target_id === input.id)) });
        }
      }
      return this.update(record, { status: archive ? 'archived' : 'active', archived_at: archive ? Date.now() : null });
    });
  }
  defaultVoice(input) {
    return this.store.transaction(() => {
      const voice = this.entity(input.id, 'voice');
      if (voice.body.status !== 'active' || !voice.body.default_sample_id) throw new Error('请先为未归档的音色添加录音');
      const config = this.config();
      return this.update(config, { default_voice_ids: [input.id], links: [{ relation: 'default_voice', target_id: input.id }] });
    });
  }
  defaultSample(input) {
    return this.store.transaction(() => {
      const voice = this.entity(input.voice_id, 'voice'), sample = this.entity(input.id, 'voice_sample');
      if (voice.body.status !== 'active' || sample.body.voice_id !== voice.block_id) throw new Error('此样本不可使用');
      if (voice.body.default_sample_id === input.id) return voice;
      return this.update(voice, { default_sample_id: input.id, voice_revision: voice.body.voice_revision + 1 });
    });
  }
  addSample(input) {
    const voice = this.entity(input.voice_id, 'voice');
    if (voice.body.status !== 'active') throw new Error('请先恢复已归档音色');
    const lang = language(input.language);
    const transcript = str(input.transcript || '', '录音文字', 10000);
    if (!(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 25 * 1024 * 1024) throw new Error('请选择小于 25 MB 的录音');
    const bytes = Buffer.from(input.bytes);
    const formats = { 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' };
    const mime = String(input.media_type).split(';')[0];
    if (!formats[mime]) throw new Error('暂不支持此音频格式');
    const header = bytes.subarray(0, 16);
    const supported = mime === 'audio/wav' ? header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE'
      : mime === 'audio/webm' ? header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : mime === 'audio/ogg' ? header.toString('ascii', 0, 4) === 'OggS'
      : mime === 'audio/mp4' ? header.toString('ascii', 4, 8) === 'ftyp'
      : header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
    if (!supported) throw new Error('音频内容与格式不匹配');
    if (!Number.isFinite(input.duration_ms) || input.duration_ms <= 0 || input.duration_ms > 600000) throw new Error('录音时长需在 10 分钟以内');
    const waveform = input.waveform;
    if (!Array.isArray(waveform) || waveform.length !== 64 || waveform.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('波形数据不正确');
    const assetId = newId(), sampleId = newId();
    const relative = `assets/${assetId}.${formats[mime]}`, filename = path.join(this.directory, relative), temporary = filename + '.tmp';
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, filename);
    try {
      return this.store.transaction(() => {
        this.store.put({ type: 'asset', profile_id: this.profileId, relative_path: relative, sha256: createHash('sha256').update(bytes).digest('hex'), media_type: mime, byte_size: bytes.length, duration_ms: Math.round(input.duration_ms) }, { id: assetId });
        const sample = this.store.put({ type: 'voice_sample', profile_id: this.profileId, voice_id: voice.block_id, asset_id: assetId, language: lang, transcript, transcript_verified: false, recorded_at: input.source === 'microphone' ? Date.now() : null, duration_ms: Math.round(input.duration_ms), waveform, links: [{ relation: 'voice', target_id: voice.block_id }, { relation: 'asset', target_id: assetId }] }, { id: sampleId });
        this.update(voice, { default_sample_id: voice.body.default_sample_id || sampleId, voice_revision: voice.body.voice_revision + (voice.body.default_sample_id ? 0 : 1), links: [...voice.body.links, { relation: 'sample', target_id: sampleId }] });
        return sample;
      });
    } catch (error) { fs.unlinkSync(filename); throw error; }
  }
  asset(id) {
    const record = this.entity(id, 'asset');
    const relative = record.body.relative_path;
    if (!/^assets\/[0-9a-f]{32}\.(wav|mp3|m4a|ogg|webm)$/.test(relative)) throw new Error('无效的音频路径');
    const filename = path.join(this.directory, relative);
    const resolved = fs.realpathSync(filename);
    if (!resolved.startsWith(fs.realpathSync(path.join(this.directory, 'assets')) + path.sep)) throw new Error('无效的音频路径');
    return { filename: resolved, media_type: record.body.media_type };
  }
  backup(destination) {
    const target = path.resolve(destination);
    if (target === this.directory || target.startsWith(this.directory + path.sep)) throw new Error('备份目标不能位于当前数据目录内');
    if (fs.existsSync(target)) throw new Error('备份目录已存在，请选择新目录');
    // Main-process operations are synchronous: no interleaving DB writes or asset commits during this snapshot.
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    try {
      this.store.transaction(() => {
        for (const name of ['SayAgain', 'SayAgain1', 'SayAgain2']) fs.copyFileSync(path.join(this.directory, name), path.join(target, name));
        fs.cpSync(path.join(this.directory, 'assets'), path.join(target, 'assets'), { recursive: true, dereference: false });
        fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ schema_version: 1, routing_version: 1, created_at: Date.now(), includes: ['SayAgain', 'SayAgain1', 'SayAgain2', 'assets'] }, null, 2));
      });
    } catch (error) { fs.rmSync(target, { recursive: true, force: true }); throw error; }
    return target;
  }
  close() { this.store.close(); }
}
require('./review.cjs').installReview(Service);
module.exports = { Service };

require('./recordings.cjs')(Service);

require('./confirmed-turns.cjs').install(Service);
