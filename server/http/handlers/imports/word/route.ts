import { ensureDatabase } from "../../../../../db/bootstrap";
import { resolveUploadDestination } from "../../../../../lib/document-upload";
import { requestEducationScope } from "../../../../../lib/education-scope";
import { uploadMetadataSchema } from "../../../../../lib/api-contracts";
import { readFormDataPayload } from "../../../../../lib/request-payload";
import { requestOwner, requestTeacherSession } from "../../../../../lib/server";
import { readDocx, parseWordQuestions } from "../../../../../lib/word-import";
import { persistTextImport } from "../../../../services/text-import";

const maxBytes = 100 * 1024 * 1024;
const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await readFormDataPayload(request);
  if (!payload.ok) return payload.response;
  const form = payload.value;
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择 Word 文件" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return Response.json({ error: "只支持 .docx 格式的 Word 文件；旧版 .doc 请先另存为 .docx" }, { status: 415 });
  }
  if (file.size > maxBytes) return Response.json({ error: "Word 文件不能超过 100 MB" }, { status: 413 });
  if (file.name.length > 180) return Response.json({ error: "文件名不能超过 180 字符" }, { status: 400 });

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

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return Response.json({ error: "文件扩展名是 .docx，但内容不是有效的 Word 文档" }, { status: 415 });
  }

  let document: { lines: string[]; imageCount: number };
  try {
    document = readDocx(bytes);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取 Word 文档" }, { status: 422 });
  }
  const parsed = parseWordQuestions(document.lines);
  if (!parsed.questions.length) {
    return Response.json({
      error: "没有从 Word 中识别到题目。请使用“1. / 1、/ 1）”开头的题号，并将每道题的选项分行书写后重试。",
    }, { status: 422 });
  }
  const warnings = [...parsed.warnings];
  if (document.imageCount > 0) {
    warnings.push(`文档包含 ${document.imageCount} 张图片，本次仅导入文字；题图请在审核页核对后补充`);
  }

  const outcome = await persistTextImport({
    ownerId: requestOwner(request),
    school: requestTeacherSession(request)?.school,
    scope,
    metadata,
    fileName: file.name,
    bytes,
    mimeType,
    questions: parsed.questions,
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
    stats: { ...parsed.stats, images: document.imageCount },
  }, { status: 201 });
}
