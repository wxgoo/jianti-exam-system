import { headers } from "next/headers";
import { getWrongBookStats, listWrongRecords } from "../../../lib/backend-data";
import { WrongRecordRow } from "@/components/WrongRecordRow";

export const metadata = { title: "错题复习" };

export default async function WrongBookReviewPage() {
  const requestHeaders = await headers();
  const ownerId = requestHeaders.get("oai-authenticated-user-id") ?? "local-demo";

  const [stats, records] = await Promise.all([
    getWrongBookStats(ownerId),
    listWrongRecords(ownerId, { status: "open", limit: 100 }),
  ]);

  // 筛选出需要复习的：未掌握或学习中且复习次数<3
  const dueRecords = (records as any[]).filter(
    (r) => r.mastery_level === "unfamiliar" || (r.mastery_level === "learning" && r.review_count < 3)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">错题复习</h1>
        <p className="text-sm text-muted-foreground">
          基于掌握度自动调度：未掌握优先复习，学习中复习3次后降频，已掌握不再复习
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="待复习" value={dueRecords.length} icon="" />
        <StatCard title="未掌握" value={stats.byMastery.find((b: any) => b.level === "unfamiliar")?.n ?? 0} icon="" />
        <StatCard title="学习中" value={stats.byMastery.find((b: any) => b.level === "learning")?.n ?? 0} icon="" />
        <StatCard title="已掌握" value={stats.mastered} icon="" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">复习列表</h2>
        </div>
        <div className="divide-y">
          {dueRecords.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              暂无需要复习的错题，继续保持！
            </div>
          ) : (
            dueRecords.map((record: any) => (
              <WrongRecordRow key={record.id} record={record} ownerId={ownerId} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-lg border p-4 flex flex-col items-center gap-2">
      <span className="text-2xl">{icon}</span>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{title}</div>
    </div>
  );
}
