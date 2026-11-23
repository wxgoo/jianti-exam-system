import { getSqlite, sqliteTransaction } from "../../db";
import { ensureDatabase } from "../../db/bootstrap";
import { deleteFile, putFile } from "../../lib/file-storage";
import type { EducationScope } from "../../lib/education-scope";
import type { ParsedWordQuestion } from "../../lib/word-import";
import { now } from "../../lib/server";

export type TextImportMetadata = {
  subject: string;
  grade: string;
  sourceYear: number | null;
  sourceExamType: string;
  sourceRegion: string;
  sourceTextbook: string;
  sourceSchool: string;
};

export type TextImportParams = {
  ownerId: string;
  school: string | null | undefined;
  scope: EducationScope | undefined;
  metadata: TextImportMetadata;
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
  questions: ParsedWordQuestion[];
  warnings: string[];
};

export type TextImportOutcome =
  | { error: string; status: 409; documentId: string }
  | { error: string; status: 500 }
  | { documentId: string; name: string; questionCount: number; warnings: string[]; status: 201 };

function hex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanName(value: string) {
  return value.replace(/\.(docx|html|htm|zip)$/i, "").slice(0, 160) || "导入试卷";
}

/** 把已经解析好的纯文字题目保存为一份待审核文档；PDF 流程不使用这个服务。 */
export async function persistTextImport(params: TextImportParams): Promise<TextImportOutcome> {
  await ensureDatabase();
  const checksum = hex(await crypto.subtle.digest("SHA-256", new Uint8Array(params.bytes)));
  const duplicate = getSqlite().prepare(
    "SELECT id FROM documents WHERE owner_id=? AND checksum=? AND source_removed_at IS NULL LIMIT 1",
  ).get(params.ownerId, checksum) as { id: string } | undefined;
  if (duplicate) {
    return { error: "这份试卷已经导入过，请在试卷管理中查看", status: 409, documentId: duplicate.id };
  }

  const id = crypto.randomUUID();
  const timestamp = now();
  const name = cleanName(params.fileName);
  const originalKey = `documents/${id}/original/${params.fileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
  let stored = false;
  try {
    await putFile(originalKey, params.bytes);
    stored = true;
    sqliteTransaction((sqlite) => {
      sqlite.prepare(
        `INSERT INTO documents
          (id, owner_id, name, mime_type, source_kind, original_key, status, page_count,
           subject, grade, source_year, source_exam_type, source_region, source_textbook, source_school,
           school, checksum, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'imported', ?, 'reviewing', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id, params.ownerId, name, params.mimeType, originalKey,
        params.metadata.subject || "数学", params.metadata.grade || "九年级", params.metadata.sourceYear,
        params.metadata.sourceExamType, params.metadata.sourceRegion, params.metadata.sourceTextbook, params.metadata.sourceSchool,
        params.school ?? null, checksum, timestamp, timestamp,
      );
      const insert = sqlite.prepare(
        `INSERT INTO questions
          (id, document_id, number, type, stem, options_json, answer, analysis, page_number, bbox_json,
           status, needs_human_review, confidence, score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending', 1, 0.9, 0, ?, ?)`,
      );
      for (const question of params.questions) {
        insert.run(
          crypto.randomUUID(), id, question.number, question.type, question.stem,
          JSON.stringify(question.options), question.answer, question.analysis,
          JSON.stringify({ x: 0, y: 0, width: 100, height: 100 }), timestamp, timestamp,
        );
      }
    });
  } catch (error) {
    if (stored) await deleteFile(originalKey).catch(() => undefined);
    return { error: error instanceof Error ? error.message : "导入失败", status: 500 };
  }
  return { documentId: id, name, questionCount: params.questions.length, warnings: params.warnings, status: 201 };
}
