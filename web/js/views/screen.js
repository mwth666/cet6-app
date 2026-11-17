// 一屏筛词：把已经认识的词挑出来，别让它占用新词配额
(function () {
  const { esc, Router, toast } = window.App;
  const SIZE = 30;

  function render(root) {
    let batch = window.Queue.pickNew(SIZE);
    let marked = {};
    let round = 0;

    function paint() {
      const total = Store.screenCount();
      const remain = window.Queue.remainingNew();

      if (!batch.length) {
        root.innerHTML = `
          <div class="card center" style="padding:40px 20px">
            <div style="font-size:32px;margin-bottom:10px">✅</div>
            <h3 style="margin-bottom:8px">能筛的词都筛完了</h3>
            <p class="muted small">已经排除 ${total} 个认识的词，还剩 ${remain} 个待学。</p>
            <button class="btn btn-primary" style="margin-top:18px" data-act="back">回到首页</button>
          </div>`;
        App.on(root, { back: () => Router.go('/home') });
        return;
      }

      const cards = batch
        .map((e) => {
          const on = marked[e.i];
          return `<div class="pick ${on ? 'on' : ''}" data-act="toggle" data-i="${e.i}">
            <div class="pick-w">${esc(e.w)}</div>
            <div class="pick-m">${esc(e.meanShort)}</div>
            ${on ? '<div class="pick-tag">认识</div>' : ''}
          </div>`;
        })
        .join('');

      root.innerHTML = `
        <div class="card">
          <div class="card-hd">
            <div>
              <div class="card-t">先筛掉认识的词</div>
              <div class="card-sub" style="margin:0">
                点一下标成「认识」，这些词就不再进新词队列。判断不准的就留着。
              </div>
            </div>
            <button class="btn btn-sm btn-ghost" data-act="back">← 返回</button>
          </div>
          <div class="row between" style="margin-bottom:14px">
            <span class="tiny muted">第 ${round + 1} 屏 · 已标 ${Object.keys(marked).length} 个</span>
            <span class="tiny muted">累计排除 ${total} · 待学 ${remain}</span>
          </div>
          <div class="picks">${cards}</div>
          <div class="row between" style="margin-top:18px;gap:10px">
            <button class="btn" data-act="all">本屏全标认识</button>
            <div class="row" style="gap:10px">
              <button class="btn" data-act="skip">都不认识，下一屏</button>
              <button class="btn btn-primary" data-act="save">确认 (${Object.keys(marked).length})</button>
            </div>
          </div>
        </div>`;
      bind();
    }

    function bind() {
      App.on(root, {
        toggle: (t) => {
          const i = Number(t.dataset.i);
          if (marked[i]) delete marked[i];
          else marked[i] = 1;
          paint();
        },
        all: () => {
          batch.forEach((e) => {
            marked[e.i] = 1;
          });
          paint();
        },
        skip: () => {
          nextBatch();
        },
        save: () => {
          const n = Object.keys(marked).length;
          Object.keys(marked).forEach((i) => Store.markScreen(Number(i), true));
          if (n) toast(`已排除 ${n} 个认识的词`);
          nextBatch();
        },
        back: () => Router.go('/home'),
      });
    }

    function nextBatch() {
      marked = {};
      round++;
      // pickNew 本身已排除已标记与已有记录的词，所以重新取就是下一批
      batch = window.Queue.pickNew(SIZE);
      paint();
    }

    paint();
  }

  App.Router.add('/screen', render);
})();
