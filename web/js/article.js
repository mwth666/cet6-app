// 回顾文章生成器：把一天背过的词，用它们自己的例句重新编织成一篇长文
//
// 思路：词库里每个词都带一条语法正确的完整例句。与其凭空造故事（本地跑不动大模型），
// 不如把这些真实句子按主题分章、用克制的衔接短语串成一篇可以顺读的长文——
// 每个词都在它本来该出现的语境里再出现一次，这正是"背完再读一遍"要的效果。
//
// 全部纯函数 + 确定性随机：同一天同一版，刷新多少次都是同一篇，方便反复读。
(function () {
  // ---------------- 确定性随机 ----------------

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32：小而稳，同一种子必得同一序列
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(arr, rand) {
    return arr[Math.floor(rand() * arr.length) % arr.length];
  }

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // ---------------- 主题分章 ----------------
  // 词库有 118 个细分主题，太碎了（一天 160 个词会摊到 100 个主题上），
  // 这里合并成 11 个大章节，保证每章都有足够句子组成段落。
  const CH = [
    { id: 'time', cn: '时间、变化与因果', en: 'time and change' },
    { id: 'mind', cn: '内心、判断与价值', en: 'the mind at work' },
    { id: 'talk', cn: '说、写与交流', en: 'words between people' },
    { id: 'body', cn: '身体、健康与饮食', en: 'the body and its appetites' },
    { id: 'nature', cn: '自然、物质与能量', en: 'nature and matter' },
    { id: 'society', cn: '社会、家庭与制度', en: 'society and its rules' },
    { id: 'economy', cn: '经济、商业与工作', en: 'money and work' },
    { id: 'culture', cn: '科技、教育与文化', en: 'knowledge and culture' },
    { id: 'space', cn: '空间、器物与移动', en: 'places and things' },
    { id: 'play', cn: '运动、休闲与感受', en: 'play and feeling' },
    { id: 'measure', cn: '数量、程度与虚词', en: 'measure and grammar' },
    { id: 'other', cn: '其余词汇', en: 'the rest' },
  ];

  const CAT2CH = {
    '时间、日期与时期': 'time', '顺序、频率与次序': 'time', '开始、结束与持续': 'time',
    '变化、发展与趋势': 'time', '原因、理由与根据': 'time', '因果、条件与逻辑关系': 'time',
    '情况、环境与背景': 'time', '事件、事情与经历': 'time', '稳定、平衡与常态': 'time',

    '情绪与情感': 'mind', '性格与品性': 'mind', '心理态度与欲望': 'mind',
    '意志、决心与习惯': 'mind', '记忆、注意与心智感知': 'mind', '思考、推理与分析': 'mind',
    '想象、创意与梦想': 'mind', '信念、观点与哲学思想': 'mind', '知识、学问与智慧': 'mind',
    '重要性、必要性与价值评价': 'mind', '评价、判断与是非标准': 'mind',
    '真伪、虚实与确定性': 'mind', '难易、简繁与可能性': 'mind', '目的、计划与方法': 'mind',
    '优点、美德与正面评价': 'mind', '缺点、问题与负面评价': 'mind',

    '说、讲与口头表达': 'talk', '写、读与书面表达': 'talk', '交流、讨论与协商': 'talk',
    '问答、请求、命令与建议': 'talk', '声称、承认、否认与承诺': 'talk',
    '声音、喊叫与嗓音': 'talk',

    '人体部位与生理机能': 'body', '健康、疾病与医疗': 'body', '食物、饮料与饮食': 'body',
    '烹饪、厨房与餐饮行为': 'body', '感官动作与感知': 'body', '手部动作': 'body',
    '生命阶段与生老病死': 'body', '外貌、服饰与打扮': 'body',

    '生物、动物与植物': 'nature', '农业、种植与畜牧': 'nature',
    '天气、气候与自然现象': 'nature', '天文、地理与宇宙': 'nature',
    '水、海洋与河流': 'nature', '土地、地形与自然资源': 'nature', '火、光与热': 'nature',
    '材料、原料与物质': 'nature', '能源、燃料与电力': 'nature', '物理、化学与实验': 'nature',
    '形状、尺寸与度量': 'nature', '环境、生态与污染': 'nature',

    '社会、群体与公共事务': 'society', '政治、政府与制度': 'society',
    '领导、权力与服从': 'society', '法律、法规与司法': 'society',
    '犯罪、惩罚与监狱': 'society', '军事、战争与武器': 'society',
    '冲突、竞争与斗争': 'society', '外交、国际关系与条约': 'society',
    '国家、民族与地区': 'society', '性别、年龄与人口': 'society',
    '城市、乡村与社区': 'society', '人物身份与社会角色': 'society', '职业与职位': 'society',
    '家庭与亲属关系': 'society',

    '金钱、银行与金融': 'economy', '贸易、市场与买卖': 'economy',
    '商业、公司与经营': 'economy', '经济、产业与财政': 'economy',
    '价格、价值与财富': 'economy', '工作、就业与职业生涯': 'economy',
    '管理、组织与职场行为': 'economy', '工业、制造与工厂': 'economy',
    '合作、分享与联合': 'economy', '帮助、阻碍与影响': 'economy',
    '给予、获得与占有': 'economy', '成功、失败与结果': 'economy',

    '计算机、软件与互联网': 'culture', '科学、技术与发明': 'culture',
    '通讯、邮政与联络': 'culture', '教育机构与设施': 'culture',
    '教学、学习与培训': 'culture', '考试、测验与成绩': 'culture',
    '学科、课程与学术研究': 'culture', '书籍、文献与图书馆': 'culture',
    '文学、戏剧与影视': 'culture', '艺术、音乐与美术': 'culture',
    '历史、传统与文化': 'culture', '宗教、信仰与仪式': 'culture',
    '新闻媒体与出版': 'culture', '语言、文字与符号': 'culture',

    '空间、位置与距离': 'space', '移动、运输与位置变化(通用动词)': 'space',
    '交通、运输与车辆': 'space', '道路、路线与方向': 'space',
    '旅行、旅游与行程': 'space', '走、跑、跳与身体移动': 'space',
    '建筑、房屋与住所': 'space', '工具、器械与设备': 'space',
    '通用名词(具体物件杂项)': 'space', '整体、部分与组成': 'space',
    '房间、家具与家居用品': 'space',
    '制造、破坏与物理改变': 'space',

    '体育、运动与竞赛': 'play', '娱乐、游戏与休闲': 'play',
    '安全、危险与风险': 'play', '颜色、外观与视觉特征': 'play',

    '数学、数量与计算': 'measure', '数量、程度与范围': 'measure',
    '数词、代词与限定词': 'measure', '介词、连词与功能词': 'measure',
    '副词(方式/时间/程度)': 'measure', '通用形容词(性质状态杂项)': 'measure',
    '通用动词(难以归类的行为)': 'measure', '品质、性质与抽象状态': 'measure',
    '抽象概念与泛指名词(其他)': 'measure', '异同、相似与对比': 'measure',
  };

  function chapterOf(cat) {
    if (CAT2CH[cat]) return CAT2CH[cat];
    // 兜底：分类名变了也能靠关键词归位
    const s = String(cat || '');
    if (/时间|因果|变化|开始|结束|顺序|频率/.test(s)) return 'time';
    if (/情绪|性格|思考|信念|评价|心理|意志|记忆/.test(s)) return 'mind';
    if (/说|讲|写|读|交流|讨论|问答/.test(s)) return 'talk';
    if (/身体|健康|疾病|食物|饮食|感官|手部|家居/.test(s)) return 'body';
    if (/生物|动物|植物|天气|水|土地|材料|物理|能源/.test(s)) return 'nature';
    if (/社会|政治|法律|军事|冲突|国家|城市|职业/.test(s)) return 'society';
    if (/金钱|贸易|商业|经济|工作|管理|工业/.test(s)) return 'economy';
    if (/计算机|科学|教育|教学|书籍|文学|艺术|历史|语言/.test(s)) return 'culture';
    if (/空间|移动|交通|道路|旅行|建筑|工具|整体/.test(s)) return 'space';
    if (/体育|娱乐|安全|颜色/.test(s)) return 'play';
    if (/数量|数学|词|形容词|副词|品质|抽象/.test(s)) return 'measure';
    return 'other';
  }

  // ---------------- 语料 ----------------

  // 句首一律不加引导短语。
  // 试过 "Elsewhere, " 这类状语前缀来制造推进感，但原句本来就大写开头，
  // 拼起来会变成 "Elsewhere, The report called for..." 这种错；要修就得猜
  // 首词是不是专有名词，猜错更难看。句子保持原样最稳，节奏交给分段和标题。

  const TITLES = [
    (a, b, n) => `One Page, ${n} Words`,
    (a, b, n) => `Between ${cap(a)} and ${cap(b)}`,
    (a, b, n) => `${cap(a)}, ${cap(b)}, and Everything Between`,
    (a, b, n) => `A Reading of ${n} Words`,
    (a, b, n) => `Words From ${cap(a)}`,
    (a, b, n) => `${n} Words, One Pass`,
  ];

  const OPENS = [
    (n, m) => `Here is today's page — ${n} words, ${m} sentences, put back together in one reading.`,
    (n, m) => `${n} words from today, rearranged into a single page. Read it once through and let the context do the work.`,
    (n, m) => `Nothing on this page is new. These are today's ${n} words, carried back in ${m} sentences, each one in the place it usually lives.`,
    (n, m) => `Today's ${n} words are spread across ${m} sentences below. None of them is here by accident.`,
  ];

  const OPENS_SAME = [
    (n) => `Here is today's page — ${n} words, one sentence each, put back together in one reading.`,
    (n) => `${n} words from today, one sentence apiece, arranged into a single page.`,
    (n) => `Nothing here is new: these are today's ${n} words, each carried by one sentence, in the place it usually lives.`,
    (n) => `Today's ${n} words, one after another, each inside a sentence that already belongs to it.`,
  ];

  const CLOSES = [
    (n) => `That is all ${n} of them. Tomorrow the page will look different.`,
    (n) => `${n} words, one pass. Any line that felt unfamiliar will come back in your review queue.`,
    (n) => `End of the page. Read it once more tomorrow, before the new words arrive.`,
    (n) => `Done — ${n} words in context. If one of them still feels thin, open it and look at the sentence again.`,
  ];

  // 虚词在标题里保持小写（首词除外）
  const SMALL_WORDS = {
    the: 1, a: 1, an: 1, of: 1, and: 1, in: 1, on: 1, to: 1, at: 1, by: 1,
    for: 1, with: 1, from: 1, as: 1, or: 1,
  };

  // 标题式大小写：首词必大写，其余实词大写、虚词小写
  function cap(s) {
    return String(s || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w, i) => {
        const low = w.toLowerCase();
        if (i > 0 && SMALL_WORDS[low]) return low;
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }

  // ---------------- 句子清洗与筛选 ----------------
  // 词库里的例句绝大多数是完整句，但有一小部分是词典的"短语式示例"
  // （"plans to radically reform the tax system"这种，没有主语和句末标点），
  // 还有些带内联注释（"(= it was not true)"）。这些直接拼进文章会很突兀，
  // 先清洗，清洗后仍不成句的就不进正文，改在文末列出来。

  function cleanSentence(raw) {
    let t = String(raw || '');
    // 去掉词典的内联释义注释，注意原文里常有多余空格："(=  it was not true  )"
    t = t.replace(/\s*\(\s*=\s*[^()]*\)/g, '');
    t = t.replace(/\s*（\s*=\s*[^（）]*）/g, '');
    // 去掉「...」这类省略标记
    t = t.replace(/\.{3,}/g, '').replace(/…/g, '');
    t = t.replace(/\s+/g, ' ').trim();
    // 清理注释后可能留下 " ." 这种孤立标点
    t = t.replace(/\s+([.,!?;:])/g, '$1');
    if (/^[a-z,;]/.test(t) && !/^[a-z]+[A-Z]/.test(t)) {
      // 开头是逗号之类的残留
      t = t.replace(/^[,;]\s*/, '');
    }
    return t;
  }

  // 能不能当"文章里的一句话"
  function goodSentence(t) {
    if (!t) return false;
    if (t.length < 18 || t.length > 190) return false;
    if (t.split(/\s+/).length < 4) return false;
    if (!/^["'(]?[A-Z]/.test(t)) return false; // 完整句必然大写开头
    if (!/[.!?]$/.test(t)) return false; // 必须有句末标点
    // 残留的词典标记
    if (/\(=|（=|\bpl\.|\bsyn\.|\bant\.|\badj\.|\badv\./.test(t)) return false;
    return true;
  }

  // ---------------- 句子构造 ----------------

  function locate(sent, word) {
    // 复用出题模块的匹配逻辑：能处理 -ed/-ing/-s 这类屈折变化
    if (window.Quiz && window.Quiz.findMatch) {
      const m = window.Quiz.findMatch(sent, word);
      if (m && m.end > m.start) return m;
    }
    const idx = sent.toLowerCase().indexOf(String(word || '').toLowerCase());
    return idx >= 0 ? { start: idx, end: idx + word.length } : null;
  }

  function makeSentence(entry, rand) {
    const e = entry.e;
    const raw = cleanSentence(e.s);
    if (!goodSentence(raw)) return null;

    const m = locate(raw, e.w);
    let a = raw, b = '', c = '';
    if (m) {
      a = raw.slice(0, m.start);
      b = raw.slice(m.start, m.end);
      c = raw.slice(m.end);
    }

    return {
      i: e.i,
      w: e.w,
      meaning: e.meanShort || e.m,
      cn: e.st || '',
      a: a,
      b: b,
      c: c,
      text: raw,
      raw: raw,
    };
  }

  // 文末补列的词：只留展示需要的字段，句子也清洗干净
  function brief(e) {
    return {
      i: e.i,
      w: e.w,
      meaning: e.meanShort || e.m,
      s: cleanSentence(e.s) || String(e.s || '').trim(),
    };
  }

  // ---------------- 组装 ----------------

  /**
   * @param {Array} entries [{ e: 词条 }]，e 已由 Words.normalize 处理过
   * @param {string} seedStr 决定排序与前缀；同一天同一版必得同一篇
   * @returns {object} 文章结构
   */
  function compose(entries, seedStr) {
    const seed = hash(seedStr || 'seed');
    const rand = rng(seed);

    const seenSent = Object.create(null);
    const seenWord = Object.create(null);
    const pool = Object.create(null);
    const extras = []; // 例句不成句或重复的词，进文末补列
    let total = 0;

    (entries || []).forEach((it) => {
      const e = it && it.e;
      if (!e) return;
      if (seenWord[e.i]) return;
      seenWord[e.i] = 1;
      total++;

      const s = makeSentence(it, rand);
      if (!s) {
        extras.push(brief(e));
        return;
      }
      const key = s.raw.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seenSent[key]) {
        // 同一个例句被两个词共用，只收一次，否则文章里会出现重复句
        extras.push(brief(e));
        return;
      }
      seenSent[key] = 1;

      const chId = chapterOf(e.cat);
      if (!pool[chId]) pool[chId] = [];
      pool[chId].push({ sent: s, e: e });
    });

    // 按固定顺序成章
    const groups = [];
    CH.forEach((ch) => {
      const list = pool[ch.id];
      if (list && list.length) groups.push({ ch: ch, list: shuffle(list, rand) });
    });

    // 一两句话撑不起章节，硬拆会让文章碎成清单，合并成一章「零散词汇」
    let totalWords = 0;
    groups.forEach((g) => {
      totalWords += g.list.length;
    });
    // 词多的时候章节太碎会变成清单，门槛跟着抬高
    const MIN = totalWords >= 100 ? 5 : 3;
    const big = groups.filter((g) => g.list.length >= MIN);
    const tiny = groups.filter((g) => g.list.length < MIN);
    if (tiny.length) {
      const all = [];
      tiny.forEach((g) => {
        g.list.forEach((x) => all.push(x));
      });
      const exist = big.find((g) => g.ch.id === 'other');
      if (exist) {
        exist.list = shuffle(exist.list.concat(all), rand);
      } else {
        big.push({
          ch: { id: 'other', cn: '零散词汇', en: 'odds and ends' },
          list: shuffle(all, rand),
        });
      }
    }

    const chapters = big.map((g) => {
      // 每段 5–7 句，接近六级阅读的段落密度
      const paras = [];
      let k = 0;
      while (k < g.list.length) {
        let size = 5 + Math.floor(rand() * 3);
        const rest = g.list.length - k;
        // 切到最后只剩一两句时并进本段，别留下孤零零的尾巴
        if (rest - size > 0 && rest - size < 3) size = rest;
        paras.push(g.list.slice(k, k + size).map((x) => x.sent));
        k += size;
      }
      return {
        id: g.ch.id,
        cn: g.ch.cn,
        en: g.ch.en,
        head: `「${g.ch.cn}」— ${g.list.length} 个词，${paras.length} 段。`,
        paras: paras,
        words: g.list.map((x) => x.e),
        n: g.list.length,
      };
    });

    const totalSents = chapters.reduce((a, c) => a + c.n, 0);
    const totalInBody = chapters.reduce((a, c) => a + c.words.length, 0);

    // 标题取覆盖词数最多的两个章节
    const top = chapters
      .slice()
      .sort((x, y) => y.n - x.n)
      .map((c) => c.en);
    const titleFn = pick(TITLES, rand);
    const openFn = pick(totalInBody === totalSents ? OPENS_SAME : OPENS, rand);

    return {
      seed: seed,
      seedStr: seedStr,
      title: titleFn(top[0] || 'words', top[1] || 'context', totalInBody),
      open: openFn(totalInBody, totalSents),
      close: pick(CLOSES, rand)(totalInBody),
      chapters: chapters,
      extras: extras,
      stats: {
        words: totalInBody,
        sents: totalSents,
        chapters: chapters.length,
        chars: chapters.reduce(
          (a, c) => a + c.paras.reduce((b, p) => b + p.reduce((d, s) => d + s.text.length, 0), 0),
          0
        ),
        extras: extras.length,
        total: total,
      },
    };
  }

  // ---------------- 取某一天的词 ----------------
  // SRS 记录里的 last 就是这个词最后一次被评分的时间，
  // 所以"那天的 last"就等于"那天背过的词"，不需要另存一份清单。

  function entriesOn(key) {
    const S = window.Store;
    const W = window.Words;
    if (!S || !W) return [];
    const recs = S.allRecords();
    const out = [];
    Object.keys(recs).forEach((k) => {
      const r = recs[k];
      if (!r || !r.last) return;
      if (window.App.dayKey(new Date(r.last)) !== key) return;
      const e = W.get(Number(k));
      if (e) out.push({ e: e, rec: r });
    });
    // 按当天学习的先后顺序，读起来跟当天的节奏一致
    out.sort((a, b) => (a.rec.last || 0) - (b.rec.last || 0));
    return out;
  }

  // 最近有记录的若干天，用来回看
  function recentDays(limit) {
    const S = window.Store;
    if (!S) return [];
    const recs = S.allRecords();
    const map = Object.create(null);
    Object.keys(recs).forEach((k) => {
      const r = recs[k];
      if (!r || !r.last) return;
      const d = window.App.dayKey(new Date(r.last));
      map[d] = (map[d] || 0) + 1;
    });
    return Object.keys(map)
      .sort()
      .reverse()
      .slice(0, limit || 8)
      .map((d) => ({ key: d, n: map[d] }));
  }

  window.Article = {
    compose,
    entriesOn,
    recentDays,
    chapterOf,
    hash,
    rng,
    CH,
    CHAPTERS: CH,
    CAT2CH,
  };
})();
