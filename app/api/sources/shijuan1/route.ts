import { importAndExtract, type ImportAndExtractOptions } from "../../../../server/services/shijuan1-import";
import { ensureDatabase } from "../../../../db/bootstrap";
import { requestOwner, requestTeacherSession } from "../../../../lib/server";
import { uploadMetadataSchema } from "../../../../lib/api-contracts";
import { readFormDataPayload } from "../../../../lib/request-payload";
import { proxyDownload } from "../../../../server/services/shijuan1";
import { probeBackend, installHint } from "../../../../server/services/archive-extract";

const _ = proxyDownload; void _;

export async function GET(request: Request) {
  // GET /api/sources/shijuan1?action=meta 返回探测到的解压后端
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "archive-backends") {
    return Response.json({
      backend: probeBackend(),
      installHint: installHint(),
      platform: process.platform,
      hasPython: Boolean(probeBackend()?.backend === "rarfile"),
    });
  }

  // 搜索 / 下载代理
  const subject = url.searchParams.get("subject") ?? "数学";
  const grade = url.searchParams.get("grade") ?? "九年级";
  const version = url.searchParams.get("version") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const action = url.searchParams.get("action") ?? "search";

  if (action === "download") {
    const targetUrl = url.searchParams.get("url") ?? "";
    const filename = url.searchParams.get("filename") ?? "";
    if (!targetUrl) return Response.json({ error: "缺少下载地址" }, { status: 400 });
    try {
      const { bytes, filename: finalName } = await proxyDownload(targetUrl, filename);
      if (bytes.length > 200 * 1024 * 1024) {
        return Response.json({ error: "文件超过 200 MB" }, { status: 413 });
      }
      const safeName = finalName.replace(/[,"<>]/g, "");
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/x-rar-compressed",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "下载失败" }, { status: 502 });
    }
  }

  // 默认搜索
  try {
      const { searchShijuan } = await import("../../../../server/services/shijuan1");
    const result = await searchShijuan(subject, grade, version || undefined, page);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "抓取失败" }, { status: 502 });
  }
}

/**
 * POST /api/sources/shijuan1?action=import
 * 从第一试卷网下载 .rar → 解压 → 入库
 *
 * 表单字段：
 *   url        — .rar 的直链（从搜索结果里拿 downUrl）
 *   filename   — 提示用的文件名
 *   subject    — 科目（元数据）
 *   grade      — 年级（元数据）
 *   sourceYear / sourceExamType / sourceRegion / sourceTextbook / sourceSchool — 可选元数据
 */
export async function POST(request: Request) {
  await ensureDatabase();
  const probe = probeBackend();
  if (!probe) {
    return Response.json({
      error: `未找到可用的解压后端。${installHint()}`,
      missingBackend: true,
    }, { status: 503 });
  }

  const payload = await readFormDataPayload(request);
  if (!payload.ok) return payload.response;
  const form = payload.value;

  const url = String(form.get("url") ?? "").trim();
  if (!url) return Response.json({ error: "缺少归档下载地址" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) return Response.json({ error: "下载地址必须是完整 URL (http/https)" }, { status: 400 });

  const metadata = {
    subject: String(form.get("subject") ?? ""),
    grade: String(form.get("grade") ?? ""),
    sourceYear: typeof form.get("sourceYear") === "string" && (form.get("sourceYear") as string) !== ""
      ? Number(form.get("sourceYear")) : null,
    sourceExamType: String(form.get("sourceExamType") ?? ""),
    sourceRegion: String(form.get("sourceRegion") ?? ""),
    sourceTextbook: String(form.get("sourceTextbook") ?? ""),
    sourceSchool: String(form.get("sourceSchool") ?? ""),
  };

  if (!uploadMetadataSchema.safeParse(metadata).success) {
    return Response.json({ error: "试卷信息格式无效" }, { status: 400 });
  }

  const opts: ImportAndExtractOptions = {
    url,
    filenameHint: String(form.get("filename") ?? ""),
    metadata,
    ownerId: requestOwner(request),
    school: requestTeacherSession(request)?.school,
  };

  try {
    const outcome = await importAndExtract(opts);
    return Response.json({
      ...outcome,
      backendUsed: probe.backend,
      documents: outcome.importedDocuments,
      totalImportedQuestions: outcome.importedDocuments.reduce((sum: number, doc) => sum + doc.questionCount, 0),
      totalDocuments: outcome.importedDocuments.length,
    }, { status: outcome.importedDocuments.length ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 502 });
  }
}
