import { unzipSync, strFromU8 } from "fflate";
import { ensureDatabase } from "../../../../../db/bootstrap";
import { resolveUploadDestination } from "../../../../../lib/document-upload";
import { requestEducationScope } from "../../../../../lib/education-scope";
import { uploadMetadataSchema } from "../../../../../lib/api-contracts";
import { readFormDataPayload } from "../../../../../lib/request-payload";
import { requestOwner, requestTeacherSession } from "../../../../../lib/server";
import { parseZujuanHtml } from "../../../../../lib/zujuan-import";
import { persistTextImport } from "../../../../services/text-import";

const maxBytes = 50 * 1024 * 1024;
const mimeType = "application/x-zujuan-export";

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await readFormDataPayload(request);
  if (!payload.ok) return payload.response;
  const form = payload.value;
  const files = form.getAll("file").filter((item): item is File => item instanceof File);
  if (!files.length) return Response.json({ error: "请选择组卷网导出的 HTML 或 ZIP 文件" }, { status: 400 });
  if (files.length > 10) return Response.json({ error: "每次最多导入 10 个导出文件" }, { status: 400 });
  if (files.some((file) => file.size > maxBytes)) return Response.json({ error: "单个导出文件不能超过 50 MB" }, { status: 413 });
  if (files.some((file) => !/\.(html?|zip)$/i.test(file.name))) {
    return Response.json({ error: "只支持油猴脚本导出的 .html 或 .zip 文件" }, { status: 415 });
  }

  const year = form.get("sourceYear");
  const metadata = {
    subject: String(form.get("subject") ?? ""),
    grade: String(form.get("grade") ?? ""),
    sourceYear: typeof year === "string" && year !== "" ? Number(year) : null,
    sourceExamType: String(form.get("sourceExamType") ?? ""),
    sourceRegion: String(form.get("sourceRegion") ?? ""),
    sourceTextbook: String(form.get("sourceTextbook") ?? ""),
    sourceSchool: String(form.get("sourceSchool") ?? ""),
  };
  if (!uploadMetadataSchema.safeParse(metadata).success) {
    return Response.json({ error: "试卷信息格式无效或字段过长" }, { status: 400 });
  }
  const scope = requestEducationScope(request);
  if (scope) {
    try {
      const destination = resolveUploadDestination(scope, { subject: metadata.subject, grade: metadata.grade });
      metadata.subject = destination.subject;
      metadata.grade = destination.grade;
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "导入目标无效" }, { status: 409 });
    }
  }

  const htmlDocuments: Array<{ name: string; text: string; bytes: Uint8Array }> = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) {
      let archive: Record<string, Uint8Array>;
      try {
        archive = unzipSync(bytes);
      } catch {
        return Response.json({ error: `${file.name} 不是有效的 ZIP 文件` }, { status: 422 });
      }
      const entries = Object.entries(archive).filter(([name]) => /\.html?$/i.test(name));
      if (!entries.length) return Response.json({ error: `${file.name} 中没有找到 HTML 题目文件` }, { status: 422 });
      for (const [name, data] of entries) htmlDocuments.push({ name, text: strFromU8(data), bytes: data });
    } else {
      htmlDocuments.push({ name: file.name, text: strFromU8(bytes), bytes });
    }
  }

  const questions = [];
  const seen = new Set<string>();
  let cards = 0;
  let imagesIgnored = 0;
  for (const html of htmlDocuments) {
    const parsed = parseZujuanHtml(html.text);
    cards += parsed.cards;
    imagesIgnored += parsed.imagesIgnored;
    for (const question of parsed.questions) {
      const key = `${question.stem.slice(0, 90)}|${question.answer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(question);
    }
  }
  if (!questions.length) {
    return Response.json({
      error: "没有从导出文件中识别到题目。请确认文件来自组卷网离线导出脚本的题目 HTML / 答案合集 HTML / ZIP。",
    }, { status: 422 });
  }
  for (const [index, question] of questions.entries()) question.number = String(index + 1);

  const warnings = [`已解析 ${cards} 个题目卡片，去重后导入 ${questions.length} 道题`];
  if (imagesIgnored > 0) warnings.push(`导出文件包含 ${imagesIgnored} 张图片，本次仅导入文字；题图请在审核页核对后补充`);

  const primary = files[0];
  const outcome = await persistTextImport({
    ownerId: requestOwner(request),
    school: requestTeacherSession(request)?.school,
    scope,
    metadata,
    fileName: primary.name,
    bytes: new Uint8Array(await primary.arrayBuffer()),
    mimeType,
    questions,
    warnings,
  });
  if ("error" in outcome) {
    return Response.json({ error: outcome.error, documentId: "documentId" in outcome ? outcome.documentId : undefined }, { status: outcome.status });
  }
  return Response.json({
    documentId: outcome.documentId,
    name: outcome.name,
    questionCount: outcome.questionCount,
    warnings: outcome.warnings,
    stats: { cards, images: imagesIgnored },
  }, { status: 201 });
}
