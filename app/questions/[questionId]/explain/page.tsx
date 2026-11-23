import { headers } from "next/headers";
import { ExplanationEditor } from "@/components/ExplanationEditor";

export const metadata = { title: "题目讲解" };

export default async function QuestionExplainPage({ searchParams }: { searchParams: Promise<{ questionId: string }> }) {
  const { questionId } = await searchParams;
  const requestHeaders = await headers();
  const ownerId = requestHeaders.get("oai-authenticated-user-id") ?? "local-demo";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">题目讲解</h1>
      </div>
      <ExplanationEditor questionId={questionId} ownerId={ownerId} />
    </div>
  );
}
