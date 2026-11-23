/**
 * 端到端：下载 .rar → 解压 → 把里面的 Word/PDF 入库。
 *
 * 核心调用链：
 *   proxyDownload → extractArchive → extractEditableFiles → 对每个 docx 调 readDocx + parseWordQuestions → persistTextImport
 *
 * 解压后端由 archive-extract.ts 探测（unrar/7z/bsdtar/unar/rarfile）。
 * 全部缺失时返回明确错误 + 安装提示，不会静默失败。
 */

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { extractArchive, extractEditableFiles, makeTempDir, removeTempDir, installHint } from "./archive-extract";
import { proxyDownload } from "./shijuan1";
import { persistTextImport, type TextImportMetadata } from "./text-import";
import { readDocx, parseWordQuestions } from "../../lib/word-import";
import { ensureDatabase } from "../../db/bootstrap";

export type ImportAndExtractOptions = {
  url: string;
  filenameHint?: string;
  metadata: TextImportMetadata;
  ownerId: string;
  school?: string | null;
};

export type ImportAndExtractOutcome = {
  archiveSize: number;
  archiveBytes: number;
  extractedTotal: number;
  importedDocuments: Array<{
    documentId: string;
    name: string;
    questionCount: number;
    warnings: string[];
  }>;
  skippedReason?: string[];
};

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024; // 200 MB 上限，第一试卷网 .rar 一般远小于这个

export async function importAndExtract(options: ImportAndExtractOptions): Promise<ImportAndExtractOutcome> {
  await ensureDatabase();

  // 1. 下载
  const { bytes, filename } = await proxyDownload(options.url, options.filenameHint);
  if (bytes.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`归档文件超过 ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB`);
  }

  // 2. 存临时文件
  const tempDir = makeTempDir("shijuan1-rar");
  const archivePath = path.join(tempDir, filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_"));
  await writeFile(archivePath, Buffer.from(bytes));

  // 3. 解压
  const extractResult = extractArchive(archivePath, path.join(tempDir, "extracted"));
  if (!extractResult.ok) {
    removeTempDir(tempDir);
    throw new Error(`解压失败: ${extractResult.error}`);
  }

  // 4. 挑出可入库的文件
  const editable = extractEditableFiles(extractResult.files);
  if (editable.length === 0) {
    removeTempDir(tempDir);
    throw new Error(
      `解压后共 ${extractResult.files.length} 个文件，但未发现 .docx / .pdf / .doc。` +
      `.rar 可能是已损坏或加密；${installHint()}`
    );
  }

  // 5. 逐个入库
  const outcomes: ImportAndExtractOutcome = {
    archiveSize: bytes.length,
    archiveBytes: bytes.length,
    extractedTotal: extractResult.files.length,
    importedDocuments: [],
    skippedReason: [],
  };

  for (const relPath of editable) {
    const fullPath = path.join(tempDir, "extracted", relPath);
    const lower = relPath.toLowerCase();
    const docBytes = new Uint8Array(await readFile(fullPath));

    if (lower.endsWith(".docx")) {
      try {
        const parsed = readDocx(docBytes);
        if (!parsed.lines.length) { outcomes.skippedReason?.push(`${relPath}: Word 文档无正文`); continue; }
        const result = parseWordQuestions(parsed.lines);
        if (!result.questions.length) {
          outcomes.skippedReason?.push(`${relPath}: 未解析到题目（可能需要先人工检查格式）`);
          continue;
        }
        const outcome = await persistTextImport({
          ownerId: options.ownerId,
          school: options.school,
          scope: undefined,
          metadata: options.metadata,
          fileName: relPath,
          bytes: docBytes,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          questions: result.questions,
          warnings: [
            `解压自 ${filename}`,
            `来源: 第一试卷网 ${options.url}`,
            ...(parsed.imageCount > 0 ? [`文档含 ${parsed.imageCount} 张图片，仅导入文字`] : []),
            ...result.warnings,
          ],
        });
        if ("documentId" in outcome && "name" in outcome) {
          outcomes.importedDocuments.push({
            documentId: outcome.documentId,
            name: outcome.name,
            questionCount: outcome.questionCount,
            warnings: outcome.warnings,
          });
        } else if ("error" in outcome) {
          outcomes.skippedReason?.push(`${relPath}: ${outcome.error}`);
        }
      } catch (error) {
        outcomes.skippedReason?.push(`${relPath}: ${error instanceof Error ? error.message : "解析失败"}`);
      }
    } else if (lower.endsWith(".doc")) {
      // 旧版 .doc 不支持，提示
      outcomes.skippedReason?.push(`${relPath}: 旧版 .doc 格式不支持，请先另存为 .docx`);
    } else if (lower.endsWith(".pdf")) {
      // PDF 走的是另一套（需要 PDF processor），这里只给提示不阻塞
      outcomes.skippedReason?.push(`${relPath}: PDF 请到「试卷上传」走 OCR 识别流程（需要启用 Python processor）`);
    }
  }

  // 6. 清理临时文件（后台延迟清理 1 分钟，让系统有时间读）
  setTimeout(() => removeTempDir(tempDir), 60_000);

  return outcomes;
}
