// 写作：计时练笔 + 范文对照 + 四维自评；另有框架/句式/词块三个资料库
(function () {
  const { esc, Router, toast, mmss } = window.App;

  const W = () => App.content.write || {};

  function wordCount(t) {
    return (t || '').trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length;
  }

  const TABS = [
    ['practice', '练笔'],
    ['frames', '框架'],
    ['patterns', '句式'],
    ['chunks', '词块'],
    ['samples', '范文'],
    ['checklist', '清单'],
  ];

  function render(root, args, query) {
    let tab = query.tab || 'practice';
    let timer = null;

    function head() {
      return `<div class="seg" style="margin-bottom:16px">
        ${TABS.map(([k, l]) => `<button data-act="tab" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>`;
    }

    // ---------- 练笔 ----------

    function practice() {
      const samples = W().samples || [];
      let si = App.idxOf(query.p, 999);
      if (si >= samples.length) si = 0;
      const s = samples[si];
      const draftId = 'write-' + si;
      const draft = Store.getDraft(draftId) || {};
      let text = draft.text || '';
      let seconds = draft.seconds || 0;
      let running = !!draft.running && !!text;
      let submitted = !!draft.submitted;
      let checks = draft.checks || {};

      const LIMIT = 30 * 60;

      function paint() {
        const wc = wordCount(text);
        root.innerHTML = `
          ${head()}
          <div class="card">
            <div class="row between" style="align-items:flex-start;margin-bottom:10px">
              <div>
                <div class="card-t">${esc(s.title.replace(/^范文\s*·\s*/, ''))}</div>
                <div class="card-sub" style="margin:4px 0 0">话题：${esc(s.topic)} · 六级要求 150–200 词</div>
              </div>
              <div class="row" style="gap:6px">
                <span class="tag ${running ? 'tag-a' : ''}" id="clock">${mmss(seconds)}</span>
                <button class="btn btn-sm" data-act="${running ? 'pause' : 'start'}">${running ? '暂停' : seconds ? '继续' : '开始计时'}</button>
              </div>
            </div>
            <textarea class="textarea" id="ta" placeholder="在这里写。先想清楚立场，再动笔，不要一边写一边改。" style="min-height:300px">${esc(text)}</textarea>
            <div class="row between" style="margin-top:8px">
              <span class="tiny muted" id="wc">${wc} 词 ${wc >= 150 && wc <= 200 ? '· 在合适区间' : wc > 200 ? '· 偏长了' : wc ? '· 还不够' : ''}</span>
              <div class="row" style="gap:6px">
                ${text ? '<button class="btn btn-sm btn-ghost" data-act="clear">清空</button>' : ''}
                <button class="btn btn-primary btn-sm" data-act="submit" ${wc < 30 ? 'disabled' : ''}>写完了，看范文</button>
              </div>
            </div>
          </div>
          ${submitted ? sampleBlock() : ''}
          ${submitted ? checkBlock() : ''}
          <div class="row" style="gap:8px;margin-top:4px">
            <button class="btn grow" data-act="prev" ${si <= 0 ? 'disabled' : ''}>上一个题目</button>
            <button class="btn grow" data-act="next" ${si >= samples.length - 1 ? 'disabled' : ''}>下一个题目</button>
          </div>`;
        bindPractice();
      }

      function sampleBlock() {
        return `<div class="card">
          <div class="card-hd">
            <div class="card-t">同题范文</div>
            <span class="tiny muted">对照着看，别只看不抄</span>
          </div>
          ${s.body.map((b, n) => `<div class="para-block">
            <div class="en" style="font-size:15px;line-height:1.85">${esc(b.para)}</div>
            <div class="note">${esc(b.note || '')}</div>
          </div>`).join('')}
          ${s.highlights && s.highlights.length ? `<div class="divider"></div>
            <div class="tiny muted" style="margin-bottom:8px">可直接搬用的表达</div>
            <div class="row wrap" style="gap:6px">
              ${s.highlights.map((h) => `<span class="tag tag-a">${esc(typeof h === 'string' ? h : h.en || '')}</span>`).join('')}
            </div>` : ''}
        </div>`;
      }

      function checkBlock() {
        const list = W().checklist || [];
        return `<div class="card">
          <div class="card-hd">
            <div class="card-t">四维自评</div>
            <span class="tiny muted" id="ckcount">${Object.keys(checks).filter((k) => checks[k]).length} / ${list.reduce((a, c) => a + c.items.length, 0)}</span>
          </div>
          ${list.map((c, d) => `<div style="margin-bottom:16px">
            <div class="tag" style="margin-bottom:8px">${esc(c.dim)}</div>
            ${c.items.map((it, n) => {
              const key = d + '-' + n;
              return `<label class="check"><input type="checkbox" data-act="check" data-k="${key}" ${checks[key] ? 'checked' : ''}><span>${esc(it)}</span></label>`;
            }).join('')}
          </div>`).join('')}
        </div>`;
      }

      function save() {
        Store.setDraft(draftId, { text, seconds, running, submitted, checks });
      }

      function bindPractice() {
        const ta = root.querySelector('#ta');
        if (ta) {
          ta.addEventListener('input', (ev) => {
            text = ev.target.value;
            const wc = wordCount(text);
            const el = root.querySelector('#wc');
            if (el) {
              el.textContent = `${wc} 词 ${wc >= 150 && wc <= 200 ? '· 在合适区间' : wc > 200 ? '· 偏长了' : wc ? '· 还不够' : ''}`;
            }
            if (running) save();
          });
        }

        App.on(root, {
          tab: (t) => Router.go('/write?tab=' + t.dataset.t, true),
          start: () => {
            running = true;
            paint();
          },
          pause: () => {
            running = false;
            save();
            paint();
          },
          clear: () => {
            if (!confirm('清空这篇草稿？')) return;
            text = '';
            submitted = false;
            checks = {};
            save();
            paint();
          },
          submit: () => {
            submitted = true;
            running = false;
            Store.bump('wr');
            save();
            paint();
            toast('往下翻，对照范文和清单');
          },
          check: (t) => {
            checks[t.dataset.k] = t.checked;
            save();
            const total = (W().checklist || []).reduce((a, c) => a + c.items.length, 0);
            const el = root.querySelector('#ckcount');
            if (el) el.textContent = `${Object.keys(checks).filter((k) => checks[k]).length} / ${total}`;
          },
          prev: () => Router.go('/write?tab=practice&p=' + (si - 1), true),
          next: () => Router.go('/write?tab=practice&p=' + (si + 1), true),
        });
      }

      paint();

      if (running) {
        timer = setInterval(() => {
          if (!document.body.contains(root.querySelector('#clock'))) {
            clearInterval(timer);
            return;
          }
          seconds++;
          const el = root.querySelector('#clock');
          if (el) el.textContent = mmss(seconds);
          if (seconds % 10 === 0) save();
          if (seconds >= LIMIT) {
            clearInterval(timer);
            running = false;
            toast('30 分钟到了，先停下来看看写了多少');
            save();
          }
        }, 1000);
      }
    }

    // ---------- 资料库 ----------

    function frames() {
      root.innerHTML = head() + (W().frames || []).map((f) => `
        <div class="card">
          <div class="card-t">${esc(f.name)}</div>
          <div class="card-sub">${esc(f.desc)}</div>
          ${f.parts.map((p) => `<div class="para-block">
            <div class="tiny muted" style="margin-bottom:4px">${esc(p.label)}</div>
            <div class="en" style="font-size:14.5px;line-height:1.8;background:#f8fafd;padding:10px 12px;border-radius:9px">${esc(p.text)}</div>
            ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
          </div>`).join('')}
        </div>`).join('');
      App.on(root, { tab: (t) => Router.go('/write?tab=' + t.dataset.t, true) });
    }

    function patterns() {
      root.innerHTML = head() + `<div class="card">${(W().patterns || []).map((p) => `
        <div class="pat">
          <div class="en" style="font-size:15px">${esc(p.en)}</div>
          <div class="small muted" style="margin-top:2px">${esc(p.cn)}</div>
          <div class="row wrap" style="gap:6px;margin-top:6px">
            <span class="tag">${esc(p.use || '')}</span>
            ${p.slot ? `<span class="tag tag-b">${esc(p.slot)}</span>` : ''}
          </div>
        </div>`).join('')}</div>`;
      App.on(root, { tab: (t) => Router.go('/write?tab=' + t.dataset.t, true) });
    }

    function chunks() {
      root.innerHTML = head() + (W().chunks || []).map((c) => `
        <div class="card">
          <div class="card-t" style="font-size:15px;margin-bottom:10px">${esc(c.topic)}</div>
          <div class="grid2" style="gap:8px">
            ${c.items.map((it) => `<div class="chunk">
              <div class="mono small">${esc(it.en)}</div>
              <div class="tiny muted">${esc(it.cn)}</div>
            </div>`).join('')}
          </div>
        </div>`).join('');
      App.on(root, { tab: (t) => Router.go('/write?tab=' + t.dataset.t, true) });
    }

    function samples() {
      root.innerHTML = head() + (W().samples || []).map((s, n) => `
        <div class="card">
          <div class="card-hd">
            <div class="card-t">${esc(s.title)}</div>
            <button class="btn btn-sm" data-act="towrite" data-n="${n}">用这个题目练笔</button>
          </div>
          ${s.body.map((b) => `<p class="en" style="font-size:15px;line-height:1.9;margin:0 0 10px">${esc(b.para)}</p>`).join('')}
        </div>`).join('');
      App.on(root, {
        tab: (t) => Router.go('/write?tab=' + t.dataset.t, true),
        towrite: (t) => Router.go('/write?tab=practice&p=' + t.dataset.n, true),
      });
    }

    function checklist() {
      root.innerHTML = head() + `<div class="card">
        <div class="card-sub">写完对着这条条检查，比反复看范文有用</div>
        ${(W().checklist || []).map((c) => `<div style="margin-bottom:18px">
          <div class="tag tag-a" style="margin-bottom:8px">${esc(c.dim)}</div>
          ${c.items.map((it) => `<div class="check-row">· ${esc(it)}</div>`).join('')}
        </div>`).join('')}
      </div>`;
      App.on(root, { tab: (t) => Router.go('/write?tab=' + t.dataset.t, true) });
    }

    if (tab === 'frames') frames();
    else if (tab === 'patterns') patterns();
    else if (tab === 'chunks') chunks();
    else if (tab === 'samples') samples();
    else if (tab === 'checklist') checklist();
    else practice();
  }

  App.Router.add('/write', render);
})();
