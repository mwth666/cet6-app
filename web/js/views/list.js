// 词库：按页、按主题、错词本、收藏、搜索
(function () {
  const { esc, Router, toast } = window.App;

  function row(e) {
    return `<div class="list-item" data-act="open" data-i="${e.i}">
      <div class="grow">
        <div class="li-t">${esc(e.w)} <span class="tiny muted">${esc(e.pos || '')}</span></div>
        <div class="li-s">${esc(e.meanShort)}</div>
      </div>
      ${e.l6 ? '<span class="tag tag-a">六级</span>' : ''}
      <span class="arrow">›</span>
    </div>`;
  }

  // 合法 tab 白名单：URL 里写了非法值时回落到「按页」，
  // 否则会静默落到最后一个分支（搜索），让人以为数据坏了
  const TABS = ['page', 'cat', 'wrong', 'fav', 'search'];

  function render(root, args, query) {
    let tab = TABS.indexOf(query.tab) >= 0 ? query.tab : 'page';
    let page = Math.max(1, App.idxOf(query.page, 99999));
    let cat = query.cat || '';
    let kw = query.q || '';

    function head() {
      const tabs = [
        ['page', '按页'],
        ['cat', '按主题'],
        ['wrong', '错词本'],
        ['fav', '收藏'],
        ['search', '搜索'],
      ];
      return `<div class="seg" style="margin-bottom:16px">
        ${tabs
          .map(
            ([k, label]) =>
              `<button data-act="tab" data-t="${k}" class="${tab === k ? 'on' : ''}">${label}</button>`
          )
          .join('')}
      </div>`;
    }

    function body() {
      if (tab === 'page') {
        const max = Words.maxPage(30);
        page = Math.min(Math.max(1, page), max);
        const list = Words.pageRange(page, 30);
        return `<div class="card flush">
          <div class="card-hd" style="padding:16px 18px 0;margin-bottom:12px">
            <div class="card-t">第 ${page} 页 <span class="tiny muted">共 ${max} 页 · 每页 30 词</span></div>
            <div class="row" style="gap:6px">
              <button class="btn btn-sm" data-act="pg" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
              <button class="btn btn-sm" data-act="pg" data-p="${page + 1}" ${page >= max ? 'disabled' : ''}>下一页</button>
            </div>
          </div>
          ${list.map(row).join('')}
        </div>`;
      }

      if (tab === 'cat') {
        const cats = Words.catList();
        if (!cat) {
          return `<div class="card flush">
            <div style="padding:16px 18px 10px"><div class="card-t">按主题</div>
            <div class="card-sub" style="margin:4px 0 0">同一主题的词放在一起记，比按字母序有效</div></div>
            ${cats
              .map(
                (c) => `<div class="list-item" data-act="cat" data-c="${esc(c.name)}">
                  <div class="grow"><div class="li-t">${esc(c.name)}</div>
                  <div class="li-s">${c.count} 个词</div></div>
                  <span class="arrow">›</span>
                </div>`
              )
              .join('')}
          </div>`;
        }
        const list = Words.all().filter((e) => e.cat === cat);
        return `<div class="card flush">
          <div class="card-hd" style="padding:16px 18px 0;margin-bottom:12px">
            <div class="card-t">${esc(cat)} <span class="tiny muted">${list.length} 词</span></div>
            <button class="btn btn-sm" data-act="tab" data-t="cat">← 全部主题</button>
          </div>
          ${list.map(row).join('')}
        </div>`;
      }

      if (tab === 'wrong') {
        const recs = Store.allRecords();
        const list = Object.keys(recs)
          .map((k) => ({ e: Words.get(Number(k)), r: recs[k] }))
          .filter((x) => x.e && x.r.lapses > 0)
          .sort((a, b) => b.r.lapses - a.r.lapses)
          .map((x) => ({ ...x.e, _lap: x.r.lapses }));
        if (!list.length) {
          return `<div class="card"><div class="empty"><b>还没有错词</b>答错的词会自动进这里，方便集中攻克。</div></div>`;
        }
        return `<div class="card flush">
          <div style="padding:16px 18px 10px">
            <div class="card-t">错词本</div>
            <div class="card-sub" style="margin:4px 0 0">${list.length} 个词，按出错次数排</div>
          </div>
          ${list
            .map(
              (e) => `<div class="list-item" data-act="open" data-i="${e.i}">
                <div class="grow">
                  <div class="li-t">${esc(e.w)}</div>
                  <div class="li-s">${esc(e.meanShort)}</div>
                </div>
                <span class="tag tag-bad">错 ${e._lap} 次</span>
                <span class="arrow">›</span>
              </div>`
            )
            .join('')}
        </div>`;
      }

      if (tab === 'fav') {
        const list = Store.getFav().map((i) => Words.get(i)).filter(Boolean);
        if (!list.length) {
          return `<div class="card"><div class="empty"><b>还没有收藏</b>在单词详情页点「收藏」，生词就留在这里。</div></div>`;
        }
        return `<div class="card flush">
          <div style="padding:16px 18px 10px">
            <div class="card-t">收藏</div>
            <div class="card-sub" style="margin:4px 0 0">${list.length} 个词</div>
          </div>
          ${list.map(row).join('')}
        </div>`;
      }

      // search
      const res = kw ? Words.search(kw, 60) : [];
      return `<div class="card">
        <input class="input" id="q" placeholder="输入英文或中文，回车搜索" value="${esc(kw)}">
        <div class="tiny muted" style="margin-top:8px">搜英文按前缀优先，也能搜释义里的中文</div>
      </div>
      ${kw
        ? `<div class="card flush">
            <div style="padding:14px 18px 8px" class="tiny muted">找到 ${res.length} 个</div>
            ${res.map(row).join('') || '<div class="empty">没找到，换个词试试</div>'}
          </div>`
        : ''}`;
    }

    function paint() {
      root.innerHTML = head() + body();
      bind();
    }

    function bind() {
      App.on(root, {
        tab: (t) => {
          tab = t.dataset.t;
          if (tab !== 'cat') cat = '';
          Router.go(`/list?tab=${tab}`, true);
        },
        pg: (t) => {
          page = Number(t.dataset.p);
          Router.go(`/list?tab=page&page=${page}`, true);
        },
        cat: (t) => {
          cat = t.dataset.c;
          Router.go(`/list?tab=cat&cat=${encodeURIComponent(cat)}`, true);
        },
        open: (t) => Router.go('/word/' + t.dataset.i),
      });

      const q = root.querySelector('#q');
      if (q) {
        q.focus();
        q.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            Router.go(`/list?tab=search&q=${encodeURIComponent(ev.target.value.trim())}`, true);
          }
        });
      }
    }

    paint();
  }

  App.Router.add('/list', render);
})();
