/* 由小程序版移植，逻辑未改动 */
(function () {
// 每日队列：新词挑选 + 到期复习
//
// 依赖模块延迟绑定：words.js / store.js / srs.js 与本文件的加载顺序不作要求，
// 首次调用时才去 window 上取。这样调整 index.html 里的 script 顺序不会静默出错。
function words() {
  const m = window.Words;
  if (!m) throw new Error('词库模块尚未加载（words.js）');
  return m;
}
function store() {
  const m = window.Store;
  if (!m) throw new Error('存储模块尚未加载（store.js）');
  return m;
}

const CFG = window.CFG;

function gradeRank(g) {
  return g === 'A' ? 0 : g === 'B' ? 1 : 2;
}

// 新词：优先 A 级（六级★/高频），排除已筛为"认识"与已有记录的
function pickNew(count) {
  const arr = words().all();
  const screen = store().getScreen();
  const recs = store().allRecords();
  const poolA = [];
  const poolB = [];
  const poolC = [];
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (screen[e.i] || recs[e.i]) continue;
    if (!e.s) continue;
    const g = words().gradeOf(e);
    if (g === 'A') poolA.push(e);
    else if (g === 'B') poolB.push(e);
    else poolC.push(e);
  }
  // A 级内部再按词频降序，同频段内保留书上的原始顺序（便于对照纸质书）
  poolA.sort((a, b) => (b.l6 - a.l6) || (b.f - a.f) || (a.i - b.i));
  poolB.sort((a, b) => (b.f - a.f) || (a.i - b.i));
  poolC.sort((a, b) => (a.i - b.i));

  const out = [];
  const take = (pool, n) => {
    for (let i = 0; i < pool.length && out.length < n; i++) out.push(pool[i]);
  };
  take(poolA, count);
  if (out.length < count) take(poolB, count);
  if (out.length < count) take(poolC, count);
  return out;
}

function remainingNew() {
  const arr = words().all();
  const screen = store().getScreen();
  const recs = store().allRecords();
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (!screen[i] && !recs[i] && arr[i].s) n++;
  }
  return n;
}

// 到期复习：按到期时间升序，错误多的优先
function dueList(now) {
  const t = now || Date.now();
  const recs = store().allRecords();
  const out = [];
  for (const k in recs) {
    const r = recs[k];
    if (r && r.s > 0 && r.due <= t) {
      out.push({ idx: Number(k), rec: r });
    }
  }
  out.sort((a, b) => (b.rec.lapses - a.rec.lapses) || (a.rec.due - b.rec.due));
  return out;
}

function dueCount(now) {
  return dueList(now).length;
}

// 今日新词已完成数
function newDoneToday() {
  const d = store().getDay();
  return d ? d.n || 0 : 0;
}

function todayPlan() {
  const settings = store().getSettings();
  const base = settings.dailyNew || CFG.dailyNew;
  const doneNew = newDoneToday();
  const remain = remainingNew();

  // 冲刺模式：按"剩余词数 / 剩余天数"动态抬高每日配额，
  // 否则固定 150 词 × 30 天 = 4500，5301 词到考前还剩一大半。
  let quota = base;
  if (remain <= 0) {
    quota = doneNew; // 已经全部背过，今日任务视为完成
  } else if (CFG.sprint) {
    const need = Math.ceil(remain / Math.max(1, daysLeft()));
    quota = Math.min(Math.max(base, need), CFG.sprintMaxNew || 600);
  }

  const leftNew = Math.max(0, quota - doneNew);
  const pool = pickNew(leftNew);
  return {
    quota,
    base,
    doneNew,
    leftNew,
    newWords: pool,
    due: dueCount(),
    remaining: remain,
  };
}

// 距考试天数
function daysLeft() {
  const target = new Date(CFG.examDate + 'T00:00:00');
  const now = new Date();
  const d = Math.ceil((target - now) / 86400000);
  return d > 0 ? d : 0;
}

// 会话：新词与复习词交错，避免连续背生词疲劳
function buildSession(opts) {
  const o = opts || {};
  const size = o.size || 20;
  const plan = todayPlan();
  const news = plan.newWords.slice(0, Math.min(size, o.newLimit || size));
  const dues = dueList().slice(0, size);
  const items = [];
  const maxLen = Math.max(news.length, dues.length);
  for (let i = 0; i < maxLen && items.length < size; i++) {
    if (news[i]) items.push({ e: news[i], isNew: true });
    if (dues[i] && items.length < size) {
      items.push({ e: words().get(dues[i].idx), isNew: false, rec: dues[i].rec });
    }
  }
  return items;
}

window.Queue = {
  pickNew,
  dueList,
  dueCount,
  remainingNew,
  newDoneToday,
  todayPlan,
  daysLeft,
  buildSession,
  gradeRank,
};

})();
