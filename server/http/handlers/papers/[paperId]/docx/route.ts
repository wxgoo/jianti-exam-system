import { buildPaperDocx } from "../../../../../../lib/paper-docx";
import { getPaperPrintData } from "../../../../../../lib/question-repository";
import { requestOwner } from "../../../../../../lib/server";
import { loadImageAsset } from "../../../../paper-export-assets";


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
    const bytes = await buildPaperDocx({
      title: paper.title,
      subtitle: paper.subtitle,
      questions: paper.questions,
      settings: paper.settings,
      includeAnswers: withAnswers,
    }, { loadAsset: loadImageAsset });
    const filename = `${safeFilename(paper.title)}${withAnswers ? "-解析答案" : ""}.docx`;
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-length": String(bytes.byteLength),
        "content-disposition": `attachment; filename="paper.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Word 生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
