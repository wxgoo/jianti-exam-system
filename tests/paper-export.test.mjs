import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { Document, Packer, Paragraph } from "docx";
import { latexToRuns, latexToPlainText, texToOmml } from "../lib/tex-to-omml.ts";
import { buildPaperDocx } from "../lib/paper-docx.ts";
import { buildPaperLatex, textToLatex, paperLatexFilename } from "../lib/paper-latex.ts";
import { normalizePaperSettings, presetPaperTemplates } from "../lib/paper-templates.ts";

const source = { documentId: "d", documentName: "卷", subject: "数学", grade: "九年级" };
const png = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8db00000000049454e44ae426082",
  "hex",
);

function buildQuestions() {
  const asset = {
    id: "asset-1", kind: "figure", role: "question", page: 1,
    bbox: { x: 0, y: 0, width: 1, height: 1 }, label: "图", cropKey: "crop/1.png",
  };
  return [
    {
      id: "q1", number: "1", type: "single", stem: "如图，$\\angle ABC=90^\\circ$，正确的是（  ）",
      options: [
        { key: "A", content: "$\\dfrac{1}{2}$" },
        { key: "B", content: "$\\sqrt{2}$" },
        { key: "C", content: "3" },
        { key: "D", content: "4" },
      ],
      answer: "B", analysis: "由 $S=\\dfrac{1}{2}ab\\sin C$ 得。", page: 1,
      bbox: { x: 0, y: 0, width: 1, height: 1 }, regions: [], assets: [asset], tags: [],
      confidence: 1, needsHumanReview: false, status: "approved", source,
    },
    {
      id: "q2", number: "2", type: "fill", stem: "计算：$30^\\circ$ 的余角是 ____ 度。",
      answer: "60", analysis: "", page: 1, bbox: { x: 0, y: 0, width: 1, height: 1 },
      regions: [], assets: [], tags: [], confidence: 1, needsHumanReview: false, status: "approved", source,
    },
    {
      id: "q3", number: "3", type: "answer", stem: "已知 $y=\\begin{cases}1,&x>0\\\\0,&x\\le 0\\end{cases}$，求 $S_{\\triangle ABC}$。",
      answer: "$S=6$", analysis: "分情况讨论。", page: 1, bbox: { x: 0, y: 0, width: 1, height: 1 },
      regions: [], assets: [], tags: [], confidence: 1, needsHumanReview: false, status: "approved", source,
    },
  ];
}

function buildSettings(questions) {
  const template = presetPaperTemplates[0];
  return normalizePaperSettings({
    sections: template.config.sections.map((section) => ({
      ...section,
      questionIds: questions.filter((question) => section.acceptedTypes.includes(question.type)).map((question) => question.id),
    })),
    notice: template.config.notice,
    infoFields: template.config.infoFields,
    showAnswers: false,
    answerSpaces: { q3: 8 },
    compact: false,
    style: template.config.style,
  }, questions);
}

/** Pack runs into a one-paragraph document so assertions read real Word XML. */
async function runsXml(runs) {
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: runs })] }] }));
  return strFromU8(unzipSync(bytes)["word/document.xml"]);
}

test("常见公式转成 OMML，非法公式回退为空", () => {
  assert.match(texToOmml(String.raw`\frac{a}{b}+\sqrt{x^2}\leq 3`, false) ?? "", /^<m:oMath/);
  assert.match(texToOmml(String.raw`y=\begin{cases}1,&x>0\\0,&x\le 0\end{cases}`, false) ?? "", /^<m:oMath/);
  assert.match(texToOmml(String.raw`\underline{\hspace{2em}}`, false) ?? "", /^<m:oMath/);
  assert.equal(texToOmml(String.raw`\frac{a}`, false), null);
  assert.equal(texToOmml("", false), null);
});

test("题干按文本、公式和答题空格拆成 Word run", () => {
  const runs = latexToRuns("已知 $x>0$ 和 ______ 成立");
  assert.deepEqual(runs.map((run) => run.constructor.name), [
    "TextRun", "ImportedXmlComponent", "TextRun", "TextRun", "TextRun",
  ]);
});

test("答题空格落成全角空格，坏公式保留 LaTeX 源码", async () => {
  const blankXml = await runsXml(latexToRuns("填空 ______ 完成"));
  assert.ok(blankXml.includes("\u3000\u3000"), "空格用全角空格保持两字宽");

  const fallbackXml = await runsXml(latexToRuns("坏公式 $\\frac{a}$ 结束"));
  assert.ok(fallbackXml.includes("\\frac{a}"), "转换失败时保留源码");
  assert.ok(!fallbackXml.includes("<m:oMath"), "失败时不注入坏公式");
});

test("数学公式以 OMML 对象写入 Word", async () => {
  const xml = await runsXml(latexToRuns("已知 $x>0$ 成立"));
  assert.ok(xml.includes("<m:oMath"));
  assert.ok(xml.includes("已知"));
});

test("纯文本抽取去掉定界符", () => {
  assert.equal(latexToPlainText("$S_{\\triangle ABC}$"), "S_triangle ABC");
});

test("Word 导出生成可解压的 docx，含公式、页设置和答案", async () => {
  const questions = buildQuestions();
  const settings = buildSettings(questions);
  const bytes = await buildPaperDocx(
    { title: "九年级数学期中试卷", subtitle: "满分 150 分", questions, settings, includeAnswers: true },
    { loadAsset: async () => ({ data: new Uint8Array(png), type: "png", width: 4, height: 4 }) },
  );
  assert.ok(bytes.byteLength > 4000, "docx 不应过小");
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b], "应是 ZIP 容器");
  const files = unzipSync(bytes);
  const xml = strFromU8(files["word/document.xml"]);
  assert.ok(xml.includes("<m:oMath"), "公式以 OMML 注入");
  assert.ok(xml.includes("注意事项"), "保留注意事项");
  assert.ok(xml.includes("答案："), "保留答案解析");
  assert.ok(xml.includes("<w:pgSz"), "保留页面设置");
  assert.ok(xml.includes("w:drawing"), "插入题目图片");
  assert.ok(strFromU8(files["word/footer1.xml"] ?? new Uint8Array()).includes("页"), "页脚含页码");
});

test("Word 导出在隐藏答案时不写答案块", async () => {
  const questions = buildQuestions();
  const settings = buildSettings(questions);
  const bytes = await buildPaperDocx(
    { title: "卷", subtitle: "", questions, settings, includeAnswers: false },
  );
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  assert.ok(!xml.includes("答案："));
  assert.ok(!xml.includes("<w:drawing"), "没有加载器时跳过图片");
});

test("LaTeX 导出保留公式、分值说明并输出图片文件", async () => {
  const questions = buildQuestions();
  const settings = buildSettings(questions);
  const result = await buildPaperLatex(
    { title: "九年级数学期中试卷", subtitle: "满分 150 分", questions, settings, includeAnswers: true },
    { loadAsset: async () => ({ data: new Uint8Array(png), extension: "png" }) },
  );
  assert.ok(result.source.startsWith("\\documentclass[UTF8]{ctexart}"));
  assert.ok(result.source.includes("\\usepackage{amsmath}"));
  assert.ok(result.source.includes(String.raw`$\angle ABC=90^\circ$`), "公式原样保留");
  assert.ok(result.source.includes("本大题共 6 题"), "板块分值说明保留");
  assert.ok(result.source.includes("\\textbf{答案：}"), "答案随卷输出");
  assert.ok(result.source.includes("\\includegraphics"), "题目图片写入引用");
  assert.ok(result.source.trimEnd().endsWith("\\end{document}"));
  assert.equal(result.files.length, 1);
  assert.match(result.files[0].name, /^images\/001-asset-1\.png$/);
});

test("LaTeX 正文转义特殊字符但不动公式", () => {
  assert.equal(textToLatex("及格率 100% 的班级"), "及格率 100\\% 的班级");
  assert.equal(textToLatex("值 a_b"), "值 a\\_b");
  assert.equal(textToLatex("结果 $\\dfrac{1}{2}$ 完成"), "结果 $\\dfrac{1}{2}$ 完成");
  assert.equal(paperLatexFilename("2024 春/期中"), "2024 春_期中");
});
