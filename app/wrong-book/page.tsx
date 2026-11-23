import { headers } from "next/headers";
import { getWrongBookStats, listWrongRecords } from "../../lib/backend-data";
import { WrongRecordRow } from "@/components/WrongRecordRow";

export const metadata = { title: "错题本" };

export default async function WrongBookPage() {
  const requestHeaders = await headers();
  const ownerId = requestHeaders.get("oai-authenticated-user-id") ?? "local-demo";

  const [stats, records] = await Promise.all([
    getWrongBookStats(ownerId),
    listWrongRecords(ownerId, { status: "open", limit: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">错题本</h1>
        <p className="text-sm text-muted-foreground">答错的题目会自动记录，复习掌握后可关闭</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="错题总数" value={stats.total} icon="" />
        <StatCard title="待复习" value={stats.open} icon="" />
        <StatCard title="已掌握" value={stats.mastered} icon="" />
        <StatCard
          title="掌握率"
          value={stats.total ? Math.round((stats.mastered / stats.total) * 100) + "%" : "0%"}
          icon=""
        />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">错题列表</h2>
        </div>
        <div className="divide-y">
          {records.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              暂无错题，加油！
            </div>
          ) : (
            records.map((record: any) => (
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
