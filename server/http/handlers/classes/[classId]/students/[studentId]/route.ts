import { readJsonPayload } from "../../../../../../../lib/request-payload";
import { requestOwner } from "../../../../../../../lib/server";
import { removeStudentFromClass, updateStudentInClass } from "../../../../../../../lib/school-workflow";

type Context = { params: Promise<{ classId: string; studentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const parsed = await readJsonPayload<{ studentNo?: unknown; name?: unknown; seatNumber?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  try {
    const { classId, studentId } = await context.params;
    return Response.json(await updateStudentInClass(requestOwner(request), classId, studentId, parsed.value));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新学生失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { classId, studentId } = await context.params;
    return Response.json(await removeStudentFromClass(requestOwner(request), classId, studentId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "移除学生失败" }, { status: 400 });
  }
}
