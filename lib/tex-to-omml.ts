/**
 * LaTeX → MathML (temml) → OMML (mathml2omml) for Word export.
 *
 * The stored question text mixes prose and single-`$` formulas, so the same
 * scanner used by the browser renderer is reused here to keep Word, the print
 * page and the PDF on identical math. temml reports failures as a
 * `<span class="temml-error">` when `throwOnError` is off, therefore the
 * conversion always runs with `throwOnError: true` and falls back to the raw
 * source instead of leaking an error span into the document.
 */
import temml from "temml";
import { mml2omml } from "mathml2omml";
import { ImportedXmlComponent, TextRun, type IRunOptions, type ParagraphChild } from "docx";
import {
  KATEX_MACROS,
  repairDisplayText,
  scanMathText,
  splitMathBlanks,
  splitOutsideBlanks,
  unescapeTextLiterals,
} from "./math-format.ts";

/** temml already ships `\overparen`; its native `<mover>` maps better to OMML. */
const EXPORT_MACROS: Record<string, string> = Object.fromEntries(
  Object.entries(KATEX_MACROS).filter(([name]) => name !== "\\overparen" && name !== "\\overarc"),
);

/** ideographic spaces carry an underline of the canonical two-em answer blank. */
const BLANK_RUN = "\u3000\u3000";

/**
 * Inline content for one paragraph. `ImportedXmlComponent` (the OMML injection)
 * is accepted at runtime but missing from docx's `ParagraphChild` union, so the
 * converter widens the type once instead of casting at every call site.
 */
export type ExportRun = ParagraphChild;

/** Convert one formula to OMML, or `null` when the source cannot be parsed. */
export function texToOmml(tex: string, display: boolean): string | null {
  const source = tex.trim();
  if (!source) return null;
  try {
    const mathml = temml.renderToString(source, {
      displayMode: display,
      throwOnError: true,
      strict: false,
      macros: EXPORT_MACROS,
    });
    // A non-throwing path can still return an error span (for example when
    // strict mode downgrades a problem); never hand that to Word.
    if (/class="temml-error"/.test(mathml)) return null;
    const omml = mml2omml(mathml).trim();
    return omml || null;
  } catch {
    return null;
  }
}

/** OMML for one formula, or `null` so the caller can fall back to plain text. */
export function latexToOmml(tex: string, display: boolean): ImportedXmlComponent | null {
  const omml = texToOmml(tex, display);
  if (!omml) return null;
  try {
    return ImportedXmlComponent.fromXmlString(omml);
  } catch {
    return null;
  }
}

function textRuns(value: string, defaults: IRunOptions): TextRun[] {
  const runs: TextRun[] = [];
  let pendingBreaks = 0;
  const lines = value.split("\n");
  lines.forEach((line, index) => {
    if (!line) {
      if (index > 0) pendingBreaks += 1;
      return;
    }
    runs.push(new TextRun({ ...defaults, text: line, ...(pendingBreaks ? { break: pendingBreaks } : {}) }));
    pendingBreaks = 0;
  });
  return runs;
}

export type LatexRunOptions = {
  /** Run properties applied to every prose run (font, size, bold, …). */
  run?: IRunOptions;
  /** Replace unparseable formulas with this text instead of the raw LaTeX. */
  fallbackText?: (latex: string) => string;
};

/**
 * Split text into Word runs: prose becomes `TextRun`, formulas become injected
 * OMML, and answer blanks become underlined ideographic spaces so they keep
 * their two-em width in Word (the MathML `<mspace>` collapses there).
 */
export function latexToRuns(text: string, options: LatexRunOptions = {}): ExportRun[] {
  const defaults = options.run ?? {};
  const runs: ExportRun[] = [];
  const pushText = (value: string) => runs.push(...textRuns(value, defaults));
  const pushBlank = () => runs.push(new TextRun({ ...defaults, text: BLANK_RUN, underline: {} }));
  for (const token of scanMathText(repairDisplayText(text ?? ""))) {
    if (token.type === "text") {
      for (const part of splitOutsideBlanks(unescapeTextLiterals(token.value))) {
        if (part.type === "blank") pushBlank();
        else pushText(part.value);
      }
      continue;
    }
    const blankOnly = splitMathBlanks(token.value);
    if (blankOnly.length === 1 && blankOnly[0].type === "blank") {
      pushBlank();
      continue;
    }
    const component = latexToOmml(token.value, token.display);
    if (component) {
      runs.push(component as unknown as ParagraphChild);
      continue;
    }
    const source = options.fallbackText ? options.fallbackText(token.value) : token.value;
    if (source) pushText(source);
  }
  return runs;
}

/** Plain-text rendering used for filenames, footers and alt text. */
export function latexToPlainText(text: string): string {
  return scanMathText(repairDisplayText(text ?? ""))
    .map((token) => {
      if (token.type === "text") {
        return splitOutsideBlanks(unescapeTextLiterals(token.value))
          .map((part) => (part.type === "blank" ? BLANK_RUN : part.value))
          .join("");
      }
      return token.value.replace(/\\([a-zA-Z]+)/g, "$1").replace(/[{}$\\]/g, "");
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
