// 回顾长文：把某一天背过的词，用它们自己的例句重新编组，连成一篇可顺读的英文长文
(function () {
  const { esc, Router, Audio2 } = window.App;
  const KEY = '__article';

  function prefs() {
    const p = Store.getDraft(KEY) || {};
    return { cn: !!p.cn };
  }

  function savePrefs(p) {
    Store.setDraft(KEY, { cn: !!p.cn });
  }

  // 某一天背过哪些词，统一由生成器提供，首页也用同一份逻辑
  const entriesOn = (key) => window.Article.entriesOn(key);
  const recentDays = (n) => window.Article.recentDays(n);

  function sentHtml(s, gi) {
    return `<span class="s" data-gi="${gi}" data-i="${s.i}"><span class="sa">${esc(
      s.a
    )}</span><b class="hl" data-i="${s.i}" title="${esc(s.w)} ${esc(s.meaning || '')}">${esc(
      s.b
    )}</b><span class="sc">${esc(s.c)}</span>${
      s.cn ? `<span class="zh">${esc(s.cn)}</span>` : ''
    }</span>`;
  }

  function render(root, args, query) {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(query.d || '') ? query.d : window.App.dayKey();
    let v = Math.floor(Number(query.v));
    if (!Number.isFinite(v) || v < 0) v = 0;
    v = Math.min(v, 999);

    const pref = prefs();
    if (query.cn === '1') pref.cn = true;
    if (query.cn === '0') pref.cn = false;
    const entries = entriesOn(key);

    // ---- 空状态 ----
    if (!entries.length) {
      const days = recentDays(8);
      root.innerHTML = `
        <div class="card">
          <div class="card-hd"><div class="card-t">${esc(key)} 的回顾长文</div></div>
          <div class="empty">
            这一天还没有背词记录。<br>
            <span class="tiny muted">完成今天的学习后，这里会自动把背过的词编成一篇长文。</span>
          </div>
          <div class="row" style="gap:10px;margin-top:14px">
            <button class="btn btn-primary" data-act="study">去学今天的词</button>
            <button class="btn" data-act="home">回首页</button>
          </div>
          ${
            days.length
              ? `<div class="divider"></div>
                 <div class="tiny muted" style="margin-bottom:8px">最近有记录的日子</div>
                 <div class="row wrap" style="gap:8px">
                   ${days
                     .map(
                       (d) =>
                         `<button class="btn btn-sm" data-act="day" data-d="${d.key}">${d.key.slice(
                           5
                         )} · ${d.n} 词</button>`
                     )
                     .join('')}
                 </div>`
              : ''
          }
        </div>`;
      App.on(root, {
        study: () => Router.go('/study'),
        home: () => Router.go('/home'),
        day: (t) => Router.go('/article?d=' + t.dataset.d),
      });
      return;
    }

    // ---- 生成 ----
    const art = window.Article.compose(entries, key + '|v' + v);
    const st = art.stats;

    if (!art.chapters.length) {
      root.innerHTML = `<div class="card"><div class="empty">
        这一天背过 ${st.total} 个词，但例句都是短语片段，拼不成完整句子。<br>
        <span class="tiny muted">换一天看看，或者直接去词库复习。</span>
      </div>
      <div class="row" style="gap:10px;margin-top:14px">
        <button class="btn" data-act="list">去词库</button>
        <button class="btn" data-act="home">回首页</button>
      </div></div>`;
      App.on(root, { list: () => Router.go('/list'), home: () => Router.go('/home') });
      return;
    }

    // 全局句子序号，朗读时按它定位
    let gi = 0;
    const flat = []; // 朗读队列：纯英文句子
    const body = art.chapters
      .map((c, ci) => {
        const paras = c.paras
          .map((p) => {
            const inner = p
              .map((s) => {
                flat.push(s.text);
                return sentHtml(s, gi++);
              })
              .join(' ');
            return `<p class="art-p${pref.cn ? ' with-cn' : ''}">${inner}</p>`;
          })
          .join('');
        const words = c.words
          .map(
            (e) =>
              `<button class="wchip" data-act="word" data-i="${e.i}">${esc(e.w)}<i>${esc(
                e.meanShort || ''
              )}</i></button>`
          )
          .join('');
        return `<article class="card art-ch" id="ch-${ci}">
          <div class="art-ch-hd">
            <div>
              <div class="art-ch-n">${String(ci + 1).padStart(2, '0')}</div>
              <h2 class="art-ch-t">${esc(c.cn)}</h2>
              <div class="tiny muted">${esc(c.en)} · ${c.n} 个词 · ${c.paras.length} 段</div>
            </div>
            <button class="btn btn-sm" data-act="readCh" data-c="${ci}">朗读</button>
          </div>
          ${paras}
          <details class="art-words">
            <summary class="tiny muted">本段词表（${c.n}）</summary>
            <div class="wchips">${words}</div>
          </details>
        </article>`;
      })
      .join('');

    const extras = art.extras.length
      ? `<div class="card">
           <div class="card-hd">
             <div class="card-t">没进正文的 ${art.extras.length} 个词</div>
           </div>
           <div class="tiny muted" style="margin-bottom:10px">
             这些词的例句是短语片段（词典写法，没有主语或句末标点），拼进长文会读不通，单独列在这里。
           </div>
           <div class="wchips">
             ${art.extras
               .map(
                 (e) =>
                   `<button class="wchip" data-act="word" data-i="${e.i}">${esc(e.w)}<i>${esc(
                     e.meaning || ''
                   )}</i></button>`
               )
               .join('')}
           </div>
         </div>`
      : '';

    const dayChips = recentDays(8)
      .map(
        (d) =>
          `<button class="btn btn-sm${d.key === key ? ' btn-primary' : ''}" data-act="day" data-d="${
            d.key
          }">${d.key.slice(5)}</button>`
      )
      .join('');

    root.innerHTML = `
      <section class="card art-head">
        <div class="row between wrap" style="gap:10px;margin-bottom:12px">
          <div class="tiny muted">${esc(key)} · 今日回顾</div>
          <div class="row wrap" style="gap:8px">
            <button class="btn btn-sm${pref.cn ? ' btn-primary' : ''}" data-act="cn">${
              pref.cn ? '隐藏中文' : '显示中文'
            }</button>
            <button class="btn btn-sm" data-act="readAll">朗读全文</button>
            <button class="btn btn-sm" data-act="regen">换一版</button>
          </div>
        </div>
        <h1 class="art-title">${esc(art.title)}</h1>
        <p class="art-open">${esc(art.open)}</p>
        <div class="row wrap art-meta">
          <span><b>${st.words}</b> 个词</span>
          <span><b>${st.sents}</b> 句</span>
          <span><b>${st.chapters}</b> 章</span>
          <span>约 <b>${Math.round(st.chars / 5.4)}</b> 词</span>
          ${
            st.extras
              ? `<span class="muted">另有 ${st.extras} 词在文末单列</span>`
              : ''
          }
        </div>
      </section>

      <nav class="art-nav" id="artNav">
        ${art.chapters
          .map(
            (c, ci) =>
              `<button class="art-nav-i" data-act="jump" data-c="${ci}">${esc(c.cn)}<i>${c.n}</i></button>`
          )
          .join('')}
      </nav>

      <div id="artBody">${body}</div>

      <div class="card art-end">
        <div class="art-end-line">· · ·</div>
        <p class="art-close">${esc(art.close)}</p>
        <div class="row" style="gap:10px;justify-content:center;margin-top:16px">
          <button class="btn" data-act="regen">再换一版</button>
          <button class="btn" data-act="home">回首页</button>
        </div>
        <div class="divider"></div>
        <div class="tiny muted" style="margin-bottom:8px">回看别的日子</div>
        <div class="row wrap" style="gap:8px">${dayChips}</div>
      </div>

      ${extras}

      <div class="card">
        <div class="tiny muted" style="line-height:1.8">
          这篇长文里的每一句，都是词库里该词自带的真实例句，按主题重新编组，没有一句是现编的。
          所以它读起来不像一篇有情节的文章，更像把今天的词放回它们各自的语境里过一遍——
          读的时候留意高亮的词，想一想它在句子里承担的意思，比单看释义记得牢。
        </div>
      </div>
    `;

    // ---- 交互 ----

    let stopRead = null;

    function clearCur() {
      root.querySelectorAll('.s.cur').forEach((n) => n.classList.remove('cur'));
    }

    function startRead(list, base) {
      if (!Audio2.available()) {
        App.toast('这台机器没有可用的英文语音，先看文字吧');
        return;
      }
      if (stopRead) {
        stopRead();
        stopRead = null;
      }
      clearCur();
      stopRead = Audio2.speakQueue(list, {
        each(i) {
          clearCur();
          const n = root.querySelector(`.s[data-gi="${base + i}"]`);
          if (n) {
            n.classList.add('cur');
            const box = n.getBoundingClientRect();
            if (box.top < 70 || box.bottom > window.innerHeight - 40) {
              n.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }
        },
        done() {
          clearCur();
          stopRead = null;
          App.toast('读完了');
        },
      });
    }

    function stopReading() {
      if (stopRead) {
        stopRead();
        stopRead = null;
      }
      clearCur();
    }

    // 段落/章节的起始全局序号
    const chBase = [];
    {
      let n = 0;
      art.chapters.forEach((c) => {
        chBase.push(n);
        c.paras.forEach((p) => {
          n += p.length;
        });
      });
    }

    App.on(root, {
      cn: (t) => {
        const next = !prefs().cn;
        savePrefs({ cn: next });
        root.querySelectorAll('.art-p').forEach((p) => p.classList.toggle('with-cn', next));
        t.textContent = next ? '隐藏中文' : '显示中文';
        t.classList.toggle('btn-primary', next);
      },
      regen: () => Router.go('/article?d=' + key + '&v=' + (v + 1)),
      readAll: () => {
        if (stopRead) {
          stopReading();
          App.toast('已停止');
          return;
        }
        startRead(flat, 0);
      },
      readCh: (t) => {
        const ci = Number(t.dataset.c);
        const c = art.chapters[ci];
        if (!c) return;
        if (stopRead) {
          stopReading();
          return;
        }
        const list = [];
        c.paras.forEach((p) => p.forEach((s) => list.push(s.text)));
        startRead(list, chBase[ci]);
      },
      jump: (t) => {
        const el = document.getElementById('ch-' + t.dataset.c);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      },
      word: (t) => Router.go('/word/' + Number(t.dataset.i)),
      day: (t) => Router.go('/article?d=' + t.dataset.d),
      home: () => Router.go('/home'),
    });

    // 点击句中的高亮词：就地展开释义，不跳走，避免丢失阅读位置
    root.querySelectorAll('.hl').forEach((n) => {
      if (!n.textContent.trim()) return;
      n.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const i = Number(n.dataset.i);
        const e = Words.get(i);
        if (!e) return;
        const para = n.closest('.art-p');
        if (!para) return;
        let old = para.nextElementSibling;
        if (old && old.classList.contains('para-gloss')) old.remove();
        const box = document.createElement('div');
        box.className = 'para-gloss';
        box.innerHTML = `
          <b>${esc(e.w)}</b>
          <span class="tiny muted">${esc(e.pos || '')}</span>
          <span>${esc(e.meanShort || e.m || '')}</span>
          <button class="btn btn-sm" data-g="say">🔊</button>
          <button class="btn btn-sm" data-g="open">词条</button>`;
        para.insertAdjacentElement('afterend', box);
        box.querySelector('[data-g="say"]').addEventListener('click', (ev2) => {
          ev2.stopPropagation();
          Audio2.speakWord(e.w);
        });
        box.querySelector('[data-g="open"]').addEventListener('click', (ev2) => {
          ev2.stopPropagation();
          Router.go('/word/' + e.i);
        });
      });
    });

    // 点别处收起释义条
    root.addEventListener('click', (ev) => {
      if (ev.target.closest('.hl') || ev.target.closest('.para-gloss')) return;
      root.querySelectorAll('.para-gloss').forEach((n) => n.remove());
    });

    // ?j=N 直接翻到第 N 章
    if (query.j != null && query.j !== '') {
      const ci = App.idxOf(query.j, art.chapters.length);
      const el = document.getElementById('ch-' + ci);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }

    // 换页就停止朗读，别让声音跟到别的页面去
    if (window.__artLeave) window.removeEventListener('hashchange', window.__artLeave);
    window.__artLeave = () => stopReading();
    window.addEventListener('hashchange', window.__artLeave);
  }

  App.Router.add('/article', render);
})();
