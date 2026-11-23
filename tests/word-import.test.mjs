import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { readDocx, extractDocxLines, parseWordQuestions } from "../lib/word-import.ts";

function makeDocx(bodyXml) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  return zipSync({
    "word/document.xml": strToU8(documentXml),
    "word/media/image1.png": strToU8("not-a-real-image"),
  });
}

function paragraph(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

test("docx 按段落与表格的文档顺序提取文字，并转换制表符与换行", () => {
  const table = `<w:tbl><w:tr>
    <w:tc>${paragraph("第一列")}</w:tc>
    <w:tc>${paragraph("第二列A")}${paragraph("第二列B")}</w:tc>
  </w:tr></w:tbl>`;
  const body = `${paragraph("一、选择题")}${paragraph("A&amp;B &lt;题&gt;")}<w:p><w:r><w:t>甲乙</w:t><w:tab/><w:t>丙丁</w:t><w:br/><w:t>戊己</w:t></w:r></w:p>${table}`;
  const result = readDocx(makeDocx(body));
  assert.deepEqual(result.lines, [
    "一、选择题",
    "A&B <题>",
    "甲乙\t丙丁",
    "戊己",
    "第一列",
    "第二列A",
    "第二列B",
  ]);
  assert.equal(result.imageCount, 1);
  assert.deepEqual(extractDocxLines(makeDocx(body)), result.lines);
});

test("按大题标题、题号、选项和答案区拆分成单题，重复题号重新编号", () => {
  const result = parseWordQuestions([
    "六年级下册数学单元练习",
    "一、选择题（每题2分）",
    "1. 下列数中最大的是（ ）",
    "A. 3.5",
    "B. 4",
    "C. 5",
    "D. 6",
    "2．1+1=（ ）",
    "A．1 B．2 C．3 D．4",
    "二、填空题",
    "1、正方形的边长是4，面积是____。",
    "参考答案",
    "1. B",
    "2. B",
    "3. 16",
  ]);
  assert.equal(result.questions.length, 3);
  assert.deepEqual(result.questions.map((question) => question.number), ["1", "2", "3"]);
  assert.deepEqual(result.questions.map((question) => question.type), ["single", "single", "fill"]);
  assert.deepEqual(result.questions[0].options, [
    { key: "A", content: "3.5" },
    { key: "B", content: "4" },
    { key: "C", content: "5" },
    { key: "D", content: "6" },
  ]);
  assert.equal(result.questions[0].answer, "B");
  assert.equal(result.questions[1].stem, "1+1=（ ）");
  assert.equal(result.questions[2].answer, "16");
  assert.ok(result.warnings.some((warning) => warning.includes("重新编号")));
  assert.equal(result.stats.sections, 2);
});

test("支持题干同一行的 A./B./C./D. 选项以及【答案】【解析】", () => {
  const result = parseWordQuestions([
    "一、选择题",
    "1. 下列说法正确的是（ ）A．甲 B．乙 C．丙 D．丁",
    "【答案】B",
    "【解析】因为乙正确。",
    "二、解答题",
    "2. 请计算 2+3 并写出过程。",
    "答案：5",
    "解析：直接相加。",
  ]);
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].stem, "下列说法正确的是（ ）");
  assert.equal(result.questions[0].options.length, 4);
  assert.equal(result.questions[0].answer, "B");
  assert.equal(result.questions[0].analysis, "因为乙正确。");
  assert.equal(result.questions[1].type, "answer");
  assert.equal(result.questions[1].answer, "5");
  assert.equal(result.questions[1].analysis, "直接相加。");
});

test("答案区支持题号加解析共用一行；多选题答案合并为连续字母", () => {
  const result = parseWordQuestions([
    "一、选择题",
    "1. 1+1 A.1 B.2 C.3 D.4",
    "2. 哪些是偶数 A.1 B.2 C.3 D.4",
    "参考答案",
    "1．B 解析：两个一相加",
    "2．BD",
  ]);
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].answer, "B");
  assert.equal(result.questions[0].analysis, "两个一相加");
  assert.equal(result.questions[1].type, "multiple");
  assert.equal(result.questions[1].answer, "BD");
});

test("没有识别到题目时返回空列表而不是崩溃", () => {
  const result = parseWordQuestions(["封面", "姓名：", "这是一段没有题号的文字。"]);
  assert.deepEqual(result.questions, []);
});
