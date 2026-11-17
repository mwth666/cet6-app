// 基础设施：接口调用、路由、DOM 小工具
(function () {
  // ---------------- 接口 ----------------
  const Api = {
    async get(url) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return res.json();
    },
    async post(url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return res.json();
    },
  };

  // ---------------- 路由 ----------------
  const Router = {
    routes: {},
    current: '',
    add(path, render) {
      this.routes[path] = render;
    },
    go(path, replace) {
      const target = '#' + path;
      if (location.hash === target) return this.resolve();
      if (replace) location.replace(target);
      else location.hash = target;
    },
    parse() {
      const raw = (location.hash || '#/home').slice(1);
      const qi = raw.indexOf('?');
      const pathPart = qi >= 0 ? raw.slice(0, qi) : raw;
      const query = {};
      if (qi >= 0) {
        raw.slice(qi + 1).split('&').forEach((kv) => {
          if (!kv) return;
          const eq = kv.indexOf('=');
          const k = eq < 0 ? kv : kv.slice(0, eq);
          const v = eq < 0 ? '' : kv.slice(eq + 1);
          try {
            query[decodeURIComponent(k)] = decodeURIComponent(v);
          } catch (e) {
            query[k] = v;
          }
        });
      }
      const parts = pathPart.split('/').filter(Boolean);
      return { path: '/' + (parts[0] || 'home'), args: parts.slice(1), query };
    },
    async resolve() {
      const { path, args, query } = this.parse();
      const view = this.routes[path] || this.routes['/home'];
      const app = document.getElementById('view');
      app.innerHTML = '';
      app.scrollTop = 0;
      window.scrollTo(0, 0);
      this.current = path;
      document.querySelectorAll('[data-nav]').forEach((n) => {
        n.classList.toggle('on', n.dataset.nav === path);
      });
      try {
        await view(app, args, query);
      } catch (err) {
        console.error(err);
        app.innerHTML = `<div class="card"><div class="empty">这一页出错了：${esc(err.message || err)}</div></div>`;
      }
    },
  };

  // ---------------- DOM 工具 ----------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 事件委托：视图里写 data-act="xxx"，这里统一分发
  function on(root, map) {
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      const fn = map[t.dataset.act];
      if (fn) {
        ev.preventDefault();
        fn(t, ev);
      }
    });
  }

  let toastTimer = null;
  function toast(msg, ms) {
    let box = document.getElementById('toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), ms || 1600);
  }

  // ---------------- 时间/格式化 ----------------
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function dayKey(d) {
    const t = d || new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  function daysLeft() {
    const target = new Date(window.CFG.examDate + 'T00:00:00');
    const d = Math.ceil((target - new Date()) / 86400000);
    return d > 0 ? d : 0;
  }

  function mmss(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // 安全索引：任何输入都返回合法下标，避免 Number('abc') => NaN 绕过边界检查
  function idxOf(raw, len) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    const i = Math.floor(n);
    return i >= 0 && i < len ? i : 0;
  }

  window.App = {
    Api,
    Router,
    esc,
    on,
    toast,
    dayKey,
    daysLeft,
    mmss,
    shuffle,
    idxOf,
    words: [],
    content: {},
  };
})();
