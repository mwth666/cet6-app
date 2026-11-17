// 启动流程：并行载入词库、练习内容、学习进度，然后进入路由
(function () {
  const boot = document.getElementById('boot');
  const tip = document.getElementById('bootTip');
  const shell = document.getElementById('shell');

  function fail(msg) {
    tip.innerHTML = `<span style="color:#e0483c">${msg}</span>`;
  }

  async function start() {
    const t0 = Date.now();

    let words;
    let content;
    try {
      const res = await Promise.all([
        App.Api.get('/api/words'),
        App.Api.get('/api/content'),
        Store.load(),
      ]);
      words = res[0];
      content = res[1];
    } catch (err) {
      fail(`载入失败：${err.message}<br><span class="tiny">请确认 server.py 还在运行，然后刷新页面。</span>`);
      return;
    }

    if (!Array.isArray(words) || !words.length) {
      fail('词库是空的，请检查 data/words.json 是否完整。');
      return;
    }

    Words.setAll(words);
    App.words = words;
    App.content = content || {};

    tip.textContent = `已载入 ${words.length} 个词条 · ${Date.now() - t0}ms`;

    window.addEventListener('hashchange', () => App.Router.resolve());

    setTimeout(() => {
      boot.classList.add('hide');
      shell.hidden = false;
      App.Router.resolve();
      setTimeout(() => boot.remove(), 300);
    }, 120);

    // 发音可用性提示（浏览器没装英文音色时告知一声）
    setTimeout(() => {
      const st = window.Audio2.status();
      if (!st.ready && window.CFG.audio.provider !== 'off') {
        App.toast('浏览器没有可用的英文语音，听音类练习会自动跳过');
      }
    }, 2200);
  }

  start();
})();
