// 单词详情：完整释义、例句、掌握记录、发音
(function () {
  const { esc, Router, toast } = window.App;

  function srsText(rec) {
    if (!rec || !rec.s) return { label: '还没学过', cls: 'tag-c', detail: '' };
    const due = new Date(rec.due);
    const now = Date.now();
    const diff = Math.round((rec.due - now) / 86400000);
    const when = diff <= 0 ? '现在就该复习' : diff === 1 ? '明天复习' : `${diff} 天后复习`;
    if (rec.mastered) {
      return { label: '已掌握', cls: 'tag-ok', detail: `间隔 ${Math.round(rec.iv)} 天 · ${when}` };
    }
    if (rec.s >= 2) {
      return { label: '复习中', cls: 'tag-a', detail: `间隔 ${Math.round(rec.iv)} 天 · ${when}` };
    }
    return {
      label: '学习中',
      cls: 'tag-b',
      detail: rec.iv < 1 ? '今天还要再看一遍' : `阶段 ${rec.step || 0} · ${when}`,
    };
  }

  function render(root, args) {
    const idx = Number(args[0]);
    const e = Words.get(idx);
    if (!e) {
      root.innerHTML = '<div class="card"><div class="empty">没有这个词</div></div>';
      return;
    }
    const rec = Store.getRec(idx);
    const st = srsText(rec);
    const fav = Store.isFav(idx);
    const sc = Store.getScreen()[idx];
    const segs = window.Quiz.segs(e.s, e.w, 'hl');

    root.innerHTML = `
      <div class="row between" style="margin-bottom:14px">
        <button class="btn btn-sm btn-ghost" data-act="back">← 返回</button>
        <div class="row" style="gap:6px">
          <button class="btn btn-sm" data-act="prev" ${idx <= 0 ? 'disabled' : ''}>上一个</button>
          <button class="btn btn-sm" data-act="next" ${idx >= Words.size() - 1 ? 'disabled' : ''}>下一个</button>
        </div>
      </div>

      <div class="card">
        <div class="row between" style="align-items:flex-start">
          <div class="grow">
            <div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap">
              <span class="big">${esc(e.w)}</span>
              <span class="tag ${e.l6 ? 'tag-a' : e.f >= 50 ? 'tag-b' : 'tag-c'}">
                ${e.l6 ? '六级核心' : e.f >= 50 ? '高频' : '一般'}
              </span>
            </div>
            <div class="small muted" style="margin-top:6px">
              ${e.uk ? `英 /${esc(e.uk)}/` : ''} ${e.us && e.us !== e.uk ? `美 /${esc(e.us)}/` : ''}
              ${e.pos ? `<span class="tag" style="margin-left:8px">${esc(e.pos)}</span>` : ''}
              <span class="tag" style="margin-left:4px">第 ${e.p} 页 · 第 ${e.n} 个</span>
            </div>
          </div>
          <div class="row" style="gap:6px">
            <button class="btn btn-sm" data-act="sayw">🔊 单词</button>
            <button class="btn btn-sm" data-act="says">句子</button>
          </div>
        </div>

        <div class="divider"></div>
        <div style="font-size:15.5px;line-height:1.8">${esc(e.m)}</div>

        ${e.s ? `
        <div class="divider"></div>
        <div class="tiny muted" style="margin-bottom:8px">例句</div>
        <div class="sentence">${segs.map((s) => s.hl ? `<span class="hl">${esc(s.t)}</span>` : esc(s.t)).join('')}</div>
        <div class="muted small" style="margin-top:8px">${esc(e.st)}</div>` : ''}

        ${e.phr ? `
        <div class="divider"></div>
        <div class="tiny muted" style="margin-bottom:8px">常用搭配</div>
        ${e.phr.split('；').map((p) => {
          const [en, cn] = p.split('|');
          return `<div class="row" style="gap:8px;margin-bottom:4px">
            <span class="mono small">${esc(en)}</span>
            <span class="tiny muted">${esc(cn || '')}</span>
          </div>`;
        }).join('')}` : ''}
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-t">掌握记录</div>
          <span class="tag ${st.cls}">${st.label}</span>
        </div>
        <div class="grid3">
          <div class="stat"><div class="v">${rec ? rec.reps || 0 : 0}</div><div class="l">复习次数</div></div>
          <div class="stat"><div class="v">${rec ? rec.lapses || 0 : 0}</div><div class="l">遗忘次数</div></div>
          <div class="stat"><div class="v">${rec && rec.iv ? Math.round(rec.iv) : 0}</div><div class="l">当前间隔(天)</div></div>
        </div>
        ${st.detail ? `<div class="tiny muted" style="margin-top:10px;text-align:center">${st.detail}</div>` : ''}
        <div class="divider"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn ${fav ? 'btn-primary' : ''}" data-act="fav">${fav ? '★ 已收藏' : '☆ 收藏'}</button>
          <button class="btn" data-act="known">${sc ? '取消「认识」标记' : '这个词我认识'}</button>
          <button class="btn btn-ghost" data-act="back">返回</button>
        </div>
        ${sc ? '<div class="tiny muted" style="margin-top:8px">已标记认识，不会出现在新词队列里</div>' : ''}
      </div>
    `;

    App.on(root, {
      back: () => history.length > 1 ? history.back() : Router.go('/list'),
      prev: () => Router.go('/word/' + (idx - 1)),
      next: () => Router.go('/word/' + (idx + 1)),
      sayw: () => window.Audio2.speakWord(e.w),
      says: () => window.Audio2.speakSentence(e.s || e.w),
      fav: () => {
        const now = Store.toggleFav(idx);
        toast(now ? '已收藏' : '已取消收藏');
        render(root, args);
      },
      known: () => {
        Store.markScreen(idx, !sc);
        toast(sc ? '已取消标记' : '已标为认识');
        render(root, args);
      },
    });
  }

  App.Router.add('/word', render);
})();
