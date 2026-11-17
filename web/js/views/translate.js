// 翻译：逐句汉译英，写完对照参考译文与考点
(function () {
  const { esc, Router, toast } = window.App;

  const T = () => App.content.translate || {};

  function render(root, args, query) {
    let view = query.view || 'list'; // list | do | phrase
    let pid = App.idxOf(query.p, 999);
    let si = 0;
    let input = '';
    let shown = false;
    let kw = '';

    // ---------- 主题列表 ----------

    function paintList() {
      const list = T().passages || [];
      const drill = Store.getDay() || {};
      root.innerHTML = `
        <div class="card">
          <div class="card-hd">
            <div>
              <div class="card-t">翻译</div>
              <div class="card-sub" style="margin:0">六级翻译考的是"把中文的说法换成英文的说法"，不是逐字对译</div>
            </div>
            <span class="tiny muted">今天已翻 ${drill.tr || 0} 句</span>
          </div>
          <div class="flush">
            ${list.map((p, n) => {
              const d = Store.getDraft('tr-' + p.id) || {};
              const done = d.done || 0;
              return `<div class="list-item" data-act="open" data-n="${n}">
                <div class="grow">
                  <div class="li-t">${esc(p.title)}</div>
                  <div class="li-s">${esc(p.intro || '')}</div>
                </div>
                <span class="tag ${done >= p.sentences.length ? 'tag-ok' : ''}">${done}/${p.sentences.length}</span>
                <span class="arrow">›</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-hd">
            <div class="card-t">高频表达</div>
            <span class="tiny muted">${(T().phrases || []).length} 条</span>
          </div>
          <div class="card-sub">这些是翻译题里的固定说法，背下来直接用</div>
          <button class="btn btn-block" data-act="phrases">打开表达库</button>
        </div>`;
      App.on(root, {
        open: (t) => Router.go('/translate?view=do&p=' + t.dataset.n),
        phrases: () => Router.go('/translate?view=phrase'),
      });
    }

    // ---------- 逐句翻译 ----------

    function paintDo() {
      const passages = T().passages || [];
      if (!passages.length) return toast('没有翻译数据');
      if (pid >= passages.length) pid = 0;
      const p = passages[pid];
      const saved = Store.getDraft('tr-' + p.id) || {};
      if (!query.p && saved.i != null) si = saved.i;
      if (si >= p.sentences.length) si = p.sentences.length - 1;
      const cur = p.sentences[si];
      const done = saved.done || 0;

      root.innerHTML = `
        <div class="row between" style="margin-bottom:12px">
          <button class="btn btn-sm btn-ghost" data-act="back">← 翻译</button>
          <span class="tiny muted">第 ${si + 1} / ${p.sentences.length} 句 · 已完成 ${done} 句</span>
        </div>
        <div class="progress-line thin" style="margin-bottom:16px">
          <i style="width:${Math.round((done / p.sentences.length) * 100)}%"></i>
        </div>

        <div class="card">
          <div class="card-t">${esc(p.title)}</div>
          <div class="card-sub">${esc(p.intro || '')}</div>
          <div class="cn-box">${esc(cur.cn)}</div>
          <textarea class="textarea en" id="tr" placeholder="用英文译出来。不确定的表达就先绕过去，先把句子说完整。">${esc(input)}</textarea>
          <div class="row" style="margin-top:12px;gap:8px">
            <button class="btn btn-primary grow" data-act="show">对照参考译文</button>
            <button class="btn" data-act="tip">看提示</button>
          </div>
        </div>

        ${shown ? `
        <div class="card">
          <div class="row between" style="margin-bottom:10px">
            <div class="card-t" style="font-size:15px">参考译文</div>
            <button class="btn btn-sm" data-act="say">🔊</button>
          </div>
          <div class="en notice ok" style="font-size:15px;line-height:1.8">${esc(cur.ref)}</div>
          <div class="divider"></div>
          <div class="tiny muted" style="margin-bottom:8px">关键短语（得分点）</div>
          ${(cur.keys || []).map((k) => `<div class="row between" style="margin-bottom:6px">
            <span class="small">${esc(k.cn)}</span>
            <span class="mono small hl">${esc(k.en)}</span>
          </div>`).join('')}
          ${cur.tip ? `<div class="notice" style="margin-top:12px">${esc(cur.tip)}</div>` : ''}
          <div class="row" style="gap:8px;margin-top:16px">
            <button class="btn grow" data-act="prev" ${si <= 0 ? 'disabled' : ''}>上一句</button>
            <button class="btn btn-primary grow" data-act="next">${si + 1 >= p.sentences.length ? '本篇完成' : '下一句'}</button>
          </div>
        </div>` : ''}
      `;

      const ta = root.querySelector('#tr');
      if (ta) {
        ta.focus();
        ta.addEventListener('input', (ev) => { input = ev.target.value; });
      }

      App.on(root, {
        back: () => Router.go('/translate'),
        show: () => {
          input = ta ? ta.value : input;
          shown = true;
          const prev = Store.getDraft('tr-' + p.id) || {};
          const isNew = !prev['s' + si];
          const mark = Object.assign({}, prev);
          if (isNew) {
            mark['s' + si] = 1;
            mark.done = Math.min(p.sentences.length, (prev.done || 0) + 1);
            Store.bump('tr');
          }
          mark.i = si;
          Store.setDraft('tr-' + p.id, mark);
          paintDo();
        },
        tip: () => {
          if (cur.keys && cur.keys.length) {
            toast(`提示：${cur.keys.map((k) => k.cn).join(' / ')}`);
          } else toast('没有额外提示，按自己的理解写');
        },
        say: () => window.Audio2.speakSentence(cur.ref),
        prev: () => { si--; shown = false; input = ''; paintDo(); },
        next: () => {
          if (si + 1 >= p.sentences.length) {
            toast('这篇翻完了，换一篇试试');
            Router.go('/translate');
            return;
          }
          si++;
          shown = false;
          input = '';
          const d = Store.getDraft('tr-' + p.id) || {};
          Store.setDraft('tr-' + p.id, Object.assign({}, d, { i: si }));
          paintDo();
        },
      });
    }

    // ---------- 高频表达 ----------

    function paintPhrases() {
      const all = T().phrases || [];
      const list = kw
        ? all.filter((x) => x.cn.indexOf(kw) >= 0 || x.en.toLowerCase().indexOf(kw.toLowerCase()) >= 0)
        : all;
      root.innerHTML = `
        <div class="row between" style="margin-bottom:12px">
          <button class="btn btn-sm btn-ghost" data-act="back">← 翻译</button>
          <span class="tiny muted">${list.length} 条</span>
        </div>
        <div class="card">
          <input class="input" id="q" placeholder="搜中文或英文" value="${esc(kw)}">
        </div>
        <div class="card flush">
          ${list.map((p) => `<div class="list-item" data-act="copy" data-en="${esc(p.en)}">
            <div class="grow">
              <div class="mono small">${esc(p.en)}</div>
              <div class="li-s">${esc(p.cn)}</div>
            </div>
            <span class="tiny muted">复制</span>
          </div>`).join('') || '<div class="empty">没找到</div>'}
        </div>`;
      const q = root.querySelector('#q');
      if (q) {
        q.focus();
        q.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            kw = ev.target.value.trim();
            paintPhrases();
          }
        });
      }
      App.on(root, {
        back: () => Router.go('/translate'),
        copy: (t) => {
          const en = t.dataset.en;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(en).then(() => toast('已复制')).catch(() => toast(en));
          } else toast(en);
        },
      });
    }

    if (view === 'do') paintDo();
    else if (view === 'phrase') paintPhrases();
    else paintList();
  }

  App.Router.add('/translate', render);
})();
