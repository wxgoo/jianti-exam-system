import test from "node:test";
import assert from "node:assert/strict";
import { htmlToLines, parseZujuanHtml } from "../lib/zujuan-import.ts";

const questionHtml = `<!doctype html><html><head><meta charset="utf-8"><style>.card{color:#111}</style></head><body><div class="container">
<div class="card"><div style="font-weight:700;margin-bottom:6px">【1】 QID:12345 / 答:A</div><div class="exam-item__cnt">1. 3+5=（）<br>A．6<br>B．7<br>C．8<br>D．9<img src="data:image/png;base64,AAAA"></div></div>
<div class="card"><div style="font-weight:700;margin-bottom:6px">【2】 QID:12346</div><div class="exam-item__cnt">2．下列图形中对称轴最多的是（） A．正方形 B．长方形 C．圆形 D．三角形</div></div>
</div></body></html>`;

test("htmlToLines 把标签、换行和实体转换为文本行", () => {
  assert.deepEqual(htmlToLines("<p>甲&amp;乙<br>丙</p><div>丁</div>"), ["甲&乙", "丙", "丁"]);
});

test("解析题目离线 HTML 的卡片、选项、答案与 QID", () => {
  const result = parseZujuanHtml(questionHtml);
  assert.equal(result.cards, 2);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions.map((question) => question.number), ["1", "2"]);
  assert.equal(result.questions[0].type, "single");
  assert.ok(result.questions[0].stem.includes("3+5"));
  assert.equal(result.questions[0].answer, "A");
  assert.equal(result.questions[0].options.length, 4);
  assert.equal(result.questions[1].answer, "");
  assert.equal(result.imagesIgnored, 1);
});

test("解析答案合集 HTML，按 QID 卡片提取答案和解析", () => {
  const html = `<div class="container">
<div class="card"><div style="font-weight:700">QID:12345</div><div class="q"><div>1. 计算：2+3=____</div></div><hr><div class="ans">答案：5<br>解析：直接相加。</div></div>
</div>`;
  const result = parseZujuanHtml(html);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].type, "fill");
  assert.equal(result.questions[0].answer, "5");
  assert.equal(result.questions[0].analysis, "直接相加。");
});

test("导出包去重且空内容不产生题目", () => {
  const html = `<div class="card"><div style="font-weight:700">【1】 QID:1 / 答:A</div><div>1. 同样的题 A．甲 B．乙</div></div>
<div class="card"><div style="font-weight:700">【2】 QID:2 / 答:A</div><div>1. 同样的题 A．甲 B．乙</div></div>`;
  assert.equal(parseZujuanHtml(html).questions.length, 1);
  assert.equal(parseZujuanHtml("<html><body>没有题目卡片</body></html>").questions.length, 0);
});
