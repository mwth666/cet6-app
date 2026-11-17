#!/usr/bin/env node
/**
 * 核心算法回归测试（Node 环境，不需要浏览器）
 *
 * 这几个模块是从已通过 1196 条断言的版本移植过来的，
 * 移植过程改了模块包装方式（CommonJS → window 全局），
 * 这里验证逻辑没被改坏。
 *
 *   node tools/test_core.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'web', 'js');

// ---------- 极简浏览器环境 ----------
const storage = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
};
global.document = {
  addEventListener() {},
  visibilityState: 'visible',
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
};
global.location = { hash: '#/home' };

// fetch 走本地文件，模拟 /api/words 与 /api/content
global.fetch = async (url) => {
  const u = String(url);
  let file = null;
  if (u.includes('/api/words')) file = path.join(ROOT, 'data', 'words.json');
  else if (u.includes('/api/content')) {
    const merged = {};
    for (const n of ['listen', 'read', 'write', 'translate']) {
      merged[n] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content', n + '.json'), 'utf8'));
    }
    return { ok: true, json: async () => merged };
  } else if (u.includes('/api/state')) {
    return { ok: true, json: async () => ({ srs: {}, settings: {}, screen: {}, fav: [], days: {}, drafts: {}, screenPos: {} }) };
  } else if (u.includes('/api/patch') || u.includes('/api/reset')) {
    return { ok: true, json: async () => ({ ok: true }) };
  }
  if (!file) throw new Error('未 mock 的请求: ' + u);
  const raw = fs.readFileSync(file, 'utf8');
  return { ok: true, json: async () => JSON.parse(raw) };
};

// ---------- 加载模块 ----------
require(path.join(JS, 'config.js'));
require(path.join(JS, 'srs.js'));
require(path.join(JS, 'quiz.js'));
require(path.join(JS, 'words.js'));

const { CFG, SRS, Quiz, Words } = global;

// ---------- 断言工具 ----------
let pass = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fails.push(msg);
}
function eq(a, b, msg) {
  ok(a === b, `${msg}（期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}）`);
}

// ==========================================================
console.log('\n[1] 配置与词库');
// ==========================================================
ok(CFG.sprint === true, '冲刺模式应默认开启');
ok(CFG.sprintMaxInterval === 10, '冲刺间隔上限应为 10 天');
ok(CFG.audio.provider === 'web', '发音走浏览器内置合成');

const wordsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'words.json'), 'utf8'));
eq(wordsRaw.length, 5301, '词库总量');
ok(wordsRaw.every((e, i) => e.i === i), '词库 i 字段应从 0 连续递增');

Words.setAll(wordsRaw);
eq(Words.size(), 5301, 'Words.size()');
ok(Words.get(0).w === wordsRaw[0].w, 'Words.get(0)');
ok(!!Words.get(0).meanShort, '词条应有简短释义 meanShort');

// 每个词都能取到释义和例句
let noMean = 0;
let noSent = 0;
wordsRaw.forEach((e) => {
  const w = Words.get(e.i);
  if (!w.meanShort) noMean++;
  if (!w.s) noSent++;
});
eq(noMean, 0, '缺释义的词');
eq(noSent, 0, '缺例句的词');

// ==========================================================
console.log('[2] 间隔重复（SRS）');
// ==========================================================
const now = Date.now();
const T = 86400000;

// 新词第一次答对：进入学习阶段
let r = SRS.schedule({}, 2, now, CFG);
ok(r.s >= 1, '首答正确应进入学习阶段');
ok(r.due > now, 'due 应在未来');
ok(r.iv != null, '应有间隔字段');

// 连续答对逐步毕业
let rec = {};
const ivs = [];
for (let k = 0; k < 5; k++) {
  rec = SRS.schedule(rec, 3, now + k * T, CFG);
  ivs.push(rec.iv);
}
ok(ivs[ivs.length - 1] > ivs[0], '间隔应逐轮变长');
ok(rec.iv <= CFG.sprintMaxInterval, '冲刺模式下间隔不超过 10 天');

// 答错：回到短间隔
const before = { ...rec };
const lapsed = SRS.schedule(before, 0, now + 6 * T, CFG);
ok(lapsed.iv <= 1, '答错后间隔应压回 1 天内');
ok(lapsed.lapses === (before.lapses || 0) + 1, '答错应累计遗忘次数');

// ease 不越界
let e = {};
for (let k = 0; k < 20; k++) e = SRS.schedule(e, 0, now + k * T, CFG);
ok(e.ef >= 1.3, 'ease 下限 1.3');
let e2 = {};
for (let k = 0; k < 20; k++) e2 = SRS.schedule(e2, 3, now + k * T, CFG);
ok(e2.ef <= 2.8, 'ease 上限 2.8');

// ==========================================================
console.log('[3] 出题（七种题型）');
// ==========================================================
// 题型内部名（对应界面上的七种练法）
const TYPES = ['cloze', 'meaning', 'listen', 'input', 'spell', 'confusable', 'collocation'];
const TYPE_CN = {
  cloze: '语境挖空', meaning: '句中猜义', listen: '听音辨词', input: '汉译英填空',
  spell: '拼写', confusable: '形近词辨析', collocation: '词块模式',
};
const cover = {};
let built = 0;

wordsRaw.slice(0, 400).forEach((e) => {
  TYPES.forEach((t) => {
    const q = Quiz.build(Words.get(e.i), t);
    if (!q) return;
    built++;
    cover[q.type] = (cover[q.type] || 0) + 1;

    // 结构检查
    ok(!!q.type, '题目应有 type');
    ok(!!q.answerText, `${e.w} 的 ${t} 题应有答案`);
    ok(q.kind === 'choice' || q.kind === 'input', `${e.w} 的 ${t} 题应有答题方式`);
    // 选择题必须给选项，输入题必须给提示
    if (q.kind === 'choice') ok(Array.isArray(q.options) && q.options.length >= 2, `${e.w} 的 ${t} 题选项不足`);
    if (q.kind === 'input' && q.type !== 'spell') ok(q.first != null || q.prompt, `${e.w} 的 ${t} 题缺提示`);
    // 不能所有题都退化成同一个通用模板
    ok(q.prompt !== '根据提示写出单词' || t === 'input', `${e.w} 的 ${t} 题降级成了通用模板`);
  });
});
ok(built > 1000, `应生成足量题目（实际 ${built}）`);

// 选择题：选项必须含答案且不重复
let badOpt = 0;
let dupOpt = 0;
wordsRaw.slice(0, 300).forEach((e) => {
  ['cloze', 'meaning', 'listen', 'confusable'].forEach((t) => {
    const q = Quiz.build(Words.get(e.i), t);
    if (!q || !q.options) return;
    const opts = q.options.map((o) => o.text);
    const rights = q.options.filter((o) => o.right);
    // 有且只有一个正确项
    if (rights.length !== 1) badOpt++;
    // 正确项文本应与答案一致
    if (rights.length === 1 && rights[0].text !== q.answerText) badOpt++;
    if (new Set(opts).size !== opts.length) dupOpt++;
  });
});
eq(badOpt, 0, '含答案的选项缺失数');
eq(dupOpt, 0, '选项重复数');

// 每个词的例句都要能定位到词本身（挖空与高亮依赖它）
// findMatch(sentence, word, ...) => { start, end } 或 null
let noPos = 0;
const badWords = [];
wordsRaw.forEach((e) => {
  if (!e.s) return;
  const m = Quiz.findMatch(e.s, e.w);
  if (!m || m.start == null || m.end <= m.start) {
    noPos++;
    if (badWords.length < 8) badWords.push(e.w);
  }
});
ok(noPos === 0, `例句中定位失败的词（${noPos}/5301，示例 ${badWords.join(' ')}）`);

// 七种题型都要能真实生成（不是全部降级）
TYPES.forEach((t) => {
  const real = Object.keys(cover).filter((k) => k === t).length;
  ok(real > 0, `题型「${TYPE_CN[t] || t}」应能生成`);
});
console.log('    覆盖：' + Object.keys(cover).map((k) => `${TYPE_CN[k] || k} ${cover[k]}`).join(' / '));

// ==========================================================
console.log('[4] 判分');
// ==========================================================
// 变形词要定位到完整变形，不能只挖词干（否则 "abandoned" 会挖成 "[abandon]ed"）
const S1 = 'They abandoned the plan.';
const m1 = Quiz.findMatch(S1, 'abandon');
ok(m1 && m1.start === 5, '变形词 abandoned 应定位到第 5 个字符');
ok(S1.slice(m1.start, m1.end).toLowerCase() === 'abandoned', '应连 -ed 一起挖掉');

const S2 = 'The company abandons old rules.';
const m3 = Quiz.findMatch(S2, 'abandon');
ok(S2.slice(m3.start, m3.end).toLowerCase() === 'abandons', '应连 -s 一起挖掉');

// 但不能误吞：class 在 classes 里是屈折，在 "class has" 里不是
const S3 = 'This class has thirty students.';
const m4 = Quiz.findMatch(S3, 'class');
ok(S3.slice(m4.start, m4.end).toLowerCase() === 'class', 'class 不应吞掉后面的 has');

const S4 = 'He runs a small business.';
const m5 = Quiz.findMatch(S4, 'business');
ok(S4.slice(m5.start, m5.end).toLowerCase() === 'business', 'business 不应被 -s 规则误伤');

// 不规则变化
const m2 = Quiz.findMatch('She threw it away.', 'throw');
ok(m2 && 'She threw it away.'.slice(m2.start, m2.end).toLowerCase() === 'threw',
  '不规则变化 threw 应能定位');

// 听写对比：diffWords(用户听写, 标准答案)
const dd1 = Quiz.diffWords('They had to abandon it.', 'They had to abandon it.');
ok(dd1.correct === dd1.total && dd1.extra === 0, '完全写对时全部命中');

const dd2 = Quiz.diffWords('They had to abandon', 'They had to abandon it.');
ok(dd2.correct < dd2.total, '漏词应判出错误');

const dd3 = Quiz.diffWords('They had too abandon it.', 'They had to abandon it.');
ok(dd3.extra > 0 || dd3.correct < dd3.total, '多写错词应判出错误');

// ==========================================================
console.log('[5] 干扰项');
// ==========================================================
let badDist = 0;
wordsRaw.slice(0, 200).forEach((e) => {
  const entry = Words.get(e.i);
  const ds = Words.distractors(entry, 3);
  if (!ds || ds.length !== 3) badDist++;
  if (ds.some((d) => d.i === entry.i)) badDist++; // 不能包含自己
  const seen = new Set(ds.map((d) => d.i));
  if (seen.size !== ds.length) badDist++; // 不能重复
});
eq(badDist, 0, '干扰项异常数');

// 形近词
wordsRaw.slice(0, 100).forEach((e) => {
  const s = Words.similar(Words.get(e.i), 3);
  ok(Array.isArray(s), 'similar 应返回数组');
});

// ==========================================================
console.log('[6] 搜索与分页');
// ==========================================================
const sr = Words.search('abandon', 10);
ok(sr.length > 0, '搜索 abandon 应有结果');
ok(sr[0].w.toLowerCase().startsWith('aband'), '前缀优先');

const cn = Words.search('放弃', 10);
ok(cn.length > 0, '应能搜中文释义');

eq(Words.maxPage(30), Math.ceil(5301 / 30), '总页数');
eq(Words.pageRange(1, 30).length, 30, '每页 30 词');
ok(Words.pageRange(1, 30)[0].i === 0, '第一页从 0 开始');

// ==========================================================
console.log('');
if (fails.length) {
  console.log(`✗ 失败 ${fails.length} 条（通过 ${pass}）`);
  fails.slice(0, 30).forEach((f) => console.log('   -', f));
  process.exit(1);
}
console.log(`✓ 全部通过：${pass} 条断言`);
console.log(`  题型覆盖：${Object.keys(cover).sort().join(', ')}`);
