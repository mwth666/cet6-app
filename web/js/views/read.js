// 阅读：选词填空、仔细阅读、长篇匹配、同义替换、长难句
(function () {
  const { esc, Router, toast, shuffle } = window.App;

  const R = () => App.content.read || {};

  // ---------- 入口 ----------

  function home(root) {
    const r = R();
    const day = Store.getDay() || {};
    const items = [
      ['cloze', '选词填空', '按词性和上下文推断，不是靠背', `${(r.cloze || []).length} 篇`],
      ['careful', '仔细阅读', '六级阅读的主体，先定位再比对', `${(r.careful || []).length} 篇`],
      ['match', '长篇匹配', '先看题干抓关键词，再扫段落', `${(r.match || []).length} 篇`],
      ['syn', '同义替换', '阅读和听力的核心考点：换一种说法', `${(r.synonyms || []).length} 组`],
      ['long', '长难句拆解', '把一句话拆成主干和修饰，长句就不难了', `${(r.longSentences || []).length} 句`],
    ];

    root.innerHTML = `
      <div class="card">
        <div class="card-hd">
          <div>
            <div class="card-t">阅读</div>
            <div class="card-sub" style="margin:0">六级阅读难在速度：先看题再读文，定位比通读划算</div>
          </div>
          <span class="tiny muted">今天已练 ${day.rd || 0} 题</span>
        </div>
        <div class="grid2">
          ${items
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
        <div class="card-t" style="font-size:15px;margin-bottom:8px">做阅读的顺序</div>
        <ol class="small" style="margin:0;padding-left:20px;line-height:1.9">
          <li>先扫题干，划出人名、数字、专有名词——这些词在原文里最好找</li>
          <li>回原文定位到具体句子，<b>只读那一两句</b>，不要通读全文</li>
          <li>把选项和定位句逐词比对，注意偷换主语、放大范围、颠倒因果</li>
          <li>做完立刻看解析，重点看自己"为什么被这个错项骗了"</li>
        </ol>
      </div>`;
    App.on(root, { go: (t) => Router.go('/read?mode=' + t.dataset.m) });
  }

  // ---------- 选词填空 ----------

  function cloze(root, query) {
    const list = R().cloze || [];
    let pi = App.idxOf(query.p, 999);
    if (pi >= list.length) pi = 0;
    const p = list[pi];
    let answers = {};
    let checked = false;

    function paint() {
      const parts = p.text.split(/(\{\{\d+\}\})/);
      const body = parts
        .map((part) => {
          const m = part.match(/\{\{(\d+)\}\}/);
          if (!m) return esc(part);
          const n = Number(m[1]) - 1;
          const v = answers[n];
          const blank = p.blanks[n];
          let cls = 'chip';
          if (v) cls += ' filled';
          if (checked) cls += v === blank.a ? ' ok' : ' bad';
          return `<span class="${cls}" data-act="slot" data-n="${n}">${v ? esc(v) : n + 1}</span>`;
        })
        .join('');

      const done = Object.keys(answers).length;
      const rightN = checked
        ? p.blanks.filter((b, n) => answers[n] === b.a).length
        : 0;

      root.innerHTML = `
        ${head('选词填空', pi, list.length, '/read')}
        <div class="card">
          <div class="card-hd">
            <div class="card-t">${esc(p.title)}</div>
            <span class="tiny muted">${done} / ${p.blanks.length} 已填</span>
          </div>
          <div class="article">${body}</div>
          <div class="divider"></div>
          <div class="tiny muted" style="margin-bottom:10px">点文中的数字选择答案；填完再提交</div>
          <div class="slots">
            ${p.blanks.map((b, n) => `
              <div class="slot-row">
                <span class="slot-no">${n + 1}</span>
                <span class="slot-hint">${esc(b.hint || '')}</span>
                <span class="grow"></span>
                <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
                  ${b.o.map((o) => {
                    let cls = 'btn btn-sm';
                    if (answers[n] === o) cls += ' btn-primary';
                    if (checked && o === b.a) cls = 'btn btn-sm btn-ok';
                    return `<button class="${cls}" data-act="fill" data-n="${n}" data-o="${esc(o)}" ${checked ? 'disabled' : ''}>${esc(o)}</button>`;
                  }).join('')}
                </div>
              </div>`).join('')}
          </div>
          ${checked ? `<div class="notice ${rightN === p.blanks.length ? 'ok' : ''}" style="margin-top:16px">
            答对 ${rightN} / ${p.blanks.length} 空${rightN === p.blanks.length ? '，全对' : ''}
          </div>` : ''}
          <div class="row" style="margin-top:16px;gap:8px">
            ${!checked
              ? `<button class="btn btn-primary grow" data-act="submit">提交</button>`
              : `<button class="btn btn-primary grow" data-act="nextp">下一篇</button>`}
            ${checked ? `<button class="btn" data-act="retry">重做</button>` : ''}
          </div>
        </div>`;
      bind();
    }

    function bind() {
      App.on(root, {
        back: () => Router.go('/read'),
        slot: (t) => {
          const n = Number(t.dataset.n);
          const b = p.blanks[n];
          const at = root.querySelector(`.slot-row:nth-child(${n + 1})`);
          if (at) at.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (!checked && b.o.length) toast(`第 ${n + 1} 空：${b.hint || ''}`);
        },
        fill: (t) => {
          if (checked) return;
          answers[Number(t.dataset.n)] = t.dataset.o;
          paint();
        },
        submit: () => {
          if (Object.keys(answers).length < p.blanks.length) {
            toast('还有空没填');
            return;
          }
          checked = true;
          const rightN = p.blanks.filter((b, n) => answers[n] === b.a).length;
          Store.bump('rd', p.blanks.length);
          Store.bump('c', rightN);
          Store.flush();
          paint();
        },
        retry: () => { answers = {}; checked = false; paint(); },
        nextp: () => Router.go('/read?mode=cloze&p=' + ((pi + 1) % list.length), true),
      });
    }

    paint();
  }

  // ---------- 仔细阅读 ----------

  function careful(root, query) {
    const list = R().careful || [];
    let pi = App.idxOf(query.p, 999);
    if (pi >= list.length) pi = 0;
    const p = list[pi];
    let answers = {};
    let checked = false;

    function paint() {
      const qs = p.questions;
      const done = Object.keys(answers).length;
      const rightN = checked ? qs.filter((q, n) => answers[n] === q.answer).length : 0;

      root.innerHTML = `
        ${head('仔细阅读', pi, list.length, '/read')}
        <div class="card">
          <div class="card-t">${esc(p.title)}</div>
          <div class="card-sub">${p.text.split(/\s+/).length} 词</div>
          <div class="article">${esc(p.text)}</div>
        </div>
        <div class="card">
          <div class="card-hd">
            <div class="card-t">题目</div>
            <span class="tiny muted">${done} / ${qs.length}</span>
          </div>
          ${qs.map((q, n) => `
            <div style="margin-bottom:20px">
              <div class="small" style="margin-bottom:8px"><b>${n + 1}.</b> ${esc(q.q)}</div>
              ${q.options.map((o, m) => {
                let cls = 'option';
                if (checked) {
                  if (m === q.answer) cls += ' right';
                  else if (answers[n] === m) cls += ' wrong';
                } else if (answers[n] === m) cls += ' on';
                return `<button class="${cls}" data-act="ans" data-n="${n}" data-m="${m}" ${checked ? 'disabled' : ''}>
                  <span class="k">${'ABCD'[m]}</span><span>${esc(o)}</span></button>`;
              }).join('')}
              ${checked ? `<div class="notice ${answers[n] === q.answer ? 'ok' : 'bad'}">
                <b>${answers[n] === q.answer ? '对' : '错'}</b>　${esc(q.explain || '')}</div>` : ''}
            </div>`).join('')}
          <div class="row" style="gap:8px">
            ${!checked
              ? `<button class="btn btn-primary grow" data-act="submit">提交</button>`
              : `<button class="btn btn-primary grow" data-act="nextp">下一篇</button>
                 <button class="btn" data-act="retry">重做</button>`}
          </div>
          ${checked ? `<div class="center" style="margin-top:12px">
            <span class="tag ${rightN === qs.length ? 'tag-ok' : 'tag-b'}" style="font-size:13px">
              答对 ${rightN} / ${qs.length}
            </span></div>` : ''}
        </div>`;
      bind();
    }

    function bind() {
      App.on(root, {
        back: () => Router.go('/read'),
        ans: (t) => {
          if (checked) return;
          answers[Number(t.dataset.n)] = Number(t.dataset.m);
          paint();
        },
        submit: () => {
          if (Object.keys(answers).length < p.questions.length) {
            toast('还有题没选');
            return;
          }
          checked = true;
          const rightN = p.questions.filter((q, n) => answers[n] === q.answer).length;
          Store.bump('rd', p.questions.length);
          Store.bump('c', rightN);
          Store.flush();
          paint();
        },
        retry: () => { answers = {}; checked = false; paint(); },
        nextp: () => Router.go('/read?mode=careful&p=' + ((pi + 1) % list.length), true),
      });
    }

    paint();
  }

  // ---------- 长篇匹配 ----------

  function match(root) {
    const p = (R().match || [])[0];
    if (!p) return (root.innerHTML = '<div class="card"><div class="empty">没有匹配题数据</div></div>');
    let answers = {};
    let checked = false;

    function paint() {
      const done = Object.keys(answers).length;
      const rightN = checked ? p.statements.filter((s, n) => answers[n] === s.para).length : 0;

      root.innerHTML = `
        ${head('长篇匹配', 0, 1, '/read')}
        <div class="card">
          <div class="card-t">${esc(p.title)}</div>
          <div class="card-sub">先看下面 8 个句子，划关键词，再回段落里找</div>
          <div class="paras">
            ${p.paras.map((para) => `<div class="para">
              <div class="para-l">${esc(para.label)}</div>
              <div class="para-t">${esc(para.text)}</div>
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-hd">
            <div class="card-t">把句子和段落对上</div>
            <span class="tiny muted">${done} / ${p.statements.length}</span>
          </div>
          ${p.statements.map((s, n) => `
            <div class="stmt">
              <div class="stmt-t"><b>${n + 1}.</b> ${esc(s.s)}</div>
              <div class="row wrap" style="gap:6px;margin-top:8px">
                ${p.paras.map((para) => {
                  let cls = 'btn btn-sm';
                  if (answers[n] === para.label) cls += ' btn-primary';
                  if (checked && para.label === s.para) cls = 'btn btn-sm btn-ok';
                  else if (checked && answers[n] === para.label) cls = 'btn btn-sm btn-bad';
                  return `<button class="${cls}" data-act="pick" data-n="${n}" data-l="${para.label}" ${checked ? 'disabled' : ''}>${para.label}</button>`;
                }).join('')}
              </div>
            </div>`).join('')}
          <div class="row" style="gap:8px;margin-top:6px">
            ${!checked
              ? `<button class="btn btn-primary grow" data-act="submit">提交</button>`
              : `<button class="btn btn-primary grow" data-act="retry">重做</button>`}
          </div>
          ${checked ? `<div class="notice ${rightN === p.statements.length ? 'ok' : ''}" style="margin-top:14px">
            答对 ${rightN} / ${p.statements.length}
          </div>` : ''}
        </div>`;
      App.on(root, {
        back: () => Router.go('/read'),
        pick: (t) => {
          if (checked) return;
          answers[Number(t.dataset.n)] = t.dataset.l;
          paint();
        },
        submit: () => {
          if (Object.keys(answers).length < p.statements.length) {
            toast('还有句子没配段落');
            return;
          }
          checked = true;
          const rightN = p.statements.filter((s, n) => answers[n] === s.para).length;
          Store.bump('rd', p.statements.length);
          Store.bump('c', rightN);
          Store.flush();
          paint();
        },
        retry: () => { answers = {}; checked = false; paint(); },
      });
    }

    paint();
  }

  // ---------- 同义替换 ----------

  function syn(root) {
    const all = R().synonyms || [];
    if (!all.length) return (root.innerHTML = '<div class="card"><div class="empty">没有同义替换数据</div></div>');
    let queue = shuffle(all).slice(0, 20);
    let i = 0;
    let picked = null;
    let stat = { right: 0, wrong: 0 };

    function paint() {
      if (i >= queue.length) {
        root.innerHTML = `
          <div class="card center" style="padding:36px 22px">
            <div style="font-size:30px;margin-bottom:8px">🔁</div>
            <h3>这一组结束了</h3>
            <div class="muted small" style="margin-top:6px">答对 ${stat.right} · 答错 ${stat.wrong}</div>
            <div class="row" style="justify-content:center;gap:10px;margin-top:18px">
              <button class="btn btn-primary" data-act="again">再来一组</button>
              <button class="btn" data-act="back">回阅读</button>
            </div>
          </div>`;
        App.on(root, {
          again: () => { queue = shuffle(all).slice(0, 20); i = 0; stat = { right: 0, wrong: 0 }; paint(); },
          back: () => Router.go('/read'),
        });
        return;
      }
      const cur = queue[i];
      const others = shuffle(all.filter((x) => x.b !== cur.b)).slice(0, 3);
      const opts = shuffle([cur].concat(others));
      picked = null;

      root.innerHTML = `
        <div class="row between" style="margin-bottom:12px">
          <button class="btn btn-sm btn-ghost" data-act="back">← 阅读</button>
          <span class="tiny muted">${i + 1} / ${queue.length} · 对 ${stat.right} 错 ${stat.wrong}</span>
        </div>
        <div class="progress-line thin" style="margin-bottom:16px"><i style="width:${Math.round((i / queue.length) * 100)}%"></i></div>
        <div class="card">
          <div class="tiny muted" style="margin-bottom:8px">哪个词最接近 <b class="hl">${esc(cur.a)}</b></div>
          <div class="small muted" style="margin-bottom:16px">六级阅读的正确答案几乎都是原文的"换一种说法"</div>
          ${opts.map((o) => `<button class="option" data-act="pick" data-b="${esc(o.b)}">
            <span class="en" style="font-size:16px">${esc(o.b)}</span></button>`).join('')}
          <div id="fb"></div>
        </div>`;
      App.on(root, {
        back: () => Router.go('/read'),
        pick: (t) => {
          if (picked) return;
          picked = t.dataset.b;
          const ok = picked === cur.b;
          root.querySelectorAll('.option').forEach((el) => {
            el.classList.toggle('right', el.dataset.b === cur.b);
            el.classList.toggle('wrong', el.dataset.b === picked && !ok);
          });
          if (ok) { stat.right++; Store.bump('c'); } else stat.wrong++;
          Store.bump('rd');
          root.querySelector('#fb').innerHTML = `
            <div class="notice ${ok ? 'ok' : 'bad'}">
              ${esc(cur.a)} ≈ ${esc(cur.b)}　<span class="tiny">${esc(cur.cn)}</span>
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="next">下一个</button>`;
          App.on(root.querySelector('#fb'), { next: () => { i++; paint(); } });
        },
      });
    }

    paint();
  }

  // ---------- 长难句 ----------

  function long(root, query) {
    const list = R().longSentences || [];
    let i = App.idxOf(query.p, 999);
    if (i >= list.length) i = 0;
    const s = list[i];
    let show = false;

    function paint() {
      root.innerHTML = `
        ${head('长难句拆解', i, list.length, '/read')}
        <div class="card">
          <div class="tiny muted" style="margin-bottom:8px">原句</div>
          <div class="en" style="font-size:17px;line-height:1.8">${esc(s.en)}</div>
          <div class="row between" style="margin-top:14px;gap:8px">
            <button class="btn btn-primary" data-act="toggle">${show ? '收起拆解' : '拆开看结构'}</button>
            <button class="btn btn-sm" data-act="say">🔊 朗读</button>
          </div>
          ${show ? `
            <div class="divider"></div>
            <div class="tiny muted" style="margin-bottom:8px">主干</div>
            <div class="notice" style="font-family:Georgia,serif;font-size:15px">${esc(s.main)}</div>
            <div class="divider"></div>
            <div class="tiny muted" style="margin-bottom:10px">各成分</div>
            ${s.split.map((p) => `<div class="split-row">
              <span class="role">${esc(p.role)}</span>
              <span class="en">${esc(p.t)}</span>
            </div>`).join('')}
            <div class="divider"></div>
            <div class="tiny muted" style="margin-bottom:6px">译文</div>
            <div class="small">${esc(s.cn)}</div>` : ''}
          <div class="row" style="gap:8px;margin-top:16px">
            <button class="btn grow" data-act="prev" ${i <= 0 ? 'disabled' : ''}>上一句</button>
            <button class="btn grow" data-act="next" ${i >= list.length - 1 ? 'disabled' : ''}>下一句</button>
          </div>
        </div>`;
      App.on(root, {
        back: () => Router.go('/read'),
        toggle: () => { show = !show; paint(); },
        say: () => window.Audio2.speakSentence(s.en),
        prev: () => { i--; show = false; paint(); },
        next: () => { i++; show = false; paint(); },
      });
    }

    paint();
  }

  // ---------- 公共 ----------

  function head(title, i, total, back) {
    return `<div class="row between" style="margin-bottom:12px">
      <div class="row" style="gap:10px">
        <button class="btn btn-sm btn-ghost" data-act="back">← ${esc(title)}</button>
        <span class="tiny muted">${i + 1} / ${total}</span>
      </div>
    </div>`;
  }

  function render(root, args, query) {
    const mode = query.mode || '';
    if (mode === 'cloze') return cloze(root, query);
    if (mode === 'careful') return careful(root, query);
    if (mode === 'match') return match(root);
    if (mode === 'syn') return syn(root);
    if (mode === 'long') return long(root, query);
    return home(root);
  }

  App.Router.add('/read', render);
})();
