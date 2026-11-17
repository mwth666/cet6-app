#!/usr/bin/env node
/**
 * 每日配额与取词队列测试（Node 环境）
 *
 * 重点验证「30 天能不能背完 5301 词」这件事：
 * 固定配额会覆盖不完，冲刺模式必须按剩余量自适应。
 *
 *   node tools/test_plan.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'web', 'js');

// ---------- 浏览器环境 ----------
global.window = global;
global.addEventListener = () => {};
global.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
global.document = {
  addEventListener() {},
  visibilityState: 'visible',
  querySelector: () => null,
};
global.location = { hash: '#/home' };

const WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'words.json'), 'utf8'));

// 可以在测试中途换掉这份状态，模拟不同学习进度
let STATE = { srs: {}, settings: {}, screen: {}, fav: [], days: {}, drafts: {}, screenPos: {} };

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/api/state')) return { ok: true, json: async () => STATE };
  if (u.includes('/api/patch') || u.includes('/api/reset') || u.includes('/api/import')) {
    return { ok: true, json: async () => ({ ok: true }) };
  }
  if (u.includes('/api/words')) return { ok: true, json: async () => WORDS };
  throw new Error('未 mock: ' + u);
};

require(path.join(JS, 'config.js'));
require(path.join(JS, 'core.js'));
require(path.join(JS, 'words.js'));
require(path.join(JS, 'store.js'));
require(path.join(JS, 'srs.js'));
require(path.join(JS, 'quiz.js'));
require(path.join(JS, 'queue.js'));

const { CFG, Words, Queue, Store } = global;

let pass = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fails.push(msg);
}
function eq(a, b, msg) {
  ok(a === b, `${msg}（期望 ${b}，实际 ${a}）`);
}

(async () => {
  Words.setAll(WORDS);
  await Store.load();

  // ==========================================================
  console.log('\n[1] 空进度下的配额');
  // ==========================================================
  const plan0 = Queue.todayPlan();
  const days = Queue.daysLeft();
  console.log(`    距考试 ${days} 天，全库 ${WORDS.length} 词`);

  ok(days > 0, '距考试天数应大于 0');
  ok(plan0.quota >= 100, `配额应足够高（实际 ${plan0.quota}）`);
  eq(plan0.doneNew, 0, '今天还没学');
  eq(plan0.remaining, 5301, '剩余新词应为全库');
  eq(plan0.newWords.length, plan0.quota, '取词数应等于配额');

  // 核心：按这个配额能不能在考前背完
  const needTotal = plan0.quota * days;
  console.log(`    每天 ${plan0.quota} 词 × ${days} 天 = ${needTotal} 词（需 ${WORDS.length}）`);
  ok(needTotal >= WORDS.length, `配额应覆盖全库（${needTotal} < ${WORDS.length}）`);

  // 上限保护
  ok(plan0.quota <= (CFG.sprintMaxNew || 600), '配额不应超过上限');

  // ==========================================================
  console.log('[2] 取词不重复、按等级优先');
  // ==========================================================
  const first = plan0.newWords;
  const ids = new Set(first.map((e) => e.i));
  eq(ids.size, first.length, '取出的新词不应重复');

  const grades = first.map((e) => Words.gradeOf(e));
  const aCount = grades.filter((g) => g === 'A').length;
  console.log(`    前 ${first.length} 个词里 A 级 ${aCount} 个`);
  ok(aCount > 0, '应优先取 A 级词');

  // A 级必须排在 B/C 之前
  const lastA = grades.lastIndexOf('A');
  const firstNonA = grades.findIndex((g) => g !== 'A');
  if (lastA >= 0 && firstNonA >= 0) {
    ok(lastA < firstNonA, 'A 级词应全部排在非 A 级之前');
  }

  // ==========================================================
  console.log('[3] 学了一部分之后配额下降');
  // ==========================================================
  // 模拟：已学过 2000 词，今天已完成 50 个
  const srs = {};
  for (let i = 0; i < 2000; i++) {
    srs[i] = { s: 1, ef: 2.5, iv: 1, due: Date.now() + 86400000, lapses: 0, reps: 1, g: 2 };
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  STATE = { srs, settings: {}, screen: {}, fav: [], days: { [todayKey]: { n: 50, r: 20, c: 70 } }, drafts: {}, screenPos: {} };

  Words.setAll(WORDS);
  global.localStorage._d = {};
  await Store.load();

  const plan1 = Queue.todayPlan();
  eq(plan1.remaining, 3301, '剩余新词');
  eq(plan1.doneNew, 50, '今日已完成');
  console.log(`    剩余 ${plan1.remaining} 词 / ${days} 天 → 今日配额 ${plan1.quota}（已完成 ${plan1.doneNew}）`);
  ok(plan1.quota < plan0.quota, '剩余变少后配额应下降');
  eq(plan1.leftNew, Math.max(0, plan1.quota - 50), '还需新学的数量');

  // ==========================================================
  console.log('[4] 全部背完之后');
  // ==========================================================
  const allSrs = {};
  WORDS.forEach((e) => {
    allSrs[e.i] = { s: 2, ef: 2.5, iv: 5, due: Date.now() + 86400000, lapses: 0, reps: 3, g: 3 };
  });
  STATE = { srs: allSrs, settings: {}, screen: {}, fav: [], days: { [todayKey]: { n: 30, r: 100 } }, drafts: {}, screenPos: {} };
  Words.setAll(WORDS);
  global.localStorage._d = {};
  await Store.load();

  const plan2 = Queue.todayPlan();
  eq(plan2.remaining, 0, '剩余新词应为 0');
  eq(plan2.quota, plan2.doneNew, '全部背完后配额收敛为已完成数');
  eq(plan2.leftNew, 0, '不应再要求新词');
  eq(plan2.newWords.length, 0, '不应再返回新词');

  // ==========================================================
  console.log('[5] 筛掉的词不再出现');
  // ==========================================================
  STATE = { srs: {}, settings: {}, screen: {}, fav: [], days: {}, drafts: {}, screenPos: {} };
  // 把前 100 个词标记为「认识」
  for (let i = 0; i < 100; i++) STATE.screen[i] = 1;
  Words.setAll(WORDS);
  global.localStorage._d = {};
  await Store.load();

  const plan3 = Queue.todayPlan();
  eq(plan3.remaining, 5201, '筛掉 100 个后剩余');
  const picked3 = plan3.newWords.map((e) => e.i);
  eq(picked3.filter((i) => i < 100).length, 0, '筛掉的词不应被取出');

  // ==========================================================
  console.log('[6] 会话构造');
  // ==========================================================
  const session = Queue.buildSession({ size: 20 });
  ok(session.length <= 20, '会话长度不超过 20');
  ok(session.length > 0, '会话不应为空');
  ok(session.every((it) => it.e && it.e.w), '会话每项都应有词条');

  // ==========================================================
  console.log('[7] 到期复习');
  // ==========================================================
  const overdue = {};
  for (let i = 0; i < 10; i++) {
    overdue[i] = { s: 2, ef: 2.5, iv: 1, due: Date.now() - 86400000, lapses: i, reps: 2, g: 2 };
  }
  STATE = { srs: overdue, settings: {}, screen: {}, fav: [], days: {}, drafts: {}, screenPos: {} };
  Words.setAll(WORDS);
  global.localStorage._d = {};
  await Store.load();

  const due = Queue.dueList();
  eq(due.length, 10, '应有 10 个到期');
  ok(due[0].rec.lapses >= due[due.length - 1].rec.lapses, '遗忘次数多的应排前面');

  console.log('');
  if (fails.length) {
    console.log(`✗ 失败 ${fails.length} 条（通过 ${pass}）`);
    fails.forEach((f) => console.log('   -', f));
    process.exit(1);
  }
  console.log(`✓ 全部通过：${pass} 条断言`);
})();
