// 我的：统计、设置、备份、重置
(function () {
  const { esc, Router, toast } = window.App;

  function render(root) {
    const st = Store.countByState();
    const settings = Store.getSettings();
    const days = Store.last(14);
    const maxV = Math.max(1, ...days.map((d) => (d.data ? (d.data.n || 0) + (d.data.r || 0) : 0)));
    const streak = Store.streak();

    // 累计四模块
    const tot = { l: 0, rd: 0, tr: 0, wr: 0, c: 0 };
    Store.allDays().forEach((d) => {
      tot.l += d.l || 0;
      tot.rd += d.rd || 0;
      tot.tr += d.tr || 0;
      tot.wr += d.wr || 0;
      tot.c += d.c || 0;
    });

    const examDate = settings.examDate || window.CFG.examDate;
    const dailyNew = settings.dailyNew || window.CFG.dailyNew;
    const audioOff = settings.audioOff === true;

    root.innerHTML = `
      <div class="card">
        <div class="card-hd">
          <div class="card-t">学习统计</div>
          <span class="tiny muted">数据存在本机 userdata/progress.db</span>
        </div>
        <div class="grid4">
          <div class="stat"><div class="v">${st.total}</div><div class="l">学过的词</div></div>
          <div class="stat"><div class="v" style="color:#12a150">${st.mastered}</div><div class="l">已掌握</div></div>
          <div class="stat"><div class="v">${streak}</div><div class="l">连续天数</div></div>
          <div class="stat"><div class="v">${tot.c}</div><div class="l">累计做题</div></div>
        </div>
        <div class="divider"></div>
        <div class="tiny muted" style="margin-bottom:8px">最近 14 天（新词 + 复习）</div>
        ${days.some((d) => d.data && ((d.data.n || 0) + (d.data.r || 0)) > 0)
          ? `<div class="bar-chart">
          ${days.map((d) => {
            const v = d.data ? (d.data.n || 0) + (d.data.r || 0) : 0;
            const h = Math.max(2, Math.round((v / maxV) * 100));
            return `<div class="bar" title="${d.key}：${v}">
              <i class="${v ? 'has' : ''}" style="height:${h}%"></i>
              <span>${d.key.slice(5)}</span>
            </div>`;
          }).join('')}
        </div>`
          : `<div class="empty-hint">还没有记录，今天完成一轮学习，这里就会出现柱子</div>`}
        <div class="divider"></div>
        <div class="grid4">
          <div class="stat"><div class="v">${tot.l}</div><div class="l">听力题</div></div>
          <div class="stat"><div class="v">${tot.rd}</div><div class="l">阅读题</div></div>
          <div class="stat"><div class="v">${tot.tr}</div><div class="l">翻译句</div></div>
          <div class="stat"><div class="v">${tot.wr}</div><div class="l">写作篇</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-t" style="margin-bottom:14px">设置</div>

        <div class="set-row">
          <div>
            <div class="small">每天新词量</div>
            <div class="tiny muted">冲刺模式下会按剩余词数自动上调，这里是下限</div>
          </div>
          <div class="row" style="gap:6px">
            <input class="input num" id="dn" type="number" min="20" max="600" step="10" value="${dailyNew}" style="width:92px;text-align:center">
            <button class="btn btn-sm" data-act="savedn">保存</button>
          </div>
        </div>

        <div class="set-row">
          <div>
            <div class="small">考试日期</div>
            <div class="tiny muted">用来算倒计时和每日配额</div>
          </div>
          <div class="row" style="gap:6px">
            <input class="input" id="ed" type="date" value="${examDate}" style="width:160px">
            <button class="btn btn-sm" data-act="saveed">保存</button>
          </div>
        </div>

        <div class="set-row">
          <div>
            <div class="small">发音</div>
            <div class="tiny muted">${window.Audio2.available() ? '浏览器语音合成可用' : '当前没有可用的英文语音'}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="audio" ${audioOff ? '' : 'checked'}>
            <span></span>
          </label>
        </div>

        <div class="set-row">
          <div>
            <div class="small">认识的词</div>
            <div class="tiny muted">已排除 ${Store.screenCount()} 个，不再进入新词队列</div>
          </div>
          <button class="btn btn-sm" data-act="screen">去筛词</button>
        </div>
      </div>

      <div class="card">
        <div class="card-t" style="margin-bottom:6px">备份</div>
        <div class="card-sub">换电脑或者重装前，先导出一份；进度就是这一个文件。</div>
        <div class="row wrap" style="gap:8px">
          <a class="btn" href="/api/export" download>导出备份</a>
          <button class="btn" data-act="import">导入备份</button>
          <button class="btn btn-danger" data-act="reset">清空所有进度</button>
        </div>
        <input type="file" id="file" accept="application/json,.json" style="display:none">
      </div>

      <div class="card">
        <div class="card-t" style="margin-bottom:8px;font-size:15px">关于</div>
        <div class="tiny muted" style="line-height:1.9">
          六级冲刺 · 本地版。所有数据都在你自己的电脑上，不上传任何服务器。<br>
          词库 ${Words.size()} 词，每个词都配了例句，按间隔重复安排复习。<br>
          发音使用浏览器内置语音合成，离线可用。
        </div>
      </div>`;

    App.on(root, {
      savedn: () => {
        const v = Number(root.querySelector('#dn').value);
        if (!v || v < 10) return toast('至少要 10 个');
        Store.setSettings({ dailyNew: Math.min(600, Math.round(v)) });
        toast('已保存，明天生效（今天的配额已定）');
      },
      saveed: () => {
        const v = root.querySelector('#ed').value;
        if (!v) return toast('选个日期');
        Store.setSettings({ examDate: v });
        window.CFG.examDate = v;
        toast('已保存');
        render(root);
      },
      screen: () => Router.go('/screen'),
      import: () => root.querySelector('#file').click(),
      reset: async () => {
        if (!confirm('确定清空所有学习进度？这一步不可撤销。建议先导出备份。')) return;
        if (!confirm('再确认一次：真的清空？')) return;
        await Store.resetAll();
        toast('已清空');
        Router.go('/home');
      },
    });

    const audio = root.querySelector('#audio');
    if (audio) {
      audio.addEventListener('change', () => {
        const off = !audio.checked;
        Store.setSettings({ audioOff: off });
        window.CFG.audio.provider = off ? 'off' : 'web';
        toast(off ? '已关闭发音' : '已开启发音');
      });
    }

    const file = root.querySelector('#file');
    if (file) {
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const data = JSON.parse(text);
          const state = data.state || data;
          if (!state || typeof state !== 'object') throw new Error('文件格式不对');
          const res = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
          }).then((r) => r.json());
          if (!res.ok) throw new Error(res.error || '导入失败');
          await Store.load();
          toast(`导入成功，恢复了 ${res.words || 0} 个词的记录`);
          Router.go('/home');
        } catch (err) {
          toast('导入失败：' + (err.message || err));
        }
      });
    }
  }

  App.Router.add('/me', render);
})();
