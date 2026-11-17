/* 由小程序版移植，逻辑未改动 */
(function () {
// 题型生成器：同一个词用不同通道反复提取，避免"看词选义"式的机械滑动
// 延迟绑定：words.js 与本文件的加载顺序不作要求，首次用时才解析
function words() {
  const w = window.Words;
  if (!w) throw new Error('词库模块尚未加载（words.js）');
  return w;
}
const CFG = window.CFG;

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 常见不规则变化，覆盖六级词表里会遇到的少数词
const IRREGULAR = {
  throw: 'threw', deny: 'denied', fling: 'flung', tooth: 'teeth', foot: 'feet',
  spit: 'spat', shake: 'shook', buy: 'bought', ring: 'rang', break: 'broke',
  lay: 'laid', ally: 'allies', arise: 'arose', bear: 'bore', begin: 'began',
  catch: 'caught', choose: 'chose', draw: 'drew', drink: 'drank', drive: 'drove',
  eat: 'ate', fall: 'fell', fight: 'fought', fly: 'flew', forget: 'forgot',
  freeze: 'froze', give: 'gave', grow: 'grew', hide: 'hid', hold: 'held',
  keep: 'kept', know: 'knew', lead: 'led', lie: 'lay', lose: 'lost', meet: 'met',
  pay: 'paid', ride: 'rode', rise: 'rose', run: 'ran', say: 'said', see: 'saw',
  seek: 'sought', sell: 'sold', sing: 'sang', sink: 'sank', speak: 'spoke',
  spend: 'spent', steal: 'stole', swim: 'swam', tear: 'tore', tell: 'told',
  think: 'thought', wear: 'wore', win: 'won', write: 'wrote', mouse: 'mice',
  goose: 'geese', leaf: 'leaves', wolf: 'wolves', life: 'lives',
};

function morphForms(w) {
  const b = w.toLowerCase();
  const out = [];
  const push = (x) => {
    if (x && out.indexOf(x) < 0) out.push(x);
  };
  push(b);
  push(IRREGULAR[b]);
  push(b + 's');
  push(b + 'es');
  push(b + 'ed');
  push(b + 'd');
  push(b + 'ing');
  push(b + 'er');
  push(b.replace(/e$/, '') + 'ing');
  push(b.replace(/e$/, '') + 'ed');
  push(b + b.slice(-1) + 'ed');
  push(b + b.slice(-1) + 'ing');
  if (/y$/.test(b)) {
    push(b.slice(0, -1) + 'ies');
    push(b.slice(0, -1) + 'ied');
  }
  if (/f$/.test(b)) push(b.slice(0, -1) + 'ves');
  if (/fe$/.test(b)) push(b.slice(0, -2) + 'ves');
  return out;
}

function letters(s) {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

// 在句子中定位目标词；兼容不规则变化、连字符/空格差异、简单屈折
function findMatch(sentence, word) {
  if (!sentence || !word) return null;
  const w = word.toLowerCase().replace(/\s+/g, ' ').trim();
  const low = sentence.toLowerCase();

  let idx = low.indexOf(w);
  if (idx >= 0) {
    let end = idx + w.length;
    // 原词在句中是变形时（abandon → abandoned），要连屈折后缀一起挖掉。
    // 否则挖空会长成 "They [abandon]ed the plan."，把答案的后缀露在外面。
    // 只吃屈折后缀（时态、复数、进行时），派生后缀（-ment/-ness/-ion）属于另一个词，不动。
    const tail = low.slice(end);
    const inflect = /^(s|es|ed|ing)\b/.exec(tail);
    if (inflect) end += inflect[0].length;
    return { start: idx, end: end };
  }

  const cands = morphForms(w);
  // 去掉连字符的写法也要能匹配（second-hand ↔ secondhand）
  if (w.indexOf('-') >= 0 || w.indexOf(' ') >= 0) {
    const flat = w.replace(/[\s-]+/g, '');
    const snapshot = cands.slice();
    for (let k = 0; k < snapshot.length; k++) cands.push(snapshot[k].replace(/[\s-]+/g, ''));
    cands.push(flat);
  }
  for (let c = 0; c < cands.length; c++) {
    const cand = cands[c];
    if (!cand) continue;
    // 每个字母之间允许一个连字符或空格，用于跨写法匹配
    const pattern = cand.length <= 16
      ? cand.split('').map(esc).join('[\\s-]?')
      : esc(cand);
    const re = new RegExp('\\b' + pattern + '\\b', 'i');
    const m = re.exec(sentence);
    if (m && letters(m[0]) === letters(cand)) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }

  // 派生词反向还原：dressing→dress、clearing→clear、customs→custom
  const bases = [];
  for (let k = 0; k < cands.length; k++) {
    const c = cands[k];
    const b = c.replace(/(ings|ing|ions|ion|ed|es|s)$/, '');
    if (b && b.length >= 3 && b !== c) bases.push(b);
  }
  for (let k = 0; k < bases.length; k++) {
    const forms = morphForms(bases[k]);
    for (let f = 0; f < forms.length; f++) {
      const re = new RegExp('\\b' + esc(forms[f]) + '\\b', 'i');
      const m = re.exec(sentence);
      if (m && letters(m[0]) === letters(forms[f])) {
        return { start: m.index, end: m.index + m[0].length };
      }
    }
  }
  return null;
}

function segs(sentence, word, mode) {
  const m = findMatch(sentence, word);
  if (!m) return [{ t: sentence }];
  const out = [];
  if (m.start > 0) out.push({ t: sentence.slice(0, m.start) });
  out.push({ t: sentence.slice(m.start, m.end), hl: mode === 'hl', blank: mode === 'blank' });
  if (m.end < sentence.length) out.push({ t: sentence.slice(m.end) });
  return out;
}

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function uniqBy(arr, fn) {
  const seen = {};
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const k = fn(arr[i]);
    if (!seen[k]) {
      seen[k] = 1;
      out.push(arr[i]);
    }
  }
  return out;
}

function wordOptions(e, n) {
  const ds = words().distractors(e, (n || 4) - 1).filter((d) => d.w !== e.w);
  const opts = shuffle([e].concat(ds).slice(0, n || 4));
  return opts.map((o, i) => ({ key: String(i), text: o.w, right: o.i === e.i }));
}

function meaningOptions(e, n) {
  const ds = words().distractors(e, (n || 4) - 1);
  const all = uniqBy([e].concat(ds), (x) => words().shortMeaning(x.m));
  const opts = shuffle(all.slice(0, n || 4));
  return opts.map((o, i) => ({ key: String(i), text: words().shortMeaning(o.m), right: o.i === e.i }));
}

function audioUrl(text) {
  return 'https://fanyi.baidu.com/gettts?lan=en&spd=' + (CFG.audio.spd || 3) +
    '&source=web&text=' + encodeURIComponent(text);
}

// 依据词条可用信息与历史作答挑选题型
function pickType(e, rec) {
  const hasSent = !!e.s;
  const hasPhr = !!e.phr;
  const audioOn = !!(rec && rec.audioOff) ? false : true;
  const reps = (rec && rec.reps) || 0;
  const pool = [];
  if (hasSent) {
    pool.push('cloze');
    pool.push('meaning');
    if (audioOn) pool.push('listen');
  }
  pool.push('input');
  if (hasPhr) pool.push('collocation');
  if (e.w.length >= 4) pool.push('confusable');
  if (audioOn && e.w.length >= 4) pool.push('spell');
  return pool[reps % pool.length] || 'input';
}

function build(e, type) {
  let t = type || 'cloze';
  const canSent = !!e.s && !!findMatch(e.s, e.w);
  if ((t === 'cloze' || t === 'meaning') && !canSent) {
    t = e.phr ? 'collocation' : 'confusable';
  }
  if (t === 'collocation' && !e.phr) t = 'confusable';
  const base = {
    type: t,
    idx: e.i,
    word: e.w,
    meaning: e.m,
    sentence: e.s,
    sentenceCn: e.st,
    pos: e.pos,
    src: e.src,
  };

  if (t === 'cloze' && e.s) {
    return Object.assign(base, {
      segs: segs(e.s, e.w, 'blank'),
      prompt: '选词填空',
      sub: e.st,
      options: wordOptions(e, 4),
      answerText: e.w,
      kind: 'choice',
    });
  }

  if (t === 'meaning' && e.s) {
    return Object.assign(base, {
      segs: segs(e.s, e.w, 'hl'),
      prompt: '句中划线部分最接近的意思是',
      sub: '',
      options: meaningOptions(e, 4),
      answerText: words().shortMeaning(e.m),
      kind: 'choice',
    });
  }

  if (t === 'listen' && e.s) {
    return Object.assign(base, {
      segs: [],
      prompt: '听录音，选出句子中出现的那个词',
      sub: '可重复播放',
      audioText: e.s,
      options: wordOptions(e, 4),
      answerText: e.w,
      kind: 'choice',
    });
  }

  if (t === 'confusable') {
    const sim = words().similar(e, 3);
    const opts = shuffle([e].concat(sim));
    return Object.assign(base, {
      segs: [],
      prompt: '根据释义选出正确的单词',
      sub: words().shortMeaning(e.m),
      options: opts.map((o, i) => ({ key: String(i), text: o.w, right: o.i === e.i })),
      answerText: e.w,
      kind: 'choice',
    });
  }

  if (t === 'collocation' && e.phr) {
    const parts = e.phr.split('|');
    const phrase = parts[0] || '';
    const cn = parts[1] || '';
    return Object.assign(base, {
      segs: segs(phrase, e.w, 'blank'),
      prompt: '补全常用搭配',
      sub: cn,
      options: wordOptions(e, 4),
      answerText: e.w,
      kind: 'choice',
    });
  }

  if (t === 'spell') {
    return Object.assign(base, {
      segs: [],
      prompt: '听音拼写',
      sub: words().shortMeaning(e.m),
      audioText: e.w,
      kind: 'input',
      answerText: e.w,
      first: e.w[0],
      len: e.w.length,
    });
  }

  // input：默认拼写/回忆
  return Object.assign(base, {
    segs: e.s ? segs(e.s, e.w, 'blank') : [],
    prompt: '根据提示写出单词',
    sub: words().shortMeaning(e.m) + (e.s ? '' : ''),
    kind: 'input',
    answerText: e.w,
    first: e.w[0],
    len: e.w.length,
    hint: e.st || '',
  });
}

// 新词首次学习：先看语境再回忆
function intro(e) {
  return {
    type: 'intro',
    idx: e.i,
    word: e.w,
    meaning: e.m,
    sentence: e.s,
    sentenceCn: e.st,
    segs: segs(e.s, e.w, 'hl'),
    pos: e.pos,
    uk: e.uk,
    us: e.us,
    phr: e.phr,
    src: e.src,
    audioText: e.s || e.w,
  };
}

function judgeWord(input, answer) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z\-' ]/g, '').replace(/\s+/g, ' ').trim();
  const a = norm(input);
  const b = norm(answer);
  if (!a) return false;
  if (a === b) return true;
  // 允许常见屈折形式差异
  const stem = (s) => s.replace(/(ing|ed|es|s|ly|er|est)$/, '').replace(/e$/, '');
  const sa = stem(a);
  const sb = stem(b);
  return sa.length >= 3 && sa === sb;
}

// 听写逐词对比：用最长公共子序列对齐，漏词不会让后面全部错位
function diffWords(input, answer) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z'\- ]/g, ' ').split(/\s+/).filter(Boolean);
  const a = norm(answer);
  const b = norm(input);
  const n = a.length;
  const m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const tokens = [];
  let i = n;
  let j = m;
  const path = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      path.push({ w: a[i - 1], ok: true });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      path.push({ w: a[i - 1], ok: false, got: '' });
      i--;
    } else {
      path.push({ w: b[j - 1], ok: false, extra: true, got: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    path.push({ w: a[i - 1], ok: false, got: '' });
    i--;
  }
  while (j > 0) {
    path.push({ w: b[j - 1], ok: false, extra: true, got: b[j - 1] });
    j--;
  }
  path.reverse();
  for (let k = 0; k < path.length; k++) tokens.push(path[k]);
  const correct = tokens.filter((x) => x.ok).length;
  return { tokens, correct, total: a.length, extra: tokens.filter((x) => x.extra).length };
}

window.Quiz = { build, intro, pickType, judgeWord, diffWords, findMatch, segs, wordOptions, meaningOptions, audioUrl, shuffle };

})();
