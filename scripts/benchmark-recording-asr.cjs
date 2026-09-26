// Real Electron IPC benchmark. Input audio and reports stay outside the repository.
// SAYAGAIN_TEST_AUDIO=/absolute/audio.wav SAYAGAIN_TEST_RUNTIME=/absolute/runtime.json
// SAYAGAIN_TEST_SEGMENTS=/absolute/iOS-report.json SAYAGAIN_BENCHMARK_OUTPUT=/absolute/result.json
// Optional: SAYAGAIN_BENCHMARK_RUNS=3 (default), omit SEGMENTS to test default whole-clip ASR.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const audio = fs.readFileSync(process.env.SAYAGAIN_TEST_AUDIO);
  const runtime = JSON.parse(fs.readFileSync(process.env.SAYAGAIN_TEST_RUNTIME, 'utf8'));
  const pythonRuntime = JSON.parse(execFileSync(runtime.python, ['-c', "import json,platform,importlib.metadata as m,sherpa_onnx;print(json.dumps({'python':platform.python_version(),'sherpaOnnx':sherpa_onnx.__version__,'sherpaEmbeddedOrt':sherpa_onnx.onnxruntime_version,'numpy':m.version('numpy'),'soundfile':m.version('soundfile'),'soxr':m.version('soxr')}))"], { encoding: 'utf8' }));
  const baseline = process.env.SAYAGAIN_TEST_SEGMENTS ? JSON.parse(fs.readFileSync(process.env.SAYAGAIN_TEST_SEGMENTS, 'utf8')) : null;
  const count = Number(process.env.SAYAGAIN_BENCHMARK_RUNS || 3);
  assert(Number.isInteger(count) && count > 0 && count <= 10);
  const turns = baseline?.segments.map(s => ({ start_ms: s.start * 1000, end_ms: s.end * 1000, speaker: '不确定' }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sayagain-asr-benchmark-'));
  let app;
  try {
    fs.mkdirSync(path.join(directory, 'recording-models'));
    fs.writeFileSync(path.join(directory, 'recording-models/runtime.json'), JSON.stringify(runtime));
    app = await electron.launch({ args: [root], env: { ...process.env, SAYAGAIN_DATA_DIR: directory }, timeout: 60000 });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    await page.waitForSelector('#language-form');
    await page.locator('[name="native_language"]').fill('zh-CN');
    await page.locator('[name="target_language"]').fill('en-US');
    await page.locator('#language-form button[type="submit"]').click();
    const clipId = await page.evaluate(async ({ base64, turns }) => {
      const recording = await window.sayagain.createRecording({ title: '同音频 ASR 性能验证' });
      const clip = await window.sayagain.addRecordingClip({ recording_id: recording.block_id, client_id: 'benchmark', source: 'import', source_name: 'benchmark.wav', bytes: Uint8Array.from(atob(base64), c => c.charCodeAt(0)) });
      if (turns) await window.sayagain.confirmRecordingTurns({ id: clip.block_id, revision: clip.body.revision, segments: turns });
      return clip.block_id;
    }, { base64: audio.toString("base64"), turns });
    const runs = [];
    for (let i = 0; i < count; i++) {
      const result = await page.evaluate(async id => {
        const start = performance.now();
        await window.sayagain.transcribeRecording({ id });
        const elapsedSeconds = (performance.now() - start) / 1000;
        const clip = (await window.sayagain.state()).recording_clips.find(c => c.block_id === id);
        return { elapsedSeconds, audioSeconds: clip.body.duration_ms / 1000, segmentCount: clip.body.transcript_segments.length, textCharacters: clip.body.transcript.length, text: clip.body.transcript, bounds: clip.body.transcript_segments.map(s => [s.start_ms, s.end_ms]) };
      }, clipId);
      assert(result.textCharacters > 0);
      if (turns) assert.deepEqual(result.bounds, turns.map(t => [t.start_ms, t.end_ms]));
      else assert.equal(result.segmentCount, 1);
      await page.reload();
      const saved = await page.evaluate(async id => (await window.sayagain.state()).recording_clips.find(c => c.block_id === id).body.transcript, clipId);
      assert.equal(saved, result.text);
      const { text, bounds, ...metrics } = result;
      runs.push({ run: i + 1, ...metrics, realtimeMultiple: metrics.audioSeconds / metrics.elapsedSeconds, persistedAfterReload: true, transcriptSha256: sha256(text) });
      console.log(JSON.stringify(runs.at(-1)));
    }
    const modelDirectory = runtime.models.sensevoice.path;
    const modelName = fs.readdirSync(modelDirectory).find(n => n.endsWith('int8.onnx'));
    const report = { measuredAt: new Date().toISOString(), route: 'renderer preload → real Electron IPC transcribeRecording → Python worker → SQLite persistence', mode: turns ? 'same iOS segment bounds' : 'default whole clip', pythonRuntime, segments: turns?.map(t => ({ start: t.start_ms / 1000, end: t.end_ms / 1000 })), timing: 'IPC call through completed persistence; excludes launch, import and reload; fresh Python process and recognizer per run; OS file cache not cleared', audioSha256: sha256(audio), audioBytes: audio.length, modelSha256: sha256(fs.readFileSync(path.join(modelDirectory, modelName))), tokensSha256: sha256(fs.readFileSync(path.join(modelDirectory, 'tokens.txt'))), cpu: os.cpus()[0].model, logicalCPUs: os.cpus().length, memoryBytes: os.totalmem(), platform: os.platform(), release: os.release(), arch: os.arch(), electron: require('electron/package.json').version, threads: 4, runs };
    fs.writeFileSync(process.env.SAYAGAIN_BENCHMARK_OUTPUT, JSON.stringify(report, null, 2) + '\n');
  } finally {
    await app?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
