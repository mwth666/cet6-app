// 学习：新词先看语境，再换不同题型反复提取；答完立刻给反馈
(function () {
  const { esc, Router, toast } = window.App;

  function renderSegs(segs, filled, state) {
    return (segs || [])
      .map((s) => {
        if (s.blank || s.hl) {
          if (filled) {
            const cls = state === 'right' ? 'blank ok' : state === 'wrong' ? 'blank bad' : 'blank';
            return `<span class="${cls}">${esc(filled)}</span>`;
          }
          if (s.blank) return '<span class="blank">？</span>';
          return `<span class="hl">${esc(s.t)}</span>`;
        }
        return esc(s.t);
      })
      .join('');
  }

  // 依据是否答对 + 用时，自动折算成 0-3 的掌握等级
  function autoGrade(ok, ms, similar) {
    if (!ok) return similar ? 1 : 0;
    if (ms < 4000) return 3;
    return 2;
  }

  function render(root) {
    let items = window.Queue.buildSession({ size: window.CFG.ui.sessionSize }).filter((it) => it.e);
    if (!items.length) {
      root.innerHTML = `
        <div class="card center" style="padding:44px 20px">
          <div style="font-size:34px;margin-bottom:10px">🎉</div>
          <h3 style="margin-bottom:8px">今天的任务完成了</h3>
          <p class="muted small">没有到期的新词和复习。可以去听力、阅读模块转转，或者明天再来。</p>
          <div class="row center" style="justify-content:center;margin-top:20px;gap:10px">
            <button class="btn btn-primary" data-act="go" data-to="/listen">练听力</button>
            <button class="btn" data-act="go" data-to="/home">回首页</button>
          </div>
        </div>`;
      App.on(root, { go: (t) => Router.go(t.dataset.to) });
      return;
    }

    let i = 0;
    let right = 0;
    let wrong = 0;
    let phase = 'intro';
    let q = null;
    let picked = null;
    let fbState = '';
    let t0 = 0;
    let similar = false;
    let inputVal = '';

    function current() {
      return items[i];
    }

    function beginItem() {
      const it = current();
      const isNew = !it.rec;
      phase = isNew ? 'intro' : 'quiz';
      if (!isNew) startQuiz();
      else paint();
    }

    function startQuiz() {
      const it = current();
      const rec = it.rec || Store.getRec(it.e.i);
      let type;
      if (!it.rec) type = 'cloze';
      else type = window.Quiz.pickType(it.e, rec);
      q = window.Quiz.build(it.e, type);
      phase = 'quiz';
      picked = null;
      fbState = '';
      inputVal = '';
      t0 = Date.now();
      paint();
      if (q.audioText && q.type === 'listen') {
        setTimeout(() => window.Audio2.speak(q.audioText, { rate: 0.9 }), 260);
      } else if (q.type === 'spell') {
        setTimeout(() => window.Audio2.speakWord(q.word), 260);
      }
    }

    function judge() {
      const it = current();
      const e = it.e;
      let ok = false;
      similar = false;

      if (q.kind === 'choice') {
        const opt = q.options.find((o) => o.key === picked);
        ok = !!(opt && opt.right);
      } else {
        const val = (inputVal || '').trim();
        ok = window.Quiz.judgeWord(val, q.answerText);
        if (!ok && val) {
          // 差一两个字母也算"接近"，给困难级而不是完全忘了
          const a = q.answerText.toLowerCase();
          const b = val.toLowerCase();
          similar = Math.abs(a.length - b.length) <= 2 && a.slice(0, 2) === b.slice(0, 2);
        }
      }

      const ms = Date.now() - t0;
      const grade = autoGrade(ok, ms, similar);
      const next = window.SRS.schedule(Store.getRec(e.i), grade, Date.now(), window.CFG);
      Store.putRec(e.i, next);

      if (it.rec) Store.bump('r');
      else Store.bump('n');
      Store.bump('c');
      if (ok) {
        right++;
        if (next.mastered) Store.bump('w');
      } else {
        wrong++;
      }

      fbState = ok ? 'right' : 'wrong';
      phase = 'feedback';
      paint();
      window.Audio2.speakWord(e.w);
      if ((i + 1) % window.CFG.ui.flushEvery === 0) Store.flush();
    }

    function next() {
      i++;
      if (i >= items.length) {
        phase = 'summary';
        paint();
        Store.flush();
        return;
      }
      beginItem();
    }

    // ---------------- 渲染 ----------------

    function paint() {
      const it = current();
      const e = it.e;
      const pct = Math.round((i / items.length) * 100);
      const head = `
        <div class="row between" style="margin-bottom:14px">
          <div class="row" style="gap:10px">
            <button class="btn btn-sm btn-ghost" data-act="quit">← 退出</button>
            <span class="tiny muted">第 ${i + 1} / ${items.length} 题</span>
          </div>
          <span class="tiny muted">正确 ${right} · 错误 ${wrong}</span>
        </div>
        <div class="progress-line thin" style="margin-bottom:18px"><i style="width:${pct}%"></i></div>`;

      if (phase === 'intro') {
        root.innerHTML = head + `
          <div class="card">
            <div class="row between" style="align-items:flex-start;margin-bottom:6px">
              <div>
                <div class="big" style="line-height:1.2">${esc(e.w)}</div>
                <div class="tiny muted" style="margin-top:6px">
                  ${e.uk ? `英 /${esc(e.uk)}/` : ''} ${e.us ? `美 /${esc(e.us)}/` : ''}
                  ${e.pos ? `<span class="tag" style="margin-left:6px">${esc(e.pos)}</span>` : ''}
                </div>
              </div>
              <button class="btn btn-sm" data-act="say">🔊 朗读</button>
            </div>
            <div class="divider"></div>
            <div class="sentence">${renderSegs(window.Quiz.intro(e).segs, '')}</div>
            <div class="muted small" style="margin-top:10px">${esc(e.st)}</div>
            <div class="divider"></div>
            <div class="small">${esc(e.m)}</div>
            ${e.phr ? `<div class="tiny muted" style="margin-top:8px">搭配：${esc(e.phr.split('|').join(' — '))}</div>` : ''}
            <div class="sticky-actions">
              <button class="btn btn-primary btn-block" data-act="start">记住了，开始检验</button>
            </div>
          </div>`;
        App.on(root, {
          say: () => window.Audio2.speakSentence(e.s || e.w),
          start: startQuiz,
          quit: () => Router.go('/home'),
        });
        return;
      }

      if (phase === 'quiz') {
        const body =
          q.kind === 'choice'
            ? q.options
                .map(
                  (o) => `<button class="option" data-act="pick" data-k="${o.key}">
                    <span class="k">${o.key}</span><span>${esc(o.text)}</span>
                  </button>`
                )
                .join('')
            : `<input class="input en" id="ans" autocomplete="off" autocapitalize="off"
                 spellcheck="false" placeholder="${esc(q.first || '')}… 共 ${q.len || '?'} 个字母"
                 value="${esc(inputVal)}">
               <div class="row" style="margin-top:10px;gap:8px">
                 <button class="btn btn-primary grow" data-act="check">提交</button>
                 <button class="btn" data-act="hint">提示</button>
               </div>`;

        root.innerHTML = head + `
          <div class="card">
            <div class="row between" style="margin-bottom:14px;align-items:flex-start">
              <div>
                <div class="tiny muted" style="margin-bottom:6px">${esc(q.prompt)}</div>
                ${q.sub ? `<div class="small">${esc(q.sub)}</div>` : ''}
              </div>
              ${q.audioText ? '<button class="btn btn-sm" data-act="play">🔊 播放</button>' : ''}
            </div>
            ${q.segs && q.segs.length ? `<div class="sentence">${renderSegs(q.segs, '')}</div><div class="divider"></div>` : ''}
            ${body}
          </div>`;
        App.on(root, {
          pick: (t) => {
            picked = t.dataset.k;
            root.querySelectorAll('.option').forEach((o) => o.classList.toggle('on', o === t));
            judge();
          },
          check: () => {
            const el = root.querySelector('#ans');
            inputVal = el ? el.value : '';
            judge();
          },
          hint: () => {
            const h = q.first ? `${q.first}…（${q.len} 个字母）` : '没有更多提示了';
            toast(h);
            if (q.sub) toast(h);
          },
          play: () => window.Audio2.speak(q.audioText || q.word),
          quit: () => Router.go('/home'),
        });
        const inp = root.querySelector('#ans');
        if (inp) {
          inp.focus();
          inp.addEventListener('input', (ev) => {
            inputVal = ev.target.value;
          });
          inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              inputVal = ev.target.value;
              judge();
            }
          });
        }
        return;
      }

      if (phase === 'feedback') {
        const ok = fbState === 'right';
        const chosen = q.kind === 'choice'
          ? (q.options.find((o) => o.key === picked) || {}).text
          : inputVal;
        const opts = q.kind === 'choice'
          ? q.options
              .map((o) => {
                let cls = 'option';
                if (o.right) cls += ' right';
                else if (o.key === picked) cls += ' wrong';
                return `<div class="${cls}"><span class="k">${o.key}</span><span>${esc(o.text)}</span></div>`;
              })
              .join('')
          : '';

        root.innerHTML = head + `
          <div class="card">
            <div class="row between" style="margin-bottom:10px">
              <div class="row" style="gap:8px">
                <span class="tag ${ok ? 'tag-ok' : 'tag-bad'}">${ok ? '答对了' : '再记一次'}</span>
                <span class="tiny muted">${similar ? '拼写接近了' : ''}</span>
              </div>
              <button class="btn btn-sm" data-act="say">🔊</button>
            </div>
            ${!ok ? `<div class="notice bad" style="margin-bottom:12px">
              你写的是「${esc(chosen || '（空）')}」，正确答案是 <b>${esc(q.answerText)}</b>
            </div>` : ''}
            <div class="sentence" style="margin-bottom:10px">${renderSegs(q.segs, q.answerText, ok ? 'right' : 'wrong')}</div>
            ${q.sentenceCn ? `<div class="muted small">${esc(q.sentenceCn)}</div>` : ''}
            ${opts ? `<div class="divider"></div>${opts}` : ''}
            <div class="divider"></div>
            <div class="row between" style="align-items:center">
              <div>
                <div class="strong">${esc(current().e.w)}</div>
                <div class="small muted">${esc(current().e.m)}</div>
                ${current().e.phr ? `<div class="tiny muted" style="margin-top:4px">${esc(current().e.phr.split('|').join(' — '))}</div>` : ''}
              </div>
            </div>
            <div class="sticky-actions">
              <button class="btn btn-primary btn-block" data-act="next">
                ${i + 1 >= items.length ? '完成本轮' : '下一个'}
              </button>
            </div>
          </div>`;
        App.on(root, {
          say: () => window.Audio2.speakSentence(current().e.s || current().e.w),
          next: next,
          quit: () => Router.go('/home'),
        });
        return;
      }

      // summary
      const acc = right + wrong ? Math.round((right / (right + wrong)) * 100) : 0;
      root.innerHTML = `
        <div class="card center" style="padding:38px 22px">
          <div style="font-size:32px;margin-bottom:8px">${acc >= 80 ? '🎯' : acc >= 60 ? '💪' : '📚'}</div>
          <h3 style="margin-bottom:6px">这一轮结束了</h3>
          <div class="muted small">正确率 ${acc}%</div>
          <div class="grid3" style="margin:26px 0 8px">
            <div class="stat"><div class="v">${items.length}</div><div class="l">做题数</div></div>
            <div class="stat"><div class="v" style="color:#12a150">${right}</div><div class="l">答对</div></div>
            <div class="stat"><div class="v" style="color:#e0483c">${wrong}</div><div class="l">答错</div></div>
          </div>
          <div class="row" style="justify-content:center;gap:10px;margin-top:18px">
            <button class="btn btn-primary" data-act="again">再来一轮</button>
            <button class="btn" data-act="home">回首页</button>
          </div>
        </div>`;
      App.on(root, {
        again: () => Router.go('/study?t=' + Date.now(), true),
        home: () => Router.go('/home'),
      });
    }

    beginItem();
  }

  App.Router.add('/study', render);
})();
