// 听力：真题句听写、听音选词、信号词、短对话
(function () {
  const { esc, Router, toast, shuffle } = window.App;

  // ---------- 入口 ----------

  function home(root) {
    const L = App.content.listen || {};
    const nSig = (L.signals || []).reduce((a, s) => a + s.items.length, 0);
    const nDlg = (L.dialogues || []).reduce((a, d) => a + d.questions.length, 0);
    const day = Store.getDay() || {};

    root.innerHTML = `
      <div class="card">
        <div class="card-hd">
          <div>
            <div class="card-t">听力</div>
            <div class="card-sub" style="margin:0">六级听力考的不是"听懂每个词"，而是抓信号词、抓关键信息</div>
          </div>
          <span class="tiny muted">今天已练 ${day.l || 0} 题</span>
        </div>
        <div class="grid2">
          ${[
            ['dictation', '真题句听写', '听一句写一句，逐词对比，专治"听不懂但看得懂"', `${Words.size()} 句可用`],
            ['wordpick', '听音选词', '只听发音，从四个形近/义近词里选', '结合词库'],
            ['signal', '信号词专项', '转折、因果、让步…听到就该竖耳朵', `${nSig} 条`],
            ['dialogue', '短对话与短文', '按六级节奏做题，逐句可回听', `${nDlg} 题`],
          ]
            .map(
              ([m, t, d, c]) => `<div class="pick-card" data-act="go" data-m="${m}">
                <div class="li-t">${t}</div>
                <div class="li-s" style="margin-top:4px">${d}</div>
                <div class="tiny" style="margin-top:8px;color:var(--blue)">${c}</div>
              </div>`
            )
            .join('')}
        </div>
      </div>
      <div class="card">
        <div class="notice ${window.Audio2.available() ? '' : 'warn'}">
          ${
            window.Audio2.available()
              ? '发音用浏览器自带的语音合成，离线可用。听不清可以放慢速度重听。'
              : '当前浏览器没有可用的英文语音，听音类练习会自动显示原文，改成"看句跟读"。安卓 Chrome 或 Edge 一般都有英文音色。'
          }
        </div>
      </div>`;
    App.on(root, {
      go: (t) => Router.go('/listen?mode=' + t.dataset.m),
    });
  }

  // ---------- 真题句听写 ----------

  function dictation(root) {
    const pool = Words.all().filter((e) => e.s && e.s.split(' ').length >= 5);
    let queue = shuffle(pool).slice(0, 20);
    let i = 0;
    let val = '';
    let shown = false;
    let result = null;

    function paint() {
      if (i >= queue.length) return summary();
      const e = queue[i];
      root.innerHTML = `
        ${bar('听写', i, queue.length, '/listen')}
        <div class="card">
          <div class="row between" style="margin-bottom:14px">
            <span class="tiny muted">听一遍，把整句写下来</span>
            <div class="row" style="gap:6px">
              <button class="btn btn-sm" data-act="play">🔊 播放</button>
              <button class="btn btn-sm" data-act="slow">慢速</button>
            </div>
          </div>
          <input class="input en" id="ans" placeholder="听到什么写什么，标点不用管" value="${esc(val)}" autocomplete="off" spellcheck="false">
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn btn-primary grow" data-act="check">核对</button>
            <button class="btn" data-act="reveal">看原文</button>
          </div>
          ${shown ? revealBlock(e, result) : ''}
          ${result ? `
            <div class="divider"></div>
            <div class="row between">
              <span class="small">逐词对比：<b style="color:#12a150">${result.correct}</b> / ${result.total} 词对</span>
              <button class="btn btn-primary btn-sm" data-act="next">${i + 1 >= queue.length ? '完成' : '下一句'}</button>
            </div>
            <div class="tokens" style="margin-top:10px;line-height:2">
              ${result.tokens.map((t) => t.extra
                ? `<span class="tok tok-miss" title="多写的词">${esc(t.w)}</span>`
                : t.ok
                  ? `<span class="tok tok-ok">${esc(t.w)}</span>`
                  : `<span class="tok tok-bad" title="应为 ${esc(t.w)}">${esc(t.w)}</span>`
              ).join('')}
            </div>` : ''}
        </div>`;
      bind(e);
      const inp = root.querySelector('#ans');
      if (inp) {
        inp.focus();
        inp.addEventListener('input', (ev) => { val = ev.target.value; });
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            val = ev.target.value;
            check(e);
          }
        });
      }
      setTimeout(() => window.Audio2.speakSentence(e.s), 220);
    }

    function revealBlock(e, r) {
      return `<div class="notice ok" style="margin-top:12px">
        <div class="en" style="font-size:15.5px">${esc(e.s)}</div>
        <div class="tiny" style="margin-top:6px;opacity:.85">${esc(e.st)}</div>
        <div class="tiny" style="margin-top:6px;opacity:.7">出自「${esc(e.w)}」· 第 ${e.p} 页</div>
      </div>`;
    }

    function check(e) {
      result = window.Quiz.diffWords(val, e.s);
      shown = true;
      trap(e, result);
      Store.bump('l');
      paint();
    }

    function trap(e, r) {
      // 把听写准确率当作这个词的一次回忆检验
      const rate = r.total ? r.correct / r.total : 0;
      const grade = rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : rate >= 0.4 ? 1 : 0;
      const next = window.SRS.schedule(Store.getRec(e.i), grade, Date.now(), window.CFG);
      Store.putRec(e.i, next);
      Store.bump('c');
    }

    function summary() {
      root.innerHTML = `
        <div class="card center" style="padding:36px 22px">
          <div style="font-size:32px;margin-bottom:8px">🎧</div>
          <h3>这一组听写结束了</h3>
          <div class="muted small" style="margin-top:6px">共 ${queue.length} 句</div>
          <div class="row" style="justify-content:center;gap:10px;margin-top:20px">
            <button class="btn btn-primary" data-act="again">再来一组</button>
            <button class="btn" data-act="back">回听力</button>
          </div>
        </div>`;
      App.on(root, {
        again: () => { i = 0; queue = shuffle(pool).slice(0, 20); val = ''; result = null; shown = false; paint(); },
        back: () => Router.go('/listen'),
      });
    }

    function bind(e) {
      App.on(root, {
        play: () => window.Audio2.speakSentence(e.s),
        slow: () => window.Audio2.speakSlow(e.s),
        check: () => {
          const inp = root.querySelector('#ans');
          val = inp ? inp.value : val;
          check(e);
        },
        reveal: () => { shown = true; paint(); },
        next: () => { i++; val = ''; result = null; shown = false; paint(); },
        back: () => Router.go('/listen'),
      });
    }

    paint();
  }

  // ---------- 听音选词 ----------

  function wordpick(root) {
    const pool = shuffle(Words.all().filter((e) => e.s)).slice(0, 15);
    let i = 0;
    let q = null;
    let picked = null;

    function paint() {
      if (i >= pool.length) {
        root.innerHTML = `<div class="card center" style="padding:36px 22px">
          <h3>这一组结束了</h3>
          <div class="row" style="justify-content:center;gap:10px;margin-top:18px">
            <button class="btn btn-primary" data-act="again">再来一组</button>
            <button class="btn" data-act="back">回听力</button>
          </div></div>`;
        App.on(root, { again: () => Router.go('/listen?mode=wordpick&t=' + Date.now(), true), back: () => Router.go('/listen') });
        return;
      }
      const e = pool[i];
      q = window.Quiz.build(e, 'listen');
      picked = null;
      root.innerHTML = `
        ${bar('听音选词', i, pool.length, '/listen?mode=wordpick')}
        <div class="card">
          <div class="tiny muted center" style="margin-bottom:14px">听发音，选出句子中出现的那个词</div>
          <div class="playbox">
            <button class="btn btn-primary" data-act="play">🔊 播放句子</button>
            <button class="btn btn-sm btn-ghost" data-act="slow">慢速重听</button>
          </div>
          <div id="opts" style="margin-top:16px">
            ${q.options.map((o) => `<button class="option" data-act="pick" data-k="${o.key}">
              <span class="k">${o.key}</span><span class="en">${esc(o.text)}</span></button>`).join('')}
          </div>
          <div id="fb"></div>
        </div>`;
      App.on(root, {
        back: () => Router.go('/listen'),
        play: () => window.Audio2.speakSentence(e.s),
        slow: () => window.Audio2.speakSlow(e.s),
        pick: (t) => {
          if (picked) return;
          picked = t.dataset.k;
          const opt = q.options.find((o) => o.key === picked);
          const ok = opt && opt.right;
          root.querySelectorAll('.option').forEach((el) => {
            const k = el.dataset.k;
            const right = q.options.find((o) => o.key === k).right;
            el.classList.toggle('right', right);
            el.classList.toggle('wrong', k === picked && !right);
          });
          const next = window.SRS.schedule(Store.getRec(e.i), ok ? 2 : 0, Date.now(), window.CFG);
          Store.putRec(e.i, next);
          Store.bump('l');
          Store.bump('c');
          root.querySelector('#fb').innerHTML = `
            <div class="notice ${ok ? 'ok' : 'bad'}" style="margin-top:14px">
              <div class="en">${esc(e.s)}</div>
              <div class="tiny" style="margin-top:6px;opacity:.85">${esc(e.st)}</div>
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="next">${i + 1 >= pool.length ? '完成' : '下一个'}</button>`;
          App.on(root.querySelector('#fb'), { next: () => { i++; paint(); } });
        },
      });
      setTimeout(() => window.Audio2.speakSentence(e.s), 260);
    }

    paint();
  }

  // ---------- 信号词 ----------

  function signal(root) {
    const groups = (App.content.listen || {}).signals || [];
    if (!groups.length) return root.innerHTML = '<div class="card"><div class="empty">没有信号词数据</div></div>';

    // 把所有信号词摊平，用来做干扰项
    const allWords = [];
    groups.forEach((g) => g.items.forEach((it) => allWords.push(it)));

    let gi = 0;
    let qi = 0;
    let order = [];
    let picked = null;

    function startGroup(n) {
      gi = n;
      qi = 0;
      order = shuffle(groups[gi].items);
      paintQ();
    }

    function paintGroupList() {
      root.innerHTML = `
        <div class="row between" style="margin-bottom:14px">
          <button class="btn btn-sm btn-ghost" data-act="back">← 听力</button>
        </div>
        <div class="card flush">
          <div style="padding:16px 18px 10px">
            <div class="card-t">信号词专项</div>
            <div class="card-sub" style="margin:4px 0 0">听到这些词，答案就在附近</div>
          </div>
          ${groups.map((g, n) => `<div class="list-item" data-act="grp" data-n="${n}">
            <div class="grow"><div class="li-t">${esc(g.group)}</div>
            <div class="li-s">${esc(g.tip)}</div></div>
            <span class="tag">${g.items.length}</span><span class="arrow">›</span>
          </div>`).join('')}
        </div>`;
      App.on(root, {
        grp: (t) => startGroup(Number(t.dataset.n)),
        back: () => Router.go('/listen'),
      });
    }

    function paintQ() {
      const g = groups[gi];
      if (qi >= order.length) {
        root.innerHTML = `
          <div class="card center" style="padding:36px 22px">
            <h3>「${esc(g.group)}」练完了</h3>
            <div class="muted small" style="margin-top:6px">${esc(g.tip)}</div>
            <div class="row" style="justify-content:center;gap:10px;margin-top:18px">
              <button class="btn btn-primary" data-act="next">下一组</button>
              <button class="btn" data-act="list">全部组</button>
            </div>
          </div>`;
        App.on(root, {
          next: () => (gi + 1 < groups.length ? startGroup(gi + 1) : paintGroupList()),
          list: paintGroupList,
        });
        return;
      }
      const item = order[qi];
      const wrongs = shuffle(allWords.filter((x) => x.en !== item.en)).slice(0, 3);
      const opts = shuffle([item].concat(wrongs));
      picked = null;

      root.innerHTML = `
        ${bar(g.group, qi, order.length, '/listen?mode=signal')}
        <div class="card">
          <div class="tiny muted" style="margin-bottom:6px">下面哪个表达是「${esc(item.cn)}」</div>
          ${opts.map((o) => `<button class="option" data-act="pick" data-en="${esc(o.en)}">
            <span class="en">${esc(o.en)}</span></button>`).join('')}
          <div id="fb"></div>
        </div>`;
      App.on(root, {
        back: () => Router.go('/listen'),
        pick: (t) => {
          if (picked) return;
          picked = t.dataset.en;
          const ok = picked === item.en;
          root.querySelectorAll('.option').forEach((el) => {
            el.classList.toggle('right', el.dataset.en === item.en);
            el.classList.toggle('wrong', el.dataset.en === picked && !ok);
          });
          if (ok) Store.bump('l');
          Store.bump('c');
          root.querySelector('#fb').innerHTML =
            `<button class="btn btn-primary btn-block" style="margin-top:12px" data-act="next">下一个</button>`;
          App.on(root.querySelector('#fb'), { next: () => { qi++; paintQ(); } });
        },
      });
    }

    paintGroupList();
  }

  // ---------- 短对话 ----------

  function dialogue(root) {
    const list = (App.content.listen || {}).dialogues || [];
    if (!list.length) return root.innerHTML = '<div class="card"><div class="empty">没有对话数据</div></div>';

    let di = 0;
    let showScript = false;
    let showCn = false;
    let answers = {};
    let submitted = false;

    function paintList() {
      showScript = false;
      submitted = false;
      answers = {};
      const d = list[di];
      const qs = d.questions;

      root.innerHTML = `
        <div class="row between" style="margin-bottom:14px">
          <button class="btn btn-sm btn-ghost" data-act="back">← 听力</button>
          <div class="row" style="gap:6px">
            <button class="btn btn-sm" data-act="prev" ${di <= 0 ? 'disabled' : ''}>上一篇</button>
            <button class="btn btn-sm" data-act="next" ${di >= list.length - 1 ? 'disabled' : ''}>下一篇</button>
          </div>
        </div>
        <div class="card">
          <div class="card-hd" style="margin-bottom:10px">
            <div class="card-t">${esc(d.title)}</div>
            <div class="row" style="gap:6px">
              <button class="btn btn-sm" data-act="playall">🔊 整段</button>
              <button class="btn btn-sm" data-act="script">${showScript ? '收起原文' : '看原文'}</button>
            </div>
          </div>
          ${showScript ? `
            <div class="divider" style="margin-top:0"></div>
            <div class="row between" style="margin-bottom:8px">
              <span class="tiny muted">原文（点句子可单句重听）</span>
              <button class="btn btn-sm btn-ghost" data-act="cn">${showCn ? '隐藏中文' : '显示中文'}</button>
            </div>
            ${d.script.map((s, k) => `<div class="line" data-act="line" data-k="${k}">
              <span class="who">${esc(s.sp)}</span>
              <span class="en">${esc(s.en)}</span>
              ${showCn ? `<div class="tiny muted" style="margin-left:34px">${esc(s.cn)}</div>` : ''}
            </div>`).join('')}` : `
            <div class="playbox" style="margin-top:6px">
              <div class="tiny muted">先听一遍，再做下面的题</div>
              <div class="row" style="gap:8px;margin-top:10px">
                <button class="btn btn-primary" data-act="playall">开始播放</button>
                <button class="btn" data-act="script">没听清，看原文</button>
              </div>
            </div>`}

          <div class="divider"></div>
          <div class="tiny muted" style="margin-bottom:10px">${qs.length} 道题</div>
          ${qs.map((q, n) => `<div style="margin-bottom:18px">
            <div class="small" style="margin-bottom:8px">${n + 1}. ${esc(q.q)}</div>
            ${q.options.map((o, m) => {
              const cls = submitted
                ? m === q.answer ? 'option right' : answers[n] === m ? 'option wrong' : 'option'
                : answers[n] === m ? 'option on' : 'option';
              return `<button class="${cls}" data-act="ans" data-n="${n}" data-m="${m}" ${submitted ? 'disabled' : ''}>
                <span class="k">${'ABCD'[m]}</span><span>${esc(o)}</span></button>`;
            }).join('')}
            ${submitted ? `<div class="notice ${answers[n] === q.answer ? 'ok' : 'bad'}" style="margin-top:2px">
              <b>${answers[n] === q.answer ? '对' : '错'}</b>　${esc(q.explain || '')}</div>` : ''}
          </div>`).join('')}
          ${submitted ? '' : `<button class="btn btn-primary btn-block" data-act="submit">提交</button>`}
        </div>`;

      App.on(root, {
        back: () => Router.go('/listen'),
        prev: () => { if (di > 0) { di--; paintList(); } },
        next: () => { if (di < list.length - 1) { di++; paintList(); } },
        playall: () => window.Audio2.speak(d.script.map((s) => s.en).join(' ')),
        script: () => { showScript = !showScript; paintList(); },
        cn: () => { showCn = !showCn; paintList(); },
        line: (t) => window.Audio2.speak(d.script[Number(t.dataset.k)].en),
        ans: (t) => {
          if (submitted) return;
          answers[Number(t.dataset.n)] = Number(t.dataset.m);
          paintList();
        },
        submit: () => {
          submitted = true;
          let right = 0;
          qs.forEach((q, n) => {
            if (answers[n] === q.answer) right++;
          });
          Store.bump('l', qs.length);
          Store.bump('c', right);
          toast(`答对 ${right} / ${qs.length}`);
          paintList();
        },
      });
    }

    paintList();
  }

  // ---------- 公共 ----------

  function bar(title, i, total, back) {
    const pct = total ? Math.round((i / total) * 100) : 0;
    return `<div class="row between" style="margin-bottom:12px">
      <div class="row" style="gap:10px">
        <button class="btn btn-sm btn-ghost" data-act="back">← ${esc(title)}</button>
        <span class="tiny muted">${i + 1} / ${total}</span>
      </div>
      <button class="btn btn-sm btn-ghost" data-act="back">退出</button>
    </div>
    <div class="progress-line thin" style="margin-bottom:16px"><i style="width:${pct}%"></i></div>`;
  }

  function render(root, args, query) {
    const mode = query.mode || '';
    if (mode === 'dictation') return dictation(root);
    if (mode === 'wordpick') return wordpick(root);
    if (mode === 'signal') return signal(root);
    if (mode === 'dialogue') return dialogue(root);
    return home(root);
  }

  App.Router.add('/listen', render);
})();
