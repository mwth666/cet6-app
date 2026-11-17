// 回顾长文生成器的回归测试
// 重点不是"读起来好不好"，而是这四件事不能坏：
//   1. 同一份词 + 同一天 → 永远生成同一篇（不然刷新一次就变一篇，没法回看）
//   2. 正文里的每一句都是完整句，且确实包含它对应的那个词
//   3. 每个词要么进正文、要么进文末补列，不能凭空消失
//   4. 不出现词典标记（(= ...) / ...）这类脏数据
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.addEventListener = () => {};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { addEventListener() {}, visibilityState: 'visible', querySelector: () => null };
global.location = { hash: '#/home' };

['config', 'core', 'words', 'store', 'srs', 'quiz', 'article'].forEach((m) => {
  require(path.join(ROOT, 'web/js', m + '.js'));
});

const { Words, Article, Quiz } = global;
const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words.json'), 'utf8'));
Words.setAll(RAW);

let pass = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fails.push(msg);
}
function eq(a, b, msg) {
  ok(a === b, `${msg}（实际 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}）`);
}

function entriesOf(ids) {
  return ids.map((i) => ({ e: Words.get(i) }));
}

console.log('[1] 确定性：同一天同一版，刷新多少次都是同一篇');
{
  const ent = entriesOf(Array.from({ length: 80 }, (_, k) => k * 13));
  const a = Article.compose(ent, '2026-11-17|v0');
  const b = Article.compose(ent, '2026-11-17|v0');
  eq(a.title, b.title, '同一 seed 标题应一致');
  eq(a.open, b.open, '同一 seed 开场应一致');
  eq(JSON.stringify(a.chapters), JSON.stringify(b.chapters), '同一 seed 正文应完全一致');

  const c = Article.compose(ent, '2026-11-17|v1');
  const ta = JSON.stringify(a.chapters);
  const tc = JSON.stringify(c.chapters);
  ok(ta !== tc, '换一版应得到不同排列');
  eq(c.stats.words, a.stats.words, '换版不改变正文词数');
}

console.log('[2] 每句话都是完整句，且确实包含对应的词');
{
  const ent = entriesOf(Array.from({ length: 160 }, (_, k) => k * 31));
  const art = Article.compose(ent, 'probe');
  let badStart = 0;
  let badEnd = 0;
  let noHit = 0;
  let dirty = 0;
  const samples = [];
  art.chapters.forEach((c) => {
    c.paras.forEach((p) => {
      p.forEach((s) => {
        if (!/^["'(]?[A-Z]/.test(s.text)) {
          badStart++;
          if (samples.length < 5) samples.push('开头:' + s.text.slice(0, 40));
        }
        if (!/[.!?]$/.test(s.text)) badEnd++;
        if (!s.b || !s.b.trim()) noHit++;
        if (/\(=|（=|\bpl\.|\bsyn\.|\bant\.|\.\.\./.test(s.text)) {
          dirty++;
          if (samples.length < 8) samples.push('脏:' + s.text.slice(0, 40));
        }
        // 高亮区间必须和整句拼得上
        if (s.a + s.b + s.c !== s.text) badEnd++;
      });
    });
  });
  eq(badStart, 0, `正文句首未大写（示例 ${samples.join(' | ')}）`);
  eq(badEnd, 0, '正文句末缺标点，或高亮切分与整句对不上');
  eq(noHit, 0, '正文句子没有标出目标词');
  eq(dirty, 0, `正文残留词典标记（示例 ${samples.join(' | ')}）`);
}

console.log('[3] 词不能丢：正文 + 文末补列 = 输入');
{
  for (const n of [12, 60, 166, 400]) {
    const ids = Array.from({ length: n }, (_, k) => (k * 17) % RAW.length);
    const uniq = [...new Set(ids)];
    const art = Article.compose(entriesOf(uniq), 'count' + n);
    eq(art.stats.total, uniq.length, `${uniq.length} 个词应全部记账`);
    eq(
      art.stats.words + art.stats.extras,
      art.stats.total,
      `${uniq.length} 词的正文与补列之和应等于总数`
    );
    eq(art.chapters.reduce((a, c) => a + c.words.length, 0), art.stats.words, '章节词数之和应等于正文词数');
  }
}

console.log('[4] 没有重复句、没有重复词');
{
  const art = Article.compose(entriesOf(Array.from({ length: 200 }, (_, k) => k * 7)), 'dup');
  const sents = new Set();
  let dupS = 0;
  const words = new Set();
  let dupW = 0;
  const ids = new Set();
  let dupI = 0;
  art.chapters.forEach((c) => {
    c.paras.forEach((p) =>
      p.forEach((s) => {
        const k = s.raw.toLowerCase();
        if (sents.has(k)) dupS++;
        else sents.add(k);
        if (words.has(s.w)) dupW++;
        else words.add(s.w);
        if (ids.has(s.i)) dupI++;
        else ids.add(s.i);
      })
    );
  });
  eq(dupS, 0, '正文出现重复句');
  eq(dupW, 0, '正文出现重复词');
  eq(dupI, 0, '同一个词被排进正文两次');
}

console.log('[5] 段落和章节的形态');
{
  const art = Article.compose(entriesOf(Array.from({ length: 166 }, (_, k) => k * 23)), 'shape');
  ok(art.chapters.length >= 3, `166 词应至少分成 3 章（实际 ${art.chapters.length}）`);
  const names = art.chapters.map((c) => c.cn);
  eq(new Set(names).size, names.length, '章节名不应重复');

  let tooShort = 0;
  let tooLong = 0;
  art.chapters.forEach((c) => {
    c.paras.forEach((p) => {
      if (p.length < 2) tooShort++;
      if (p.length > 9) tooLong++;
    });
    ok(c.n >= 3 || art.chapters.length === 1, `章节「${c.cn}」只有 ${c.n} 个词，太碎`);
  });
  eq(tooShort, 0, '出现只有 1 句的段落');
  eq(tooLong, 0, '出现超过 9 句的段落');
  ok(art.title && art.title.length > 4, '应有标题');
  ok(art.open && art.close, '应有开场与结尾');
  // 标题不能出现连续两个虚词小写开头的怪相
  ok(!/^(the|a|an)\s/.test(art.title), `标题不该以小写冠词开头：${art.title}`);
}

console.log('[6] 边界与健壮性');
{
  const empty = Article.compose([], 'e');
  eq(empty.chapters.length, 0, '空输入应得到空文章');
  eq(empty.stats.total, 0, '空输入总数应为 0');

  const one = Article.compose(entriesOf([0]), 'one');
  eq(one.stats.total, 1, '单个词也要能生成');

  // 全是残缺句的情况：不能抛错，正文为空但补列要留住
  const fake = [
    { e: { i: 90001, w: 'aaa', m: '甲', s: 'a thing of no use', st: '无用之物', cat: '时间、日期与时期' } },
    { e: { i: 90002, w: 'bbb', m: '乙', s: 'bbb', st: '乙', cat: '' } },
  ];
  const bad = Article.compose(fake, 'bad');
  eq(bad.stats.total, 2, '残缺例句的词也要记账');
  eq(bad.stats.words, 0, '残缺例句不该进正文');
  eq(bad.extras.length, 2, '残缺例句的词应进文末补列');

  // 同一句被多个词共用时只收一次
  const same = [
    { e: { i: 1, w: 'share', m: '份额', s: 'They agreed to share the cost.', st: '他们同意分摊费用。', cat: '给予、获得与占有' } },
    { e: { i: 2, w: 'share', m: '份额', s: 'They agreed to share the cost.', st: '他们同意分摊费用。', cat: '给予、获得与占有' } },
  ];
  const s1 = Article.compose(same, 'same');
  eq(s1.stats.sents, 1, '同一句应只收一次');
}

console.log('[7] 性能：166 词的今天，生成要够快');
{
  const ent = entriesOf(Array.from({ length: 166 }, (_, k) => k * 29));
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) Article.compose(ent, 'perf' + i);
  const ms = (Date.now() - t0) / 20;
  ok(ms < 120, `单次生成耗时 ${ms.toFixed(1)}ms，超过 120ms`);
  console.log(`    166 词平均 ${ms.toFixed(1)}ms/次`);
}

console.log('');
if (fails.length) {
  console.log(`✗ 失败 ${fails.length} 条（通过 ${pass}）`);
  fails.forEach((f) => console.log('   - ' + f));
  process.exit(1);
} else {
  console.log(`✓ 全部通过：${pass} 条断言`);
}
