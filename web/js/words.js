// 词库仓库：启动时从后端一次性载入全量词条，之后全部在内存里查
// 词条字段：i 序号 / w 单词 / m 释义 / pos 词性 / p 页码 / n 页内序号
//          s 例句 / st 例句译文 / src 例句来源 / f 词频 / l6 六级核心标记
//          cat 主题分类 / uk 英音 / us 美音 / phr 词块
(function () {
  let LIST = [];
  let POS_INDEX = null;

  // 释义取第一个词性的前两个义项，用于选项展示
  function shortMeaning(m) {
    if (!m) return '';
    let s = m.replace(/\s+/g, ' ');
    const idx = s.indexOf('；');
    if (idx > 0 && idx < 26) s = s.slice(0, idx);
    const idx2 = s.indexOf('；', 12);
    if (idx2 > 0) s = s.slice(0, idx2);
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  }

  // 后端来的数据可能缺字段，统一补齐并转换类型
  function normalize(e, idx) {
    return {
      i: typeof e.i === 'number' ? e.i : idx,
      w: e.w || '',
      m: e.m || '',
      pos: e.pos || 'other',
      p: e.p || 1,
      n: e.n || 1,
      s: e.s || '',
      st: e.st || '',
      src: e.src || '',
      f: e.f || 0,
      l6: e.l6 ? 1 : 0,
      cat: e.cat || '',
      uk: e.uk || '',
      us: e.us || '',
      phr: e.phr || '',
      meanShort: shortMeaning(e.m || ''),
    };
  }

  function setAll(arr) {
    LIST = arr.map(normalize);
    POS_INDEX = null;
  }

  function all() {
    return LIST;
  }

  function get(idx) {
    return LIST[idx];
  }

  function size() {
    return LIST.length;
  }

  // 分级：六级核心词 / 高频 / 其余
  function gradeOf(e) {
    if (e.l6 || e.f >= 150) return 'A';
    if (e.f >= 50) return 'B';
    return 'C';
  }

  function ensurePosIndex() {
    if (POS_INDEX) return POS_INDEX;
    POS_INDEX = {};
    for (let i = 0; i < LIST.length; i++) {
      const p = LIST[i].pos || 'other';
      (POS_INDEX[p] || (POS_INDEX[p] = [])).push(i);
    }
    return POS_INDEX;
  }

  function rand(n) {
    return Math.floor(Math.random() * n);
  }

  // 取同词性干扰项，尽量挑长度接近的，避免一眼看穿
  function distractors(entry, n, pool) {
    const idx = ensurePosIndex();
    const same = idx[entry.pos] || idx.other || [];
    const out = [];
    const used = { [entry.i]: 1 };
    let guard = 0;
    const len = entry.w.length;
    while (out.length < n && guard < 400) {
      guard++;
      let cand;
      if (same.length > 6 && Math.random() < 0.75) {
        cand = LIST[same[rand(same.length)]];
      } else {
        const src = pool && pool.length ? pool : LIST;
        cand = src[rand(src.length)];
      }
      if (!cand || used[cand.i] || cand.w === entry.w) continue;
      if (Math.abs(cand.w.length - len) > 6 && Math.random() < 0.7) continue;
      used[cand.i] = 1;
      out.push(cand);
    }
    let guard2 = 0;
    while (out.length < n && guard2 < 400) {
      guard2++;
      const cand = LIST[rand(LIST.length)];
      if (cand && !used[cand.i]) {
        used[cand.i] = 1;
        out.push(cand);
      }
    }
    return out;
  }

  // 形近词：同首字母、编辑距离小
  function similar(entry, n) {
    const first = entry.w[0].toLowerCase();
    const cands = [];
    for (let i = 0; i < LIST.length; i++) {
      const w = LIST[i].w;
      if (i === entry.i || !w) continue;
      if (w[0].toLowerCase() !== first) continue;
      if (Math.abs(w.length - entry.w.length) > 2) continue;
      cands.push(LIST[i]);
      if (cands.length > 200) break;
    }
    const out = [];
    while (out.length < n && cands.length) {
      out.push(cands.splice(rand(cands.length), 1)[0]);
    }
    if (out.length < n) {
      const extra = distractors(entry, n - out.length);
      for (let k = 0; k < extra.length; k++) out.push(extra[k]);
    }
    return out;
  }

  function search(kw, limit) {
    const q = (kw || '').trim().toLowerCase();
    if (!q) return [];
    const cap = limit || 40;
    const res = [];
    for (let i = 0; i < LIST.length; i++) {
      const e = LIST[i];
      if (e.w.toLowerCase().indexOf(q) === 0) res.push(e);
      if (res.length >= cap) break;
    }
    if (res.length < 10) {
      for (let i = 0; i < LIST.length; i++) {
        const e = LIST[i];
        if (e.w.toLowerCase().indexOf(q) > 0 || e.m.indexOf(q) >= 0) {
          if (res.indexOf(e) < 0) res.push(e);
          if (res.length >= cap) break;
        }
      }
    }
    return res;
  }

  function byPage(page) {
    return LIST.filter((e) => e.p === page);
  }

  // 主题分类列表（按首次出现顺序，附带词数）
  function catList() {
    const map = {};
    const order = [];
    for (let i = 0; i < LIST.length; i++) {
      const c = LIST[i].cat;
      if (!c) continue;
      if (!map[c]) {
        map[c] = 0;
        order.push(c);
      }
      map[c]++;
    }
    return order.map((name) => ({ name: name, count: map[name] }));
  }

  function pageRange(page, perPage) {
    const base = (page - 1) * (perPage || 30);
    const out = [];
    for (let i = base; i < base + (perPage || 30) && i < LIST.length; i++) out.push(LIST[i]);
    return out;
  }

  function maxPage(perPage) {
    return Math.ceil(LIST.length / (perPage || 30));
  }

  window.Words = {
    setAll,
    all,
    get,
    size,
    gradeOf,
    distractors,
    similar,
    search,
    byPage,
    catList,
    pageRange,
    maxPage,
    shortMeaning,
  };
})();
