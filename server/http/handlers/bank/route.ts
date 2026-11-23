import { requestEducationScope } from "../../../../lib/education-scope";
import * as questions from "../../../../lib/question-repository";
import { toResponse, result } from "../../../core/result";
import { requestOwner, requestTeacherSession } from "../../../../lib/server";

export async function GET(request: Request) {
  const ownerId = requestOwner(request);
  const scope = requestEducationScope(request);

  // 多租户：从 session 获取教师所属学校和学科，用于题库共享
  let sharedSchool: string | undefined;
  let sharedSubject: string | undefined;
  try {
    const session = requestTeacherSession(request);
    if (session) {
      sharedSchool = session.school;
      sharedSubject = session.subject;
    }
  } catch {
    // session 不可用，忽略
  }

  const data = await questions.getBankData(ownerId, scope, sharedSchool, sharedSubject);
  return toResponse(result(data));
}
