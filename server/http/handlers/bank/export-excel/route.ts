import { requestOwner, requestTeacherSession } from "../../../../../lib/server";
import { requestEducationScope } from "../../../../../lib/education-scope";
import { searchApprovedQuestions } from "../../../../../lib/question-repository";
import type { QuestionWithSource } from "../../../../../lib/types";
import { buildExcelXlsx, type ExcelRow } from "../../../../services/excel-export";

const headerRow: ExcelRow = {
  A: "题号", B: "题型", C: "学科", D: "年级", E: "来源文档",
  F: "答案", G: "题干", H: "选项", I: "解析", J: "标签",
};

export async function GET(request: Request) {
  const ownerId = requestOwner(request);
  const scope = requestEducationScope(request);

  // 多租户：从 session 获取教师所属学校和学科，用于题库共享
  let sharedSchool: string | undefined;
  let sharedSubject: string | undefined;
  try {
    const session = requestTeacherSession(request);
    if (session) { sharedSchool = session.school; sharedSubject = session.subject; }
  } catch { /* session 不可用，忽略 */ }

  const all: QuestionWithSource[] = [];
  let page = 1;
  while (true) {
    const result = await searchApprovedQuestions(ownerId, { ...scope, sharedSchool, sharedSubject, page, pageSize: 100 });
    all.push(...result.questions);
    if (result.questions.length === 0 || all.length >= result.pagination.total) break;
    page++;
  }

  const rows: ExcelRow[] = [headerRow];
  for (const q of all) {
    rows.push({
      A: q.number,
      B: q.type,
      C: q.source.subject ?? "",
      D: q.source.grade ?? "",
      E: q.source.documentName ?? "",
      F: q.answer ?? "",
      G: q.stem ?? "",
      H: (q.options ?? []).map((option) => `${option.key}: ${option.content}`).join("\n"),
      I: q.analysis ?? "",
      J: q.tags.join("\n"),
    });
  }

  const xlsx = await buildExcelXlsx([{ name: "Questions", rows }]);
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="questions.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
