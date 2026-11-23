import { strToU8, zipSync } from "fflate";
import { buildPaperLatex, type PaperLatexFile } from "../../../../../../lib/paper-latex";
import { getPaperPrintData } from "../../../../../../lib/question-repository";
import { requestOwner } from "../../../../../../lib/server";
import { loadLatexAsset } from "../../../../paper-export-assets";


function safeFilename(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 80);
  return cleaned || "paper";
}

export async function GET(request: Request, context: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await context.params;
  const ownerId = requestOwner(request);
  const paper = await getPaperPrintData(paperId, ownerId);
  if (!paper) return Response.json({ error: "试卷不存在" }, { status: 404 });
  const withAnswers = new URL(request.url).searchParams.get("answers") === "1";
  try {
    const result = await buildPaperLatex({
      title: paper.title,
      subtitle: paper.subtitle,
      questions: paper.questions,
      settings: paper.settings,
      includeAnswers: withAnswers,
    }, { loadAsset: loadLatexAsset });
    const base = safeFilename(paper.title);
    const suffix = withAnswers ? "-解析答案" : "";
    // ZIP entry names must stay ASCII: fflate does not set the UTF-8 filename
    // flag, so a Chinese entry name would show up garbled in Explorer.
    if (result.files?.length) {
      const entries: Record<string, Uint8Array> = { "paper.tex": strToU8(result.source) };
      for (const file of result.files as PaperLatexFile[]) entries[file.name] = file.data;
      const archive = zipSync(entries, { level: 6 });
      return new Response(archive as unknown as BodyInit, {
        headers: {
          "content-type": "application/zip",
          "content-length": String(archive.byteLength),
          "content-disposition": `attachment; filename="paper.zip"; filename*=UTF-8''${encodeURIComponent(`${base}${suffix}-latex.zip`)}`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const bytes = new TextEncoder().encode(result.source);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "text/x-tex; charset=utf-8",
        "content-length": String(bytes.byteLength),
        "content-disposition": `attachment; filename="paper.tex"; filename*=UTF-8''${encodeURIComponent(`${base}${suffix}.tex`)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LaTeX 生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
