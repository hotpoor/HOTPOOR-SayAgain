import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const check = process.argv.includes('--check');
const source = read('DEVELOPMENT_LOG.md');
const entries = [...source.matchAll(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · ([^\n]+)\n([\s\S]*?)(?=^## \d{4}-\d{2}-\d{2} |$(?![\s\S]))/gm)]
  .map(match => ({ time: match[1], text: match[0].trim() }));
if (!entries.length) throw new Error('No dated entries in DEVELOPMENT_LOG.md');
for (const entry of entries) {
  const instant = new Date(entry.time.replace(' ', 'T') + ':00Z');
  if (Number.isNaN(+instant) || instant.toISOString().slice(0, 16).replace('T', ' ') !== entry.time)
    throw new Error(`Invalid date: ${entry.time}`);
}
entries.sort((a, b) => a.time.localeCompare(b.time));
const counts = new Map();
for (const entry of entries) {
  const day = entry.time.slice(0, 10);
  counts.set(day, (counts.get(day) || 0) + 1);
}
const dayMs = 86400000;
const iso = date => date.toISOString().slice(0, 10);
const end = new Date(entries.at(-1).time.slice(0, 10) + 'T00:00:00Z');
const start = new Date(+end - 364 * dayMs);
const palette = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const color = n => palette[n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4];
const text = (x, y, value, size = 11, fill = '#57606a') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${value}</text>`;
const svg = (width, height, title, parts) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title><rect width="100%" height="100%" rx="8" fill="#fff"/><g font-family="system-ui, sans-serif">${parts.join('\n')}</g></svg>\n`;
const annual = [text(20, 22, `每日工作记录 · ${iso(start)} — ${iso(end)}`, 12)];
for (const [weekday, label] of [[1, '一'], [3, '三'], [5, '五']]) annual.push(text(20, 59 + weekday * 11, label, 9));
for (let i = 0; i < 365; i++) {
  const date = new Date(+start + i * dayMs);
  const day = iso(date);
  const n = counts.get(day) || 0;
  const x = 44 + Math.floor((i + start.getUTCDay()) / 7) * 12;
  const y = 51 + date.getUTCDay() * 11;
  if (date.getUTCDate() === 1) annual.push(text(x, 43, `${date.getUTCMonth() + 1}月`, 9));
  annual.push(`<rect data-date="${day}" data-count="${n}" x="${x}" y="${y}" width="9" height="9" rx="2" fill="${color(n)}"><title>${day}：${n} 条记录</title></rect>`);
}
annual.push(text(20, 155, '每格一天 · 截至最新日志日期 · 数量不代表提交数或工时', 10));
for (let i = 0; i < 5; i++) annual.push(`<rect x="${555 + i * 25}" y="141" width="10" height="10" rx="2" fill="${palette[i]}"/>`, text(553 + i * 25, 165, ['0', '1–2', '3–5', '6–9', '10+'][i], 8));

const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
const days = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
const rows = Math.ceil((first.getUTCDay() + days) / 7);
const month = [text(20, 26, `${iso(end).slice(0, 7)} · 每日记录数`, 15)];
['日', '一', '二', '三', '四', '五', '六'].forEach((label, i) => month.push(text(42 + i * 98, 53, label)));
for (let d = 1; d <= days; d++) {
  const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), d));
  const day = iso(date);
  const n = counts.get(day) || 0;
  const cell = first.getUTCDay() + d - 1;
  const x = 20 + cell % 7 * 98;
  const y = 65 + Math.floor(cell / 7) * 66;
  const future = date > end;
  month.push(`<g data-date="${day}" data-count="${n}"><rect x="${x}" y="${y}" width="90" height="58" rx="5" fill="${future ? '#f6f8fa' : color(n)}"/>${text(x + 10, y + 21, d, 12, n >= 6 ? '#fff' : '#24292f')}${text(x + 10, y + 43, future ? '未到记录日' : `${n} 条记录`, 10, n >= 6 ? '#fff' : '#57606a')}</g>`);
}
const overview = [...counts].map(([day, n]) => `| ${day} | ${n} |`).join('\n');
const shared = `### 每日工作记录分布

<img src="docs/charts/development-activity.svg" width="720" height="174" alt="过去 365 天的每日开发记录分布，绿色越深记录越多">

以最新日志日期为终点展示 365 天，每格一天；统计来自开发记录，不是 GitHub 提交数，也不代表工作时长。

<details>
<summary>展开本月明细 · 查看每天的日期和记录数</summary>

<img src="docs/charts/development-month.svg" width="720" alt="最新日志所在月份的每日记录数">

</details>

### 每日记录概览

共 **${entries.length} 条开发记录**，覆盖 **${counts.size} 个日期**。一条记录可以包含多项相关工作。

| 日期 | 开发记录 |
| --- | ---: |
${overview}
`;
const header = history => `# ${history ? '开发传记' : '开发日志'}

${history ? '按日期正序，从项目起点回顾演进。最新进度见 [开发日志](DEVELOPMENT_LOG.md)。' : '按日期逆序，最新记录在前。完整演进见 [开发传记](DEVELOPMENT_HISTORY.md)。'}

记录时间使用北京时间（Asia/Shanghai），表示记录整理时间，不代表任务耗时。功能实现状态以 [README](README.md) 为准。

记录原则：如实保留尝试过的策略、用户明确反馈、失败与不满意、调整依据和未验证效果。区分用户反馈、开发者推断、自动测试、真实样例与用户验收；回溯整理注明整理时间，不猜测历史发生时间，不用后来的成功抹去早期问题。

维护方式：在 DEVELOPMENT_LOG.md 添加格式为 \`## YYYY-MM-DD HH:mm · 标题\` 的记录，然后运行 \`node scripts/sync-development-history.mjs\`。传记与图表自动生成；运行时加 \`--check\` 检查同步。请勿单独编辑传记和图表。

${shared}\n`;
const outputs = new Map([
  ['DEVELOPMENT_LOG.md', header(false) + [...entries].reverse().map(e => e.text).join('\n\n') + '\n'],
  ['DEVELOPMENT_HISTORY.md', header(true) + entries.map(e => e.text).join('\n\n') + '\n'],
  ['docs/charts/development-activity.svg', svg(720, 174, '每日开发记录全年贡献格', annual)],
  ['docs/charts/development-month.svg', svg(720, 80 + rows * 66, '每日开发记录月历', month)],
]);
for (const [path, value] of outputs) {
  if (check) {
    if (read(path) !== value) throw new Error(`Out of date: ${path}`);
  } else {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), value);
  }
}
console.log(`${check ? 'Checked' : 'Generated'} ${outputs.size} files; ${entries.length} records across ${counts.size} dates.`);
