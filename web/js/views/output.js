// 输出模块入口：写作 + 翻译
(function () {
  const { esc, Router } = window.App;

  function render(root) {
    const w = App.content.write || {};
    const t = App.content.translate || {};
    const day = Store.getDay() || {};

    root.innerHTML = `
      <div class="card">
        <div class="card-hd">
          <div>
            <div class="card-t">写作与翻译</div>
            <div class="card-sub" style="margin:0">这两部分是"输出"，光看范文没用，必须自己写一遍再对照</div>
          </div>
          <span class="tiny muted">今天：写作 ${day.wr || 0} 篇 · 翻译 ${day.tr || 0} 句</span>
        </div>
        <div class="grid2">
          <div class="pick-card" data-act="go" data-to="/write">
            <div class="li-t">写作</div>
            <div class="li-s" style="margin-top:4px">计时练笔 · 范文对照 · 四维自评</div>
            <div class="row wrap" style="gap:6px;margin-top:10px">
              <span class="tag">${(w.frames || []).length} 个框架</span>
              <span class="tag">${(w.patterns || []).length} 个句式</span>
              <span class="tag">${(w.samples || []).length} 篇范文</span>
            </div>
          </div>
          <div class="pick-card" data-act="go" data-to="/translate">
            <div class="li-t">翻译</div>
            <div class="li-s" style="margin-top:4px">逐句汉译英 · 参考译文 · 考点提示</div>
            <div class="row wrap" style="gap:6px;margin-top:10px">
              <span class="tag">${(t.passages || []).length} 个主题</span>
              <span class="tag">${(t.phrases || []).length} 条高频表达</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-t" style="font-size:15px;margin-bottom:10px">怎么练才有效</div>
        <div class="grid2">
          <div>
            <div class="tag tag-a" style="margin-bottom:6px">写作</div>
            <ol class="small" style="margin:0;padding-left:18px;line-height:1.85">
              <li>先计时写，<b>不准查词</b>，暴露真实水平</li>
              <li>写完立刻对照同题范文，逐段看人家怎么展开</li>
              <li>用四维清单自评，找出最弱的那一维</li>
              <li>把范文里能直接用的句式抄进自己的模板</li>
            </ol>
          </div>
          <div>
            <div class="tag tag-a" style="margin-bottom:6px">翻译</div>
            <ol class="small" style="margin:0;padding-left:18px;line-height:1.85">
              <li>一句一句写，不要整段一次性翻</li>
              <li>先自己写，再点开参考译文对比</li>
              <li>重点看「关键短语」——这就是得分点</li>
              <li>同一主题翻两遍，第二遍只瞄提示</li>
            </ol>
          </div>
        </div>
      </div>`;
    App.on(root, { go: (t) => Router.go(t.dataset.to) });
  }

  App.Router.add('/output', render);
})();
