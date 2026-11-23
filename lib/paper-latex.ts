/**
 * LaTeX source rendering for a saved paper.
 *
 * The preamble comes from `paperStyleToLatex`, so page geometry, fonts and
 * column count match the print style. Question text already stores formulas as
 * `$…$`, therefore prose only needs escaping while math is copied verbatim.
 * Images are returned as separate files: a single `.tex` when the paper has no
 * figures, otherwise a `.zip` carrying the source plus `images/`.
 */
import { paperStyleToLatex, normalizePaperSettings, questionStemHasAnswerBlank, scoreForQuestion, type PaperSection, type PaperSettings } from "./paper-templates.ts";
import { repairDisplayText, scanMathText, splitOutsideBlanks } from "./math-format.ts";
import type { QuestionAsset, QuestionWithSource } from "./types";

export type PaperLatexFile = { name: string; data: Uint8Array };

export type PaperLatexResult = {
  source: string;
  files: PaperLatexFile[];
};

export type PaperLatexInput = {
  title: string;
  subtitle: string;
  questions: QuestionWithSource[];
  settings: Record<string, unknown> | PaperSettings;
  includeAnswers?: boolean;
};

export type PaperLatexOptions = {
  loadAsset?: (asset: QuestionAsset) => Promise<{ data: Uint8Array; extension: string } | null>;
};

const IMAGE_DIRECTORY = "images";
const UNSAFE_FILENAME = /[\\/:*?"<>|]/g;
const MAX_BLANK_LINES = 60;
const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function chineseNumber(value: number) {
  if (value < 10) return CHINESE_DIGITS[value];
  if (value < 20) return `十${value % 10 ? CHINESE_DIGITS[value % 10] : ""}`;
  if (value < 100) return `${CHINESE_DIGITS[Math.floor(value / 10)]}十${value % 10 ? CHINESE_DIGITS[value % 10] : ""}`;
  return String(value);
}

function escapeProse(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\n") {
      output += "\\par\n";
      continue;
    }
    if (character === "\r") continue;
    if ("&%#_{}^~$".includes(character)) {
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) backslashes += 1;
      if (backslashes % 2 === 0) {
        output += `\\${character}`;
        continue;
      }
    }
    output += character;
  }
  return output;
}

function proseParts(value: string): string {
  return splitOutsideBlanks(value)
    .map((part) => (part.type === "blank" ? "\\underline{\\hspace{2em}}" : escapeProse(part.value)))
    .join("");
}

/** Convert stored text (prose + `$…$` formulas) into LaTeX body content. */
export function textToLatex(value: string): string {
  return scanMathText(repairDisplayText(value ?? ""))
    .map((token) => {
      if (token.type === "math") return token.display ? `$$${token.value}$$` : `$${token.value}$`;
      return proseParts(token.value);
    })
    .join("");
}

function questionNumberLabel(value: number, format: PaperSettings["style"]["questionNumberStyle"]) {
  if (format === "parenthesized") return `（${value}）`;
  if (format === "chinese") return `${chineseNumber(value)}、`;
  return `${value}.`;
}

/** Base name for the emitted `.tex` / archive, safe on every filesystem. */
export function paperLatexFilename(title: string) {
  const cleaned = (title || "paper").replace(UNSAFE_FILENAME, "_").trim().slice(0, 60);
  return cleaned || "paper";
}

function imageLatex(name: string, caption: string): string[] {
  return [
    "\\begin{center}",
    `\\includegraphics[width=0.6\\linewidth]{${name}}`,
    "\\end{center}",
    caption.trim() ? `\\noindent{\\fontsize{9pt}{11pt}\\selectfont\\color{gray}${escapeProse(caption.trim())}\\par}` : "",
  ].filter(Boolean);
}

export async function buildPaperLatex(input: PaperLatexInput, options: PaperLatexOptions = {}): Promise<PaperLatexResult> {
  const questions = input.questions ?? [];
  const settings: PaperSettings = "style" in input.settings && "sections" in input.settings
    ? input.settings as PaperSettings
    : normalizePaperSettings(input.settings as Record<string, unknown>, questions);
  const style = settings.style;
  const includeAnswers = input.includeAnswers ?? settings.showAnswers;
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const files: PaperLatexFile[] = [];
  const assetNames = new Map<string, string>();
  let assetIndex = 0;

  const assetFile = async (asset: QuestionAsset) => {
    if (!options.loadAsset) return null;
    const cached = assetNames.get(asset.id);
    if (cached) return cached;
    try {
      const image = await options.loadAsset(asset);
      if (!image) return null;
      assetIndex += 1;
      const name = `${IMAGE_DIRECTORY}/${String(assetIndex).padStart(3, "0")}-${paperLatexFilename(asset.id)}.${image.extension}`;
      files.push({ name, data: image.data });
      assetNames.set(asset.id, name);
      return name;
    } catch {
      return null;
    }
  };

  const out: string[] = [];
  out.push(paperStyleToLatex(style));
  out.push(
    "\\usepackage{amsmath}",
    "\\usepackage{amssymb}",
    "\\usepackage{graphicx}",
    "\\usepackage{xcolor}",
    "\\providecommand{\\overparen}[1]{\\overset{\\frown}{#1}}",
    "\\providecommand{\\overarc}[1]{\\overset{\\frown}{#1}}",
    "\\providecommand{\\degree}{^{\\circ}}",
    "\\providecommand{\\dfrac}[2]{\\displaystyle\\frac{#1}{#2}}",
  );
  out.push("\\begin{document}");

  const align = style.titleAlign;
  const openAlign = align === "center" ? "\\begin{center}\n" : align === "right" ? "\\begingroup\\raggedleft\n" : "\\begingroup\\raggedright\n";
  const closeAlign = align === "center" ? "\\end{center}" : "\\endgroup";
  if (input.title.trim()) {
    const title = textToLatex(input.title);
    out.push(`${openAlign}{\\papertitlefont${style.titleUnderline ? `\\underline{${title}}` : title}\\par}${closeAlign}`);
    out.push("\\vspace{\\papertitlegap}");
  }
  if (input.subtitle.trim()) {
    out.push(`${openAlign}{\\fontsize{${style.subtitleSize}pt}{${(style.subtitleSize * 1.3).toFixed(2)}pt}\\selectfont${style.subtitleWeight >= 600 ? "\\bfseries" : ""} ${textToLatex(input.subtitle)}\\par}${closeAlign}`);
    out.push(`\\vspace{${style.headerBottomSpacing}mm}`);
  }
  if (style.headerStyle !== "none" && settings.infoFields.length) {
    const fields = settings.infoFields.map((field) => `${escapeProse(field)}：\\underline{\\hspace{9em}}`).join("\\qquad");
    out.push(`\\noindent{\\fontsize{${style.candidateInfoSize}pt}{${(style.candidateInfoSize * 1.4).toFixed(2)}pt}\\selectfont ${fields}\\par}`);
    out.push(`\\vspace{${Math.max(1, style.headerBottomSpacing)}mm}`);
  }

  if (settings.notice.trim() && style.noticeStyle !== "hidden") {
    const lines = settings.notice.split("\n").filter((line) => line.trim());
    if (lines.length) {
      const noticeSize = `\\fontsize{${style.candidateInfoSize}pt}{${(style.candidateInfoSize * 1.4).toFixed(2)}pt}\\selectfont`;
      const body = ["\\textbf{注意事项}", ...lines.map((line) => `${escapeProse(line)}\\par`)].join("\n");
      if (style.noticeStyle === "boxed") {
        out.push(`\\noindent\\fbox{\\parbox{\\dimexpr\\linewidth-2\\fboxsep\\relax}{${noticeSize}${body}}}`);
      } else {
        out.push(`\\noindent{${noticeSize}${body}}`);
      }
      out.push(`\\vspace{${style.noticeMarginBottom}mm}`);
    }
  }

  if (!questions.length) {
    out.push("\\noindent\\textbf{空白试卷}\\par");
    out.push("\\noindent 这份试卷还没有题目。\\par");
  }

  let globalIndex = 0;
  for (const section of settings.sections as PaperSection[]) {
    const sectionQuestions = section.questionIds
      .map((id) => questionMap.get(id))
      .filter((question): question is QuestionWithSource => Boolean(question));
    if (!sectionQuestions.length) continue;

    out.push(`\\vspace{${style.sectionGap}mm}`);
    const headingSize = `\\fontsize{${style.sectionTitleSize}pt}{${(style.sectionTitleSize * 1.3).toFixed(2)}pt}\\selectfont`;
    out.push(`\\noindent{${style.sectionTitleWeight >= 600 ? "\\bfseries " : ""}${headingSize}${escapeProse(section.title)}\\par}`);
    if (section.scoreDetail?.trim()) {
      out.push(`\\noindent{\\fontsize{${style.bodySize}pt}{${(style.bodySize * style.lineHeight).toFixed(2)}pt}\\selectfont ${escapeProse(section.scoreDetail)}\\par}`);
    }
    if (style.sectionDivider === "single") out.push("\\par\\papersectionrule\\vspace{1mm}");

    for (const [sectionIndex, question] of sectionQuestions.entries()) {
      globalIndex += 1;
      const score = scoreForQuestion(section, sectionIndex);
      const label = questionNumberLabel(globalIndex, style.questionNumberStyle);
      const scoreText = score > 0 && style.scoreStyle !== "hidden" ? `（${score} 分）` : "";
      const indent = `\\hspace*{${style.questionIndent}mm}`;
      const tail = style.scoreStyle === "right" && scoreText ? ` \\hfill ${scoreText}` : "";
      const fillBlank = question.type === "fill" && !questionStemHasAnswerBlank(question.stem) ? "\\underline{\\hspace{2em}}" : "";
      const inlineScore = style.scoreStyle === "inline" ? scoreText : "";
      out.push(`\\noindent\\makebox[${style.questionIndent}mm][l]{${label}}${textToLatex(question.stem)}${fillBlank}${inlineScore}${tail}\\par`);

      for (const asset of question.assets.filter((item) => item.role === "question")) {
        if ((settings.assetLayouts[asset.id]?.placement ?? "after-stem") !== "after-stem") continue;
        const name = await assetFile(asset);
        if (name) out.push(...imageLatex(name, settings.assetLayouts[asset.id]?.caption ?? `第 ${globalIndex} 题的图片`));
      }

      const optionItems = question.options ?? [];
      if (optionItems.length) {
        const columns = Math.min(style.optionColumns, optionItems.length);
        const cells = optionItems.map((option) => `${escapeProse(option.key)}. ${textToLatex(option.content)}`);
        if (columns <= 1) {
          for (const cell of cells) out.push(`\\noindent${indent}${cell}\\par`);
        } else {
          out.push(`\\noindent${indent}${cells.join("\\hfill ")}\\par`);
        }
      }

      for (const asset of question.assets.filter((item) => item.role === "question")) {
        if ((settings.assetLayouts[asset.id]?.placement ?? "after-stem") !== "before-answer") continue;
        const name = await assetFile(asset);
        if (name) out.push(...imageLatex(name, settings.assetLayouts[asset.id]?.caption ?? `第 ${globalIndex} 题的图片`));
      }

      const configuredBlank = settings.answerSpaces[question.id];
      if (question.type === "answer" && !includeAnswers && Number.isFinite(configuredBlank)) {
        const lines = Math.min(MAX_BLANK_LINES, Math.max(0, Math.round(configuredBlank)));
        if (lines) out.push(`\\vspace{${lines}\\baselineskip}`);
      }

      if (includeAnswers) {
        out.push(`\\noindent\\textbf{答案：}${textToLatex(question.answer || "未录入")}\\par`);
        out.push(`\\noindent\\textbf{解析：}${textToLatex(question.analysis || "未录入")}\\par`);
        for (const asset of question.assets.filter((item) => item.role === "answer")) {
          const name = await assetFile(asset);
          if (name) out.push(...imageLatex(name, settings.assetLayouts[asset.id]?.caption ?? `第 ${globalIndex} 题答案图`));
        }
      }
    }
  }

  if (style.footerText.trim() || style.showPageNumber) {
    const parts: string[] = [];
    if (style.footerText.trim()) parts.push(escapeProse(style.footerText.trim()));
    if (style.showPageNumber) parts.push("\\thepage");
    out.push(`\\vfill\\noindent{\\fontsize{9pt}{11pt}\\selectfont\\color{gray}${parts.join("\\hfill ")}}\\par`);
  }

  out.push("\\end{document}");

  return { source: `${out.join("\n")}\n`, files };
}
