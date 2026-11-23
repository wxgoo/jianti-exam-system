import { strFromU8, unzipSync } from "fflate";
import type { QuestionType } from "./types";

/**
 * Word（.docx）题库导入的纯解析逻辑。
 *
 * 与参考程序「江苏小学练习生成器」一致的做法：按文档顺序读取段落与表格，
 * 再根据题号、选项行、题型小标题和答案区把文字拆成一道道题。识别是启发式的，
 * 因此解析结果统一进入人工审核，不直接进入已审核题库。
 */

export type ParsedWordQuestion = {
  number: string;
  type: QuestionType;
  stem: string;
  options: Array<{ key: string; content: string }>;
  answer: string;
  analysis: string;
};

export type WordParseResult = {
  questions: ParsedWordQuestion[];
  warnings: string[];
  stats: { lines: number; sections: number; images: number };
};

type DraftQuestion = {
  originalNumber: string;
  sectionIndex: number;
  sectionType: QuestionType | null;
  stem: string;
  options: Array<{ key: string; content: string }>;
  answer: string;
  analysis: string;
};

type AnswerEntry = { number: string; text: string; analysis: string };

const SECTION_TYPE_ALIASES: Array<[QuestionType, RegExp]> = [
  ["multiple", /多项选择|多选/],
  ["single", /单项选择|单选|选择/],
  ["fill", /填空|判断|改错/],
  ["answer", /解答|计算|应用|简答|证明|作图|操作|综合|阅读|作文|探究|实验|解决问题/],
];

const NOISE_PATTERNS = [
  /^\s*第\s*\d+\s*页(\s*[，,]?\s*共\s*\d+\s*页)?\s*$/,
  /^\s*共\s*\d+\s*页\s*$/,
  /^\s*[-—–]\s*\d+\s*[-—–]\s*$/,
  /^\s*[（(]?\s*\d+\s*分\s*[)）]?\s*$/,
  /^\s*(?:姓名|班级|学号|学校|考场|座位号|考试时间|满分|时间)\s*[:：]?\s*\S{0,40}$/,
];

function decodeXmlEntities(value: string) {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (full, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
    }
    const map: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    return map[entity] ?? full;
  });
}

function findOpenTag(xml: string, tag: string, from: number) {
  const pattern = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  pattern.lastIndex = Math.max(0, from);
  const match = pattern.exec(xml);
  return match ? match.index : -1;
}

function extractBalanced(xml: string, start: number, tag: string) {
  const pattern = new RegExp(`</?${tag}(?:\\s[^>]*)?>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const token = match[0];
    if (token.startsWith("</")) {
      depth--;
      if (depth <= 0) return pattern.lastIndex;
    } else if (!token.endsWith("/>")) {
      depth++;
    }
  }
  return xml.length;
}

function splitLines(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);
}

function paragraphText(fragment: string) {
  const normalized = fragment
    .replace(/<w:tab(?:\s[^>]*?)?\s*\/?>/g, "\u0001")
    .replace(/<w:(?:br|cr)(?:\s[^>]*?)?\s*\/?>/g, "\u0002")
    .replace(/<w:noBreakHyphen\s*\/?>/g, "-")
    .replace(/<w:softHyphen\s*\/?>/g, "");
  const parts: string[] = [];
  const pattern = /<w:t(?:\s[^>]*?)?>([\s\S]*?)<\/w:t>|([\u0001\u0002])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized))) {
    if (match[1] !== undefined) parts.push(match[1]);
    else parts.push(match[2] === "\u0001" ? "\t" : "\n");
  }
  return decodeXmlEntities(parts.join(""));
}

function tableTextLines(tableXml: string) {
  const lines: string[] = [];
  let rowStart = findOpenTag(tableXml, "w:tr", 0);
  while (rowStart >= 0) {
    const rowEnd = extractBalanced(tableXml, rowStart, "w:tr");
    const rowXml = tableXml.slice(rowStart, rowEnd);
    let cellStart = findOpenTag(rowXml, "w:tc", 0);
    let previousCell = "";
    while (cellStart >= 0) {
      const cellEnd = extractBalanced(rowXml, cellStart, "w:tc");
      const cellXml = rowXml.slice(cellStart, cellEnd);
      const cellParts: string[] = [];
      let paragraphStart = findOpenTag(cellXml, "w:p", 0);
      while (paragraphStart >= 0) {
        const paragraphEnd = extractBalanced(cellXml, paragraphStart, "w:p");
        cellParts.push(paragraphText(cellXml.slice(paragraphStart, paragraphEnd)));
        paragraphStart = findOpenTag(cellXml, "w:p", paragraphEnd);
      }
      const text = cellParts.join("\n").trim();
      // 合并单元格在 python-docx 里会重复出现，连续重复内容只保留一次。
      if (text && text !== previousCell) lines.push(...splitLines(text));
      previousCell = text;
      cellStart = findOpenTag(rowXml, "w:tc", cellEnd);
    }
    rowStart = findOpenTag(tableXml, "w:tr", rowEnd);
  }
  return lines;
}

export function readDocx(bytes: Uint8Array) {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new Error("文件不是有效的 Word（.docx）文档");
  }
  const documentXml = archive["word/document.xml"];
  if (!documentXml) throw new Error("Word 文档中缺少正文内容");
  const xml = strFromU8(documentXml);
  const bodyStart = findOpenTag(xml, "w:body", 0);
  if (bodyStart < 0) throw new Error("Word 文档中缺少正文内容");
  const bodyOpenEnd = xml.indexOf(">", bodyStart) + 1;
  const bodyClose = xml.indexOf("</w:body>", bodyOpenEnd);
  const bodyEnd = bodyClose >= 0 ? bodyClose : xml.length;

  const lines: string[] = [];
  let position = bodyOpenEnd;
  while (position < bodyEnd) {
    const paragraph = findOpenTag(xml, "w:p", position);
    const table = findOpenTag(xml, "w:tbl", position);
    if (paragraph < 0 && table < 0) break;
    const tableFirst = table >= 0 && (paragraph < 0 || table < paragraph);
    if (tableFirst) {
      if (table >= bodyEnd) break;
      const end = extractBalanced(xml, table, "w:tbl");
      lines.push(...tableTextLines(xml.slice(table, end)));
      position = Math.max(end, table + 1);
    } else {
      if (paragraph >= bodyEnd) break;
      const end = extractBalanced(xml, paragraph, "w:p");
      lines.push(...splitLines(paragraphText(xml.slice(paragraph, end))));
      position = Math.max(end, paragraph + 1);
    }
  }
  return {
    lines,
    imageCount: Object.keys(archive).filter((name) => name.startsWith("word/media/")).length,
  };
}

export function extractDocxLines(bytes: Uint8Array) {
  return readDocx(bytes).lines;
}

function parseQuestionNumber(line: string) {
  let match = line.match(/^\s*第\s*(\d{1,3})\s*题\s*[.．、:：)）]?\s*(.*)$/);
  if (match) return { number: match[1], text: match[2] };
  match = line.match(/^\s*[（(]\s*(\d{1,3})\s*[)）]\s*(.*)$/);
  if (match) return { number: match[1], text: match[2] };
  // 半角点后紧跟数字（3.5）不是题号；全角“．”后跟数字是合法的“2．1+1=”题号。
  match = line.match(/^\s*(\d{1,3})\s*(?:\.(?!\d)|[．、:：)）])\s*(.*)$/);
  if (match) return { number: match[1], text: match[2] };
  // 部分 Word 试卷用“1 下列…”这种空格分隔的题号，避免误判“3 月”等短片段。
  match = line.match(/^\s*(\d{1,3})\s+([^\d\s][^\n]{5,})$/);
  if (match) return { number: match[1], text: match[2] };
  return null;
}

function parseOption(text: string) {
  let match = text.match(/^\s*[（(]\s*([A-Ha-h])\s*[)）]\s*(.*)$/);
  if (match) return { key: match[1].toUpperCase(), content: match[2].trim() };
  match = text.match(/^\s*([A-Ha-h])\s*[.．、:：)）]\s*(.*)$/);
  if (match) return { key: match[1].toUpperCase(), content: match[2].trim() };
  match = text.match(/^\s*([A-Ha-h])\s+(.+)$/);
  if (match) return { key: match[1].toUpperCase(), content: match[2].trim() };
  match = text.match(/^\s*([A-Ha-h])\s*[.．、:：]?\s*$/);
  if (match) return { key: match[1].toUpperCase(), content: "" };
  return null;
}

function splitInlineOptions(text: string) {
  // 选项可能紧跟在“）”后面而没有空格，例如“下列说法正确的是（ ）A．甲 B．乙”。
  return text
    .replace(/([)）\s])([A-H][.．、:：]|[（(][A-H][)）])/g, "$1\u0003$2")
    .split("\u0003")
    .filter(Boolean);
}

function detectSection(line: string) {
  let text = line
    .replace(/^\s*[一二三四五六七八九十]{1,3}\s*[、.．]\s*/, "")
    .replace(/^\s*第\s*[一二三四五六七八九十ⅠⅡⅢⅣ\d]+\s*[部分卷]\s*/, "")
    .trim();
  if (!text || text.length > 40 || parseQuestionNumber(line)) return null;
  text = text.replace(/[（(][^)）]*[)）]/g, "").replace(/[\s:：]+$/, "").trim();
  if (!text || text.length > 14) return null;
  for (const [type, pattern] of SECTION_TYPE_ALIASES) {
    if (pattern.test(text)) return type;
  }
  return null;
}

function labeledValue(line: string, labels: string[]) {
  const pattern = new RegExp(`^\\s*(?:[【\\[]\\s*)?(?:${labels.join("|")})\\s*(?:[】\\]]\\s*)?[:：]?\\s*([\\s\\S]*)$`);
  const match = line.match(pattern);
  return match ? match[1].trim() : null;
}

function normalizeAnswer(text: string) {
  const cleaned = text
    .replace(/[【\[]?\s*(?:参考)?答案\s*[】\]]?\s*[:：]?\s*/g, "")
    .replace(/[。;；]$/, "")
    .trim();
  const letters = cleaned.replace(/[\s、,，和]/g, "");
  if (/^[A-H]+$/.test(letters)) return letters.toUpperCase();
  return cleaned.replace(/\s+/g, " ").slice(0, 500);
}

function isNoise(line: string) {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function resolveType(draft: DraftQuestion, answer: string): QuestionType {
  const options = draft.options.filter((option) => option.content.trim());
  if (options.length >= 2) {
    const answerLetters = /^[A-H]+$/.test(answer) ? answer.length : 0;
    if (draft.sectionType === "multiple" || answerLetters >= 2) return "multiple";
    return "single";
  }
  if (draft.sectionType === "fill" || draft.sectionType === "answer") return draft.sectionType;
  if (/_{2,}|＿{2,}|（\s*）|\(\s*\)/.test(draft.stem)) return "fill";
  return "answer";
}

export function parseWordQuestions(lines: string[]): WordParseResult {
  const warnings: string[] = [];
  const drafts: DraftQuestion[] = [];
  const answerEntries: AnswerEntry[] = [];
  let current: DraftQuestion | null = null;
  let currentAnswer: AnswerEntry | null = null;
  let mode: "questions" | "answers" = "questions";
  let answerPart: "answer" | "analysis" = "answer";
  let inlinePart: "none" | "answer" | "analysis" = "none";
  let sectionIndex = 0;
  let sectionType: QuestionType | null = null;

  const flushQuestion = () => {
    if (current) {
      current.stem = current.stem.trim();
      if (current.stem) drafts.push(current);
    }
    current = null;
    inlinePart = "none";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isNoise(line)) continue;

    if (mode === "questions" && /^\s*(?:参考)?答案(?:与解析|及解析|解析)?\s*[:：]?\s*$/.test(line)) {
      flushQuestion();
      mode = "answers";
      currentAnswer = null;
      continue;
    }

    const section = detectSection(line);
    if (section) {
      flushQuestion();
      sectionIndex++;
      sectionType = section;
      currentAnswer = null;
      answerPart = "answer";
      continue;
    }

    const questionNumber = mode === "questions" ? parseQuestionNumber(line) : null;
    if (questionNumber) {
      flushQuestion();
      const draft: DraftQuestion = {
        originalNumber: questionNumber.number,
        sectionIndex,
        sectionType,
        stem: questionNumber.text.trim(),
        options: [],
        answer: "",
        analysis: "",
      };
      // 题干同一行里紧跟的 A./B./C./D. 选项也要拆出来。
      const pieces = splitInlineOptions(draft.stem);
      if (pieces.length > 1 && parseOption(pieces[1])) {
        draft.stem = pieces[0].trim();
        for (const piece of pieces.slice(1)) {
          const option = parseOption(piece);
          if (option) draft.options.push(option);
          else draft.stem += ` ${piece}`;
        }
      }
      current = draft;
      continue;
    }

    if (mode === "answers") {
      const answerNumber = parseQuestionNumber(line);
      if (answerNumber) {
        const splitAnalysis = answerNumber.text.match(/^([\s\S]*?)\s*(?:解析|详解|分析)\s*[:：]\s*([\s\S]*)$/);
        currentAnswer = splitAnalysis
          ? { number: answerNumber.number, text: splitAnalysis[1].trim(), analysis: splitAnalysis[2].trim() }
          : { number: answerNumber.number, text: answerNumber.text.trim(), analysis: "" };
        answerEntries.push(currentAnswer);
        answerPart = currentAnswer.analysis ? "analysis" : "answer";
        continue;
      }
      if (currentAnswer) {
        const analysisValue = labeledValue(line, ["解析", "详解", "分析", "解答"]);
        if (analysisValue !== null) {
          currentAnswer.analysis = analysisValue;
          answerPart = "analysis";
          continue;
        }
        if (answerPart === "analysis") currentAnswer.analysis += ` ${line}`;
        else currentAnswer.text += ` ${line}`;
      }
      continue;
    }

    if (!current) continue;

    const answerValue = labeledValue(line, ["参考答案", "答案"]);
    if (answerValue !== null) {
      current.answer = answerValue;
      inlinePart = answerValue ? "none" : "answer";
      continue;
    }
    const analysisValue = labeledValue(line, ["解析", "详解", "分析", "解答"]);
    if (analysisValue !== null) {
      current.analysis = analysisValue;
      inlinePart = analysisValue ? "none" : "analysis";
      continue;
    }
    if (inlinePart !== "none") {
      if (inlinePart === "answer") current.answer += ` ${line}`;
      else current.analysis += ` ${line}`;
      continue;
    }

    const optionPieces = splitInlineOptions(line);
    let handledOption = false;
    for (const piece of optionPieces) {
      const option = parseOption(piece);
      if (!option) continue;
      current.options.push(option);
      handledOption = true;
    }
    if (handledOption) continue;

    if (current.options.length) {
      const last = current.options[current.options.length - 1];
      last.content = `${last.content} ${line}`.trim();
    } else {
      current.stem += ` ${line}`;
    }
  }
  flushQuestion();

  const questions = drafts.filter((draft) => draft.stem.trim());
  if (questions.length !== drafts.length) warnings.push(`已忽略 ${drafts.length - questions.length} 道没有题干的题目`);

  const resolved = questions.map((draft, index) => ({
    draft,
    answer: "",
    analysis: "",
  }));

  // 题目自带的“答案：/【解析】”优先；答案区按顺序补齐剩余题目。
  resolved.forEach((item) => {
    item.answer = item.draft.answer.trim();
    item.analysis = item.draft.analysis.trim();
  });
  answerEntries.forEach((entry, index) => {
    if (index >= resolved.length) return;
    const item = resolved[index];
    if (!item.answer && entry.text.trim()) item.answer = normalizeAnswer(entry.text);
    if (!item.analysis && entry.analysis.trim()) item.analysis = entry.analysis.trim();
  });
  // 顺序对不上时（例如答案区只写了部分题号），再按原始题号补一次。
  const answersByNumber = new Map<string, AnswerEntry>();
  for (const entry of answerEntries) {
    if (entry.text.trim() && !answersByNumber.has(entry.number)) answersByNumber.set(entry.number, entry);
  }
  for (const item of resolved) {
    if (item.answer) continue;
    const entry = answersByNumber.get(item.draft.originalNumber);
    if (entry) {
      item.answer = normalizeAnswer(entry.text);
      if (!item.analysis) item.analysis = entry.analysis.trim();
    }
  }

  const missingAnswers = resolved.filter((item) => !item.answer).length;
  if (missingAnswers) warnings.push(`有 ${missingAnswers} 道题未找到答案，请在审核页补充`);
  if (new Set(questions.map((draft) => draft.originalNumber)).size !== questions.length) {
    warnings.push("原题号在不同大题中重复，已按文档顺序重新编号为 1…N");
  }

  return {
    questions: resolved.map((item, index) => ({
      number: String(index + 1),
      type: resolveType(item.draft, item.answer),
      stem: item.draft.stem.replace(/\s+/g, " ").trim(),
      options: item.draft.options
        .filter((option) => option.content.trim())
        .map((option, optionIndex) => ({ key: String.fromCharCode(65 + optionIndex), content: option.content.trim() })),
      answer: item.answer,
      analysis: item.analysis.replace(/\s+/g, " ").trim(),
    })),
    warnings,
    stats: { lines: lines.length, sections: sectionIndex, images: 0 },
  };
}
