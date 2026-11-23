/**
 * Word (.docx) rendering for a saved paper.
 *
 * The layout mirrors `components/PaperPrintable.tsx` — same title block,
 * candidate fields, notice, section headings with score details, question
 * numbering, option grid, answer blanks, asset captions and answer block — so
 * the printed page and the downloaded Word file stay consistent.
 *
 * Everything here is pure: image bytes are supplied by the caller through
 * `loadAsset`, which keeps the module free of `server-only` imports and usable
 * from tests.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LineRuleType,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  TabStopType,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  type IRunOptions,
} from "docx";
import { latexToRuns, type ExportRun } from "./tex-to-omml.ts";
import {
  defaultAssetLayout,
  normalizePaperSettings,
  questionStemHasAnswerBlank,
  scoreForQuestion,
  type PaperAssetLayout,
  type PaperSection,
  type PaperSettings,
} from "./paper-templates.ts";
import type { QuestionAsset, QuestionWithSource } from "./types";

export type PreparedImage = {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
  width: number;
  height: number;
};

export type PaperDocxInput = {
  title: string;
  subtitle: string;
  questions: QuestionWithSource[];
  settings: Record<string, unknown> | PaperSettings;
  includeAnswers?: boolean;
};

export type PaperDocxOptions = {
  /** Resolve an asset to image bytes; when absent the export omits images. */
  loadAsset?: (asset: QuestionAsset) => Promise<PreparedImage | null>;
};

const TWIPS_PER_MM = 56.692913;
const COLUMN_GAP = 720;
/** Word measures images at 96dpi, so one pixel is fifteen twips. */
const TWIPS_PER_PX = 15;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const ANSWER_BORDER = { style: BorderStyle.SINGLE, size: 12, color: "4CAF50", space: 8 } as const;
const MAX_ANSWER_LINES = 60;

const mm = (value: number) => Math.round(value * TWIPS_PER_MM);
const halfPoints = (value: number) => Math.round(value * 2);

function firstFontFamily(value: string) {
  const match = /"([^"]+)"|'([^']+)'|([^,\s]+)/.exec((value ?? "").trim());
  const family = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  return /^(serif|sans-serif|monospace|system-ui|cursive|fantasy)$/i.test(family) ? "SimSun" : family;
}

function alignmentFor(value: PaperSettings["style"]["titleAlign"]) {
  return value === "left" ? AlignmentType.LEFT : value === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER;
}

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

/** Decode a `data:` URL or a storage key into image bytes. */
async function readAsset(asset: QuestionAsset, loader?: PaperDocxOptions["loadAsset"]): Promise<PreparedImage | null> {
  if (!loader) return null;
  try {
    return await loader(asset);
  } catch {
    return null;
  }
}

export async function buildPaperDocx(input: PaperDocxInput, options: PaperDocxOptions = {}): Promise<Uint8Array> {
  const questions = input.questions ?? [];
  const settings: PaperSettings = "style" in input.settings && "sections" in input.settings
    ? input.settings as PaperSettings
    : normalizePaperSettings(input.settings as Record<string, unknown>, questions);
  const style = settings.style;
  const includeAnswers = input.includeAnswers ?? settings.showAnswers;

  const bodyFont = firstFontFamily(style.bodyFont);
  const titleFont = firstFontFamily(style.titleFont);
  const bodyLine = Math.round(style.lineHeight * 240);
  const bodySpacing = { line: bodyLine, lineRule: LineRuleType.AUTO } as const;
  const bodyLetterSpacing = style.letterSpacing ? Math.round(style.letterSpacing * style.bodySize * 20) : 0;
  const bodyRun: IRunOptions = {
    font: bodyFont,
    size: halfPoints(style.bodySize),
    ...(bodyLetterSpacing ? { characterSpacing: bodyLetterSpacing } : {}),
  };
  const runs = (text: string, extra: IRunOptions = {}): ExportRun[] =>
    latexToRuns(text ?? "", { run: { ...bodyRun, ...extra } });

  const portrait = style.pageSize === "A3" ? { width: 16838, height: 23811 } : { width: 11906, height: 16838 };
  const landscape = style.orientation === "landscape";
  const pageWidth = landscape ? portrait.height : portrait.width;
  const pageHeight = landscape ? portrait.width : portrait.height;
  const marginLeft = mm(style.marginLeft);
  const marginRight = mm(style.marginRight);
  const contentWidth = pageWidth - marginLeft - marginRight;
  const columnCount = style.columns === 2 ? 2 : 1;
  const columnWidth = columnCount === 2 ? Math.floor((contentWidth - COLUMN_GAP) / 2) : contentWidth;
  const indent = Math.min(mm(style.questionIndent), Math.floor(columnWidth / 3));
  const rightTab = columnWidth;
  const questionAfter = mm(style.questionGap);
  const sectionBefore = mm(style.sectionGap);

  const children: Array<Paragraph | Table> = [];
  const questionMap = new Map(questions.map((question) => [question.id, question]));

  const imageCache = new Map<string, PreparedImage | null>();
  const loadCached = async (asset: QuestionAsset) => {
    if (!imageCache.has(asset.id)) imageCache.set(asset.id, await readAsset(asset, options.loadAsset));
    return imageCache.get(asset.id) ?? null;
  };

  const imageParagraphs = async (asset: QuestionAsset, questionNumber: number, layout: PaperAssetLayout) => {
    const image = await loadCached(asset);
    if (!image) return [];
    let width = image.width;
    let height = image.height;
    if (!width || !height) return [];
    const scale = Math.max(1, Math.min(400, layout.scale || 100)) / 100;
    // Print caps a crop at 280x180 CSS pixels; keep the same visual weight.
    const fit = Math.min(1, 280 / width, 180 / height);
    width = Math.round(width * fit * scale);
    height = Math.round(height * fit * scale);
    const maxWidth = Math.floor((columnWidth - indent) / TWIPS_PER_PX);
    if (width > maxWidth && maxWidth > 0) {
      height = Math.max(1, Math.round((height * maxWidth) / width));
      width = maxWidth;
    }
    const offsetLeft = Math.max(0, Math.round((layout.x || 0) * TWIPS_PER_PX));
    const offsetTop = Math.max(0, Math.round((layout.y || 0) * TWIPS_PER_PX));
    const caption = layout.caption || `第 ${questionNumber} 题的图片`;
    return [
      new Paragraph({
        indent: { left: indent + offsetLeft },
        ...(offsetTop ? { spacing: { before: offsetTop } } : {}),
        children: [
          new ImageRun({
            type: image.type,
            data: image.data,
            transformation: { width, height },
            altText: { title: caption, description: caption, name: caption },
          }),
        ],
      }),
      new Paragraph({
        indent: { left: indent + offsetLeft },
        spacing: { after: questionAfter },
        children: [new TextRun({ ...bodyRun, size: halfPoints(9), color: "666666", text: caption })],
      }),
    ];
  };

  const pushAsset = async (target: Array<Paragraph | Table>, asset: QuestionAsset, questionNumber: number, layout: PaperAssetLayout) => {
    const paragraphs = await imageParagraphs(asset, questionNumber, layout);
    target.push(...paragraphs);
  };

  // ---- Title block -------------------------------------------------------
  if (style.headerStyle === "exam" && style.headerLabel.trim()) {
    children.push(new Paragraph({
      alignment: alignmentFor(style.titleAlign),
      spacing: { after: 60 },
      children: runs(style.headerLabel, { size: halfPoints(style.subtitleSize) }),
    }));
  }
  if (input.title.trim()) {
    children.push(new Paragraph({
      alignment: alignmentFor(style.titleAlign),
      spacing: { after: mm(style.titleMarginBottom), line: Math.round(style.titleLineHeight * 240), lineRule: LineRuleType.AUTO },
      children: runs(input.title, {
        font: titleFont,
        size: halfPoints(style.titleSize),
        bold: style.titleWeight >= 600,
        characterSpacing: Math.round(style.titleLetterSpacing * style.titleSize * 20),
        italics: style.titleItalic,
        ...(style.titleUnderline ? { underline: {} } : {}),
      }),
    }));
  }
  if (input.subtitle.trim()) {
    children.push(new Paragraph({
      alignment: alignmentFor(style.titleAlign),
      spacing: { after: mm(style.headerBottomSpacing) },
      children: runs(input.subtitle, {
        font: titleFont,
        size: halfPoints(style.subtitleSize),
        bold: style.subtitleWeight >= 600,
        characterSpacing: Math.round(style.subtitleLetterSpacing * style.subtitleSize * 20),
      }),
    }));
  }
  if (style.headerStyle !== "none" && settings.infoFields.length) {
    const boxed = style.infoStyle === "boxed";
    children.push(new Paragraph({
      alignment: boxed ? AlignmentType.CENTER : alignmentFor(style.titleAlign),
      spacing: {
        before: boxed ? 80 : 0,
        after: boxed ? 80 : mm(style.headerBottomSpacing),
        ...bodySpacing,
      },
      ...(boxed ? { border: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER } } : {}),
      children: [
        new TextRun({ ...bodyRun, size: halfPoints(style.candidateInfoSize), text: settings.infoFields.map((field) => `${field}：____________`).join("　　") }),
      ],
    }));
  }

  if (settings.notice.trim() && style.noticeStyle !== "hidden") {
    const noticeLines = settings.notice.split("\n").filter((line) => line.trim());
    if (noticeLines.length) {
      const noticeRun: IRunOptions = { ...bodyRun, size: halfPoints(style.candidateInfoSize) };
      const noticeChildren: ExportRun[] = [new TextRun({ ...noticeRun, bold: true, text: "注意事项" })];
      for (const line of noticeLines) {
        noticeChildren.push(new TextRun({ ...noticeRun, text: line, break: 1 }));
      }
      const boxed = style.noticeStyle === "boxed";
      children.push(new Paragraph({
        spacing: { before: mm(style.noticeMarginTop), after: mm(style.noticeMarginBottom), ...bodySpacing },
        ...(boxed
          ? { border: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7F9F8" } }
          : {}),
        children: noticeChildren,
      }));
    }
  }

  if (!questions.length) {
    children.push(new Paragraph({ spacing: { before: 480, after: 120 }, children: [new TextRun({ ...bodyRun, bold: true, size: halfPoints(16), text: "空白试卷" })] }));
    children.push(new Paragraph({ children: runs("这份试卷还没有题目。") }));
  }

  // ---- Sections and questions -------------------------------------------
  let globalIndex = 0;
  for (const section of settings.sections as PaperSection[]) {
    const sectionQuestions = section.questionIds
      .map((id) => questionMap.get(id))
      .filter((question): question is QuestionWithSource => Boolean(question));
    if (!sectionQuestions.length) continue;

    children.push(new Paragraph({
      spacing: { before: sectionBefore, after: mm(style.sectionHeadingPadding), ...bodySpacing },
      ...(style.sectionDivider === "single" ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } } } : {}),
      children: [
        ...runs(section.title, { size: halfPoints(style.sectionTitleSize), bold: style.sectionTitleWeight >= 600 }),
        ...(section.scoreDetail?.trim()
          ? [new TextRun({ ...bodyRun, text: `　${section.scoreDetail}` })]
          : []),
      ],
    }));

    for (const [sectionIndex, question] of sectionQuestions.entries()) {
      globalIndex += 1;
      const questionNumber = globalIndex;
      const score = scoreForQuestion(section, sectionIndex);
      const stemRuns = runs(question.stem);
      const stemHasBlank = questionStemHasAnswerBlank(question.stem);

      const lineChildren: ExportRun[] = [
        ...runs(`${questionNumber}.`, { size: halfPoints(style.questionNumberSize), bold: true }),
        new TextRun({ ...bodyRun, text: "\t" }),
        ...stemRuns,
      ];
      if (question.type === "fill" && !stemHasBlank) {
        lineChildren.push(new TextRun({ ...bodyRun, text: "\u3000".repeat(6), underline: {} }));
      }
      const showInlineScore = score > 0 && style.scoreStyle === "inline";
      const showRightScore = score > 0 && style.scoreStyle === "right";
      if (showInlineScore) lineChildren.push(new TextRun({ ...bodyRun, text: `（${score} 分）` }));
      if (showRightScore) {
        lineChildren.push(new TextRun({ ...bodyRun, text: "\t" }));
        lineChildren.push(new TextRun({ ...bodyRun, text: `（${score} 分）` }));
      }

      children.push(new Paragraph({
        spacing: { after: questionAfter, ...bodySpacing },
        tabStops: [
          { type: TabStopType.LEFT, position: indent },
          ...(showRightScore ? [{ type: TabStopType.RIGHT, position: rightTab }] : []),
        ],
        children: lineChildren,
      }));

      const questionAssets = question.assets.filter((asset) => asset.role === "question");
      const beforeAssets = questionAssets.filter((asset) => (settings.assetLayouts[asset.id]?.placement ?? "after-stem") === "after-stem");
      const afterAssets = questionAssets.filter((asset) => settings.assetLayouts[asset.id]?.placement === "before-answer");

      for (const asset of beforeAssets) {
        await pushAsset(children, asset, questionNumber, settings.assetLayouts[asset.id] ?? defaultAssetLayout(questionNumber));
      }

      const options = question.options ?? [];
      if (options.length) {
        const columns = Math.min(style.optionColumns, options.length);
        const cells = options.map((option) => [
          new TextRun({ ...bodyRun, bold: true, text: `${option.key}. ` }),
          ...runs(option.content),
        ]);
        if (columns <= 1) {
          for (const cell of cells) {
            children.push(new Paragraph({ indent: { left: indent }, spacing: { after: 40, ...bodySpacing }, children: cell }));
          }
        } else {
          const tableWidth = columnWidth - indent;
          const cellWidth = Math.floor(tableWidth / columns);
          const rows = chunk(cells, columns).map((row) => new TableRow({
            children: Array.from({ length: columns }, (_, column) => new TableCell({
              width: { size: cellWidth, type: WidthType.DXA },
              children: [new Paragraph({ spacing: { after: 40, ...bodySpacing }, children: row[column] ?? [] })],
            })),
          }));
          children.push(new Table({
            width: { size: tableWidth, type: WidthType.DXA },
            columnWidths: Array.from({ length: columns }, () => cellWidth),
            indent: { size: indent, type: WidthType.DXA },
            layout: "fixed",
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
            rows,
          }));
        }
      }

      for (const asset of afterAssets) {
        await pushAsset(children, asset, questionNumber, settings.assetLayouts[asset.id] ?? defaultAssetLayout(questionNumber));
      }

      const configuredBlank = settings.answerSpaces[question.id];
      const blankLines = question.type === "answer" && !includeAnswers && Number.isFinite(configuredBlank)
        ? Math.min(MAX_ANSWER_LINES, Math.max(0, Math.round(configuredBlank)))
        : 0;
      for (let line = 0; line < blankLines; line += 1) {
        children.push(new Paragraph({ spacing: { ...bodySpacing, after: 0 }, children: [] }));
      }

      if (includeAnswers) {
        const answerChildren: Array<Paragraph | Table> = [
          new Paragraph({
            spacing: { before: 80, after: 40, ...bodySpacing },
            border: { left: ANSWER_BORDER },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F6F4" },
            children: [new TextRun({ ...bodyRun, bold: true, text: "答案：" }), ...runs(question.answer || "未录入")],
          }),
          new Paragraph({
            spacing: { after: questionAfter, ...bodySpacing },
            border: { left: ANSWER_BORDER },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F6F4" },
            children: [new TextRun({ ...bodyRun, bold: true, text: "解析：" }), ...runs(question.analysis || "未录入")],
          }),
        ];
        for (const asset of question.assets.filter((item) => item.role === "answer")) {
          await pushAsset(answerChildren, asset, questionNumber, settings.assetLayouts[asset.id] ?? defaultAssetLayout(questionNumber));
        }
        children.push(...answerChildren);
      }
    }
  }

  const footerParagraph = () => {
    const pageRuns: ExportRun[] = [];
    if (style.showPageNumber) {
      pageRuns.push(new TextRun({ ...bodyRun, text: "第 " }));
      pageRuns.push(new TextRun({ ...bodyRun, children: [PageNumber.CURRENT] }));
      pageRuns.push(new TextRun({ ...bodyRun, text: " 页" }));
    }
    const label = style.footerText.trim();
    if (label && pageRuns.length) {
      return new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
        children: [new TextRun({ ...bodyRun, size: halfPoints(9), color: "777777", text: label }), new TextRun({ ...bodyRun, text: "\t" }), ...pageRuns],
      });
    }
    return new Paragraph({
      alignment: pageRuns.length && !label ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ ...bodyRun, size: halfPoints(9), color: "777777", text: label }), ...(pageRuns.length && label ? [new TextRun({ ...bodyRun, text: "\t" })] : []), ...pageRuns],
    });
  };

  const hasFooter = Boolean(style.footerText.trim() || style.showPageNumber);
  const document = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: portrait.width, height: portrait.height, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: mm(style.marginTop), right: marginRight, bottom: mm(style.marginBottom), left: marginLeft, header: 720, footer: 720 },
          pageNumbers: { start: 1 },
        },
        ...(columnCount === 2 ? { column: { count: 2, space: COLUMN_GAP } } : {}),
      },
      ...(hasFooter ? { footers: { default: new Footer({ children: [footerParagraph()] }) } } : {}),
      children,
    }],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
