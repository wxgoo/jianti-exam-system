import { readJsonPayload } from "../../../../../../lib/request-payload";
import { requestOwner } from "../../../../../../lib/server";
import { addStudentToClass } from "../../../../../../lib/school-workflow";

type Context = { params: Promise<{ classId: string }> };

export async function POST(request: Request, context: Context) {
  const parsed = await readJsonPayload<{ studentNo?: unknown; name?: unknown; seatNumber?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  try {
    const { classId } = await context.params;
    return Response.json(await addStudentToClass(requestOwner(request), classId, parsed.value), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "添加学生失败" }, { status: 400 });
  }
}
