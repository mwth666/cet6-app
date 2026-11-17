// 学习进度：内存里读写（同步、快），改动攒起来增量上报给后端存盘
// 这样视图代码可以像用 localStorage 一样同步调用，不用到处 await
(function () {
  const Api = window.App.Api;

  const state = {
    srs: {},        // { 词序号: 间隔重复记录 }
    screen: {},     // { 词序号: 1 } 表示"这个词我认识，别排进新词"
    fav: [],        // 收藏的词序号
    settings: {},   // 每日配额等个人设置
    days: {},       // { '2026-11-17': { n, r, c, w, l, rd, tr, wr } }
    drafts: {},     // 写作/翻译草稿
    screenPos: {},  // 筛词位置
  };

  let dirtySrs = {};
  let dirtyKeys = new Set();
  let timer = null;
  let saving = false;
  let lastError = '';

  // ---------------- 载入 ----------------

  async function load() {
    const remote = await Api.get('/api/state');
    for (const k of ['screen', 'settings', 'days', 'drafts', 'screenPos']) {
      if (remote[k] && typeof remote[k] === 'object') state[k] = remote[k];
    }
    if (remote.srs && typeof remote.srs === 'object') state.srs = remote.srs;
    if (Array.isArray(remote.fav)) state.fav = remote.fav;
  }

  // ---------------- 存盘 ----------------

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 900);
  }

  async function flush() {
    if (saving) {
      schedule();
      return;
    }
    const patch = {};
    const srsCount = Object.keys(dirtySrs).length;
    if (srsCount) patch.srs = dirtySrs;
    dirtyKeys.forEach((k) => {
      patch[k] = state[k];
    });
    if (!srsCount && !dirtyKeys.size) return;

    const sentSrs = dirtySrs;
    const sentKeys = Array.from(dirtyKeys);
    dirtySrs = {};
    dirtyKeys.clear();
    saving = true;
    try {
      await Api.post('/api/patch', { patch });
      lastError = '';
    } catch (err) {
      // 存盘失败就把改动放回去，下次再试
      Object.assign(dirtySrs, sentSrs);
      sentKeys.forEach((k) => dirtyKeys.add(k));
      lastError = String(err.message || err);
      console.error('存盘失败', err);
    } finally {
      saving = false;
    }
  }

  // 关页面时兜底：用 keepalive 把最后一点改动发出去
  function flushSync() {
    const patch = {};
    if (Object.keys(dirtySrs).length) patch.srs = dirtySrs;
    dirtyKeys.forEach((k) => {
      patch[k] = state[k];
    });
    if (!Object.keys(patch).length) return;
    dirtySrs = {};
    dirtyKeys.clear();
    try {
      fetch('/api/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
        keepalive: true,
      });
    } catch (e) {
      /* 页面正在关闭，失败也只能放弃 */
    }
  }

  // ---------------- 工具 ----------------

  function today() {
    return window.App.dayKey();
  }

  function touch(key) {
    dirtyKeys.add(key);
    schedule();
  }

  // ---------------- SRS 记录 ----------------

  function getRec(idx) {
    return state.srs[idx] || null;
  }

  function putRec(idx, rec) {
    state.srs[idx] = rec;
    dirtySrs[idx] = rec;
    schedule();
  }

  function allRecords() {
    return state.srs;
  }

  function countByState() {
    let learning = 0;
    let review = 0;
    let mastered = 0;
    for (const k in state.srs) {
      const r = state.srs[k];
      if (!r) continue;
      if (r.mastered) mastered++;
      else if (r.s >= 2) review++;
      else learning++;
    }
    return { learning, review, mastered, total: learning + review + mastered };
  }

  // ---------------- 筛词（"这个词我认识"） ----------------

  function getScreen() {
    return state.screen;
  }

  function markScreen(idx, on) {
    if (on === false) delete state.screen[idx];
    else state.screen[idx] = 1;
    touch('screen');
  }

  function screenCount() {
    return Object.keys(state.screen).length;
  }

  function getScreenPos() {
    return state.screenPos;
  }

  function setScreenPos(pos) {
    state.screenPos = Object.assign({}, state.screenPos, pos);
    touch('screenPos');
  }

  // ---------------- 收藏 ----------------

  function getFav() {
    return state.fav;
  }

  function isFav(idx) {
    return state.fav.indexOf(idx) >= 0;
  }

  function toggleFav(idx) {
    const at = state.fav.indexOf(idx);
    if (at >= 0) state.fav.splice(at, 1);
    else state.fav.push(idx);
    touch('fav');
    return at < 0;
  }

  // ---------------- 每日统计 ----------------

  function getDay(key) {
    return state.days[key || today()] || null;
  }

  function bump(key, n) {
    const d = today();
    const row = state.days[d] || { n: 0, r: 0, c: 0, w: 0, l: 0, rd: 0, tr: 0, wr: 0 };
    row[key] = (row[key] || 0) + (n == null ? 1 : n);
    state.days[d] = row;
    touch('days');
    return row;
  }

  // 连续学习天数（今天没学也算，只要昨天连着）
  function streak() {
    let n = 0;
    const t = new Date();
    for (let i = 0; i < 400; i++) {
      const k = window.App.dayKey(t);
      const d = state.days[k];
      const active = d && (d.n || d.r || d.c || d.l || d.rd || d.tr || d.wr);
      if (active) n++;
      else if (i > 0) break;
      t.setDate(t.getDate() - 1);
    }
    return n;
  }

  // 所有有记录的天（对象数组）
  function allDays() {
    return Object.keys(state.days).map((k) => state.days[k]);
  }

  // 最近 n 天的记录，按时间正序
  function last(nDays) {
    const out = [];
    const t = new Date();
    for (let i = nDays - 1; i >= 0; i--) {
      const d = new Date(t);
      d.setDate(d.getDate() - i);
      const k = window.App.dayKey(d);
      out.push({ key: k, day: d, data: state.days[k] || null });
    }
    return out;
  }

  // ---------------- 草稿 ----------------

  function getDraft(id) {
    return state.drafts[id] || null;
  }

  function setDraft(id, obj) {
    if (obj == null) delete state.drafts[id];
    else state.drafts[id] = obj;
    touch('drafts');
  }

  // ---------------- 设置 ----------------

  function getSettings() {
    return state.settings;
  }

  function setSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch);
    touch('settings');
    return state.settings;
  }

  // ---------------- 重置 ----------------

  async function resetAll() {
    await Api.post('/api/reset', {});
    state.srs = {};
    state.screen = {};
    state.fav = [];
    state.days = {};
    state.drafts = {};
    state.screenPos = {};
    state.settings = {};
    dirtySrs = {};
    dirtyKeys.clear();
  }

  window.addEventListener('beforeunload', flushSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSync();
  });

  window.Store = {
    load,
    flush,
    flushSync,
    getRec,
    putRec,
    allRecords,
    countByState,
    getScreen,
    markScreen,
    screenCount,
    getScreenPos,
    setScreenPos,
    getFav,
    isFav,
    toggleFav,
    getDay,
    bump,
    streak,
    allDays,
    last,
    getDraft,
    setDraft,
    getSettings,
    setSettings,
    resetAll,
    get lastError() {
      return lastError;
    },
  };
})();
