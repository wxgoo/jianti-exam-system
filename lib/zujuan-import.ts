import type { ParsedWordQuestion } from "./word-import.ts";
import { parseWordQuestions } from "./word-import.ts";

/**
 * 解析油猴脚本 zxxk-zujuan-export.user.js 导出的离线题目 HTML / 答案合集 HTML。
 * 脚本只在用户自己打开的页面里导出当前页内容，这里只做本地文件解析，不访问外部站点。
 */

export type ZujuanHtmlResult = {
  questions: ParsedWordQuestion[];
  cards: number;
  imagesIgnored: number;
};

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export function htmlToLines(html: string) {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<img\b[^>]*>/gi, " [图片] ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);
}

function stripMarkup(html: string) {
  return htmlToLines(html).join(" ").replace(/\s+/g, " ").trim();
}

function parseCard(card: string): ParsedWordQuestion | null {
  const meta = card.match(/【(\d+)】\s*QID:\s*([^\s<]+)(?:\s*\/\s*答\s*[:：]\s*([^<]*))?/i)
    ?? card.match(/QID:\s*([^\s<]+)/i);
  const metaAnswer = meta && meta[3] ? meta[3].trim() : "";

  const qStart = card.search(/<div class="q">/i);
  const ansStart = card.search(/<div class="ans">/i);
  let questionHtml = card;
  if (qStart >= 0) {
    const qEnd = ansStart > qStart ? ansStart : card.length;
    questionHtml = card.slice(qStart, qEnd).replace(/^<div class="q">/i, "");
  } else {
    questionHtml = questionHtml.replace(/^<div style="font-weight:700[^>]*>[\s\S]*?<\/div>/i, "");
  }
  const answerHtml = ansStart >= 0 ? card.slice(ansStart).replace(/^<div class="ans">/i, "") : "";

  const stemText = stripMarkup(questionHtml)
    .replace(new RegExp(`【\\d+】\\s*QID:\\s*${meta?.[2] ? meta[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "\\S+"}`, "i"), "")
    .replace(/\/\s*答\s*[:：][^【]*/i, "")
    .trim();
  if (!stemText) return null;

  const answerText = metaAnswer || stripMarkup(answerHtml).replace(/^答案\s*[:：]?\s*/i, "").trim();
  const analysisText = answerText.includes("解析")
    ? answerText.split(/解析\s*[:：]/i).slice(1).join(" ").trim()
    : "";
  const answer = (analysisText ? answerText.split(/解析\s*[:：]/i)[0] : answerText).trim();

  const lines = [stemText];
  if (answer) lines.push(`答案：${answer}`);
  if (analysisText) lines.push(`解析：${analysisText}`);
  const parsed = parseWordQuestions(lines);
  if (!parsed.questions.length) return null;
  return parsed.questions[0];
}

export function parseZujuanHtml(html: string): ZujuanHtmlResult {
  const cards = html.split(/<div class="card">/i).slice(1);
  const source = cards.length ? cards : [html];
  const questions: ParsedWordQuestion[] = [];
  const seen = new Set<string>();
  for (const card of source) {
    const question = parseCard(card);
    if (!question) continue;
    const key = `${question.stem.slice(0, 80)}|${question.answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
  }
  return {
    questions: questions.map((question, index) => ({ ...question, number: String(index + 1) })),
    cards: source.length,
    imagesIgnored: (html.match(/<img\b/gi) ?? []).length,
  };
}
