// 今日：倒计时、今日任务、总览、四模块入口、热力图
(function () {
  const { esc, Router } = window.App;

  function ring(days, total) {
    const r = 48;
    const c = 2 * Math.PI * r;
    const ratio = Math.max(0, Math.min(1, days / (total || 30)));
    const dash = c * ratio;
    return `<div class="ring">
      <svg width="108" height="108">
        <circle cx="54" cy="54" r="${r}" fill="none" stroke="#e7ecf4" stroke-width="9"/>
        <circle cx="54" cy="54" r="${r}" fill="none" stroke="#2f6bff" stroke-width="9"
          stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"/>
      </svg>
      <div class="inner"><b>${days}</b><span>天后考试</span></div>
    </div>`;
  }

  function heat30() {
    const rows = Store.last(30);
    const max = Math.max(1, ...rows.map((r) => (r.data ? (r.data.n || 0) + (r.data.r || 0) : 0)));
    return rows
      .map((r) => {
        const v = r.data ? (r.data.n || 0) + (r.data.r || 0) : 0;
        let lv = 0;
        if (v > 0) lv = v < max * 0.25 ? 1 : v < max * 0.55 ? 2 : v < max * 0.85 ? 3 : 4;
        return `<i class="l${lv}" title="${r.key}：${v} 词"></i>`;
      })
      .join('');
  }

  function render(root) {
    const plan = window.Queue.todayPlan();
    const days = window.App.daysLeft();
    const stat = Store.countByState();
    const streak = Store.streak();
    const day = Store.getDay() || {};
    const doneToday = (day.n || 0) + (day.r || 0);
    // 今天被评过分的词——就是回顾长文要用的那批词
    const todayWords = window.Article ? window.Article.entriesOn(window.App.dayKey()).length : 0;
    const left = plan.leftNew + plan.due;
    const pct = plan.quota + plan.due > 0
      ? Math.min(100, Math.round((doneToday / (plan.quota + plan.due)) * 100))
      : 0;

    root.innerHTML = `
      <div class="card">
        <div class="row between" style="gap:22px">
          <div class="grow">
            <div class="row wrap" style="gap:8px;margin-bottom:8px">
              <span class="tag tag-a">冲刺模式</span>
              ${streak > 1 ? `<span class="tag tag-ok">连续 ${streak} 天</span>` : ''}
            </div>
            <div class="big" style="margin-bottom:6px">今天还剩 ${left} 个词</div>
            <div class="muted small">
              新词 ${plan.leftNew} 个 · 待复习 ${plan.due} 个 · 每日目标 ${plan.quota} 个
            </div>
            <div class="progress-line" style="margin:16px 0 12px">
              <i style="width:${pct}%"></i>
            </div>
            <div class="row" style="gap:10px">
              <button class="btn btn-primary" data-act="study">
                ${doneToday ? '继续学习' : '开始今天的学习'}
              </button>
              <button class="btn" data-act="screen">先筛掉认识的词</button>
            </div>
          </div>
          ${ring(days, 30)}
        </div>
      </div>

      ${
        todayWords
          ? `<div class="card art-entry" data-act="article">
        <div class="grow">
          <div class="row wrap" style="gap:8px;margin-bottom:5px">
            <span class="tag tag-ok">今日回顾</span>
            <span class="tiny muted">今天的 ${todayWords} 个词</span>
          </div>
          <div class="card-t" style="margin-bottom:3px">把今天的词连成一篇长文，再读一遍</div>
          <div class="tiny muted">每句都是该词自带的真实例句，按主题编组。读完相当于把今天的词在语境里重新过了一次。</div>
        </div>
        <span class="arrow">›</span>
      </div>`
          : ''
      }

      <div class="grid4">
        <div class="card" style="margin:0"><div class="stat">
          <div class="v">${stat.total}</div><div class="l">学过的词</div>
        </div></div>
        <div class="card" style="margin:0"><div class="stat">
          <div class="v">${stat.learning}</div><div class="l">学习中</div>
        </div></div>
        <div class="card" style="margin:0"><div class="stat">
          <div class="v">${stat.review}</div><div class="l">复习中</div>
        </div></div>
        <div class="card" style="margin:0"><div class="stat">
          <div class="v" style="color:#12a150">${stat.mastered}</div><div class="l">已掌握</div>
        </div></div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-t">四个模块</div>
          <span class="tiny muted">今天：听力 ${day.l || 0} · 阅读 ${day.rd || 0} · 写作 ${day.wr || 0} · 翻译 ${day.tr || 0}</span>
        </div>
        <div class="grid2">
          <div class="list-item" data-act="go" data-to="/listen" style="border-radius:10px;border:1px solid var(--line)">
            <div class="grow"><div class="li-t">听力</div><div class="li-s">真题句听写 · 信号词 · 短对话</div></div>
            <span class="arrow">›</span>
          </div>
          <div class="list-item" data-act="go" data-to="/read" style="border-radius:10px;border:1px solid var(--line)">
            <div class="grow"><div class="li-t">阅读</div><div class="li-s">选词填空 · 仔细阅读 · 同义替换</div></div>
            <span class="arrow">›</span>
          </div>
          <div class="list-item" data-act="go" data-to="/output" style="border-radius:10px;border:1px solid var(--line)">
            <div class="grow"><div class="li-t">写作</div><div class="li-s">句式 · 词块 · 范文 · 计时练笔</div></div>
            <span class="arrow">›</span>
          </div>
          <div class="list-item" data-act="go" data-to="/translate" style="border-radius:10px;border:1px solid var(--line)">
            <div class="grow"><div class="li-t">翻译</div><div class="li-s">逐句汉译英 · 高频表达库</div></div>
            <span class="arrow">›</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd">
          <div class="card-t">最近 30 天</div>
          <span class="tiny muted">${streak ? `连续 ${streak} 天` : '今天开始算第一天'}</span>
        </div>
        <div class="heat">${heat30()}</div>
        <div class="row between" style="margin-top:12px">
          <span class="tiny muted">剩余未学 ${plan.remaining} 词</span>
          <span class="tiny muted">按当前节奏约 ${Math.ceil(plan.remaining / Math.max(1, plan.quota))} 天学完</span>
        </div>
      </div>

      <div class="grid3">
        <button class="btn" data-act="go" data-to="/list?tab=wrong">错词本</button>
        <button class="btn" data-act="go" data-to="/list?tab=fav">收藏</button>
        <button class="btn" data-act="go" data-to="/list?tab=page">按页刷词</button>
      </div>
    `;

    App.on(root, {
      study: () => Router.go('/study'),
      article: () => Router.go('/article'),
      screen: () => Router.go('/screen'),
      go: (t) => Router.go(t.dataset.to),
    });
  }

  App.Router.add('/home', render);
})();
