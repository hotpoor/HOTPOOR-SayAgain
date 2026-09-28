// Explicit registration of a separate IndexTTS 2.5 environment. Never installs anything.
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {createHash} = require('node:crypto');

const MODEL = 'IndexTeam/IndexTTS-2.5';
const RUN_BYTES = 512 * 1024 ** 2;
const WORKER = path.resolve(__dirname, '../workers/index_tts_worker.py');
const LANGUAGES = {zh:'ZH', chinese:'ZH', en:'EN', english:'EN', ja:'JA', japanese:'JA', es:'ES', spanish:'ES', ar:'AR', arabic:'AR'};

function absolute(value, name) {
 if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error(`${name} 必须是绝对路径`);
 return path.resolve(value);
}
function normalizeRequest(input) {
 const language = LANGUAGES[String(input.language || '').toLowerCase()];
 if (!language) throw Error('IndexTTS 2.5 仅支持中文、英文、日文、西班牙文和阿拉伯文');
 if (typeof input.text !== 'string' || !input.text.trim()) throw Error('合成文字不能为空');
 if (input.instruction?.trim()) throw Error('此 IndexTTS 实验使用情绪向量，不支持自由文字指令');
 const vector = input.emotion_vector;
 if (vector != null && (!Array.isArray(vector) || vector.length !== 8 || vector.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1))) throw Error('情绪向量必须是 8 个 0–1 数值');
 if (vector != null && vector.reduce((sum, value) => sum + value, 0) > 1 + 1e-6) throw Error('情绪配比总和不能超过 100%，请降低部分情绪');
 const intensity = input.emotion_intensity ?? 1;
 if (typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw Error('情绪强度必须在 0–1 之间');
 const reference = absolute(input.reference_path, '参考音频');
 const output = absolute(input.output_path, '输出音频');
 if (reference === output) throw Error('输出不能覆盖参考录音');
 return {reference_path:reference, output_path:output, text:input.text, language,
  emotion_vector:vector == null ? null : [...vector], emotion_intensity:intensity};
}
function runtimePaths(input) {
 const result = {...input, python:absolute(input.python, 'Python'), repo_path:absolute(input.repo_path, '源码目录'), model_path:absolute(input.model_path, '模型目录')};
 if (!['cpu', 'mps', 'cuda:0'].includes(result.device)) throw Error('设备必须是 cpu、mps 或 cuda:0');
 return result;
}
function checkRegistered(runtime) {
 runtimePaths(runtime);
 if (runtime.model_id !== MODEL || runtime.source !== 'existing' || runtime.validation_version !== 1 || !/^local-sha256:[a-f0-9]{64}$/.test(runtime.revision || '') || !Array.isArray(runtime.files) || runtime.files.length < 10) throw Error('IndexTTS 2.5 环境尚未通过登记校验');
 fs.accessSync(runtime.python, fs.constants.X_OK);
 for (const file of runtime.files) {
  const root = file.root === 'repo' ? runtime.repo_path : file.root === 'model' ? runtime.model_path : null;
  if (!root || typeof file.path !== 'string' || path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..')) throw Error('环境文件清单无效');
  const stat = fs.statSync(path.join(root, file.path));
  if (!stat.isFile() || stat.size !== file.size || Math.abs(stat.mtimeMs - file.mtime_ms) > 1) throw Error('IndexTTS 文件已变化或缺失，请重新登记环境');
 }
}
function availableSpace(directory) {
 let current = path.resolve(directory);
 while (!fs.existsSync(current) && path.dirname(current) !== current) current = path.dirname(current);
 try {const stat=fs.statfsSync(current);return stat.bavail * stat.bsize;} catch {return 0;}
}
function status(directory) {
 let runtime = null, installed = false;
 let reason = 'IndexTTS 2.5 尚未登记；请使用 scripts/register-index-tts.cjs 登记独立环境';
 try {
  runtime = JSON.parse(fs.readFileSync(path.join(directory, 'index-tts/runtime.json'), 'utf8'));
  checkRegistered(runtime);installed = true;
  reason = 'IndexTTS 2.5 文件与依赖已登记；尚不代表实际合成或音质已验证';
 } catch (error) {if (runtime) reason = error.message;runtime = null;}
 const available = availableSpace(directory), space = available >= RUN_BYTES;
 if (installed && !space) reason = '磁盘空间不足，IndexTTS 运行需要至少 512 MiB 可用空间';
 return {installed, space_ok:space, available_bytes:available, required_bytes:RUN_BYTES, reason, model_id:MODEL,
  revision:runtime?.revision || null, device:runtime?.device || null, runtime};
}
function childRun(runtime, request, signal, {check = false} = {}) {
 if (signal?.aborted) return Promise.reject(Error('任务已取消'));
 return new Promise((resolve, reject) => {
  const child = childProcess.spawn(runtime.python, [WORKER, ...(check ? ['--check'] : [])], {
   cwd:runtime.repo_path, windowsHide:true, stdio:['pipe','pipe','pipe'],
   env:{...process.env, HF_HUB_OFFLINE:'1', TRANSFORMERS_OFFLINE:'1', HF_HUB_DISABLE_TELEMETRY:'1', PYTHONDONTWRITEBYTECODE:'1'},
  });
  let output = '', outputBytes = 0, timedOut = false, overflow = false, settled = false, killTimer;
  const stop = () => {if(settled || killTimer)return;child.kill('SIGTERM');killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);killTimer.unref();};
  const timer = setTimeout(() => {timedOut = true;stop();}, check ? 5 * 60000 : 20 * 60000);
  const finish = (error, result) => {if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);error?reject(error):resolve(result);};
  signal?.addEventListener('abort', stop, {once:true});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
   if(overflow || settled)return;
   outputBytes += Buffer.byteLength(chunk, 'utf8');
   if(outputBytes > 256000){overflow=true;stop();return;}
   output += chunk;
  });
  child.stderr.on('data', () => {}); // Model logs can include private text and paths.
  child.stdin.on('error', () => {});
  child.once('error', () => finish(Error('无法启动 IndexTTS Python，请重新登记环境')));
  child.once('close', (code, terminatedBy) => {
   if(signal?.aborted)return finish(Error('任务已取消'));
   if(timedOut)return finish(Error(`IndexTTS ${check ? '环境检查' : '合成'}超时，进程已停止`));
   if(overflow)return finish(Error('IndexTTS worker 返回数据过多，进程已停止'));
   // Native termination can leave stdout empty. Report only OS metadata, never model logs.
   if(terminatedBy === 'SIGKILL')return finish(Error('IndexTTS 合成进程被强制终止（SIGKILL），可能是内存或交换空间不足；请关闭占用内存的应用并释放磁盘空间后重试'));
   if(terminatedBy)return finish(Error(`IndexTTS 进程被信号终止（${terminatedBy}）`));
   let result;
   try {result=JSON.parse(output.trim());} catch {}
   const record = result && typeof result === 'object' && !Array.isArray(result);
   const reportedError = record && result.ok === false && typeof result.error === 'string' ? result.error.trim().slice(0,1500) : '';
   if(code!==0)return finish(Error(`${reportedError || 'IndexTTS 合成进程异常退出'}（退出码 ${Number.isInteger(code) ? code : '未知'}）`));
   if(!output.trim())return finish(Error('IndexTTS worker 未返回结果（进程已退出，但没有 JSON 结果）'));
   if(!record || typeof result.ok !== 'boolean')return finish(Error('IndexTTS worker 返回格式无效（需要完整的 JSON 结果）'));
   if(result.ok!==true)return finish(Error(reportedError || 'IndexTTS 本地合成失败'));
   finish(null,result);
  });
  child.stdin.end(JSON.stringify({...request, ...runtime}));
 });
}
async function run(runtime, request, signal) {
 checkRegistered(runtime);
 const normalized = normalizeRequest(request);
 return childRun(runtime, normalized, signal);
}
async function register(directory, input) {
 absolute(directory, 'SayAgain 数据目录');
 const runtime = runtimePaths({...input, device:input.device || 'cpu'});
 const probe = await childRun(runtime, {}, undefined, {check:true});
 if (probe.model_id !== MODEL || !Array.isArray(probe.files) || !/^[a-f0-9]{64}$/.test(probe.fingerprint || '')) throw Error('IndexTTS 环境探测结果无效');
 const record = {source:'existing', model_id:MODEL, python:runtime.python, repo_path:runtime.repo_path, model_path:runtime.model_path, device:runtime.device,
  revision:'local-sha256:'+probe.fingerprint, validation_version:1, validated_at:Date.now(), synthesis_verified:false, files:probe.files};
 checkRegistered(record);
 const root = path.join(directory,'index-tts'), filename=path.join(root,'runtime.json');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 if(fs.existsSync(filename))fs.copyFileSync(filename,filename+'.backup-'+Date.now());
 const temporary=filename+'.tmp-'+createHash('sha256').update(String(process.pid)+String(Date.now())).digest('hex').slice(0,12);
 try {fs.writeFileSync(temporary,JSON.stringify(record,null,2),{mode:0o600});fs.renameSync(temporary,filename);}
 finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return {registered:true, model_id:MODEL, device:record.device, runtime_file:filename, synthesis_verified:false};
}
module.exports = {MODEL, RUN_BYTES, status, run, register, normalizeRequest};
