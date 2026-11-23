import { headers } from "next/headers";
import { LearningCharts } from "@/components/LearningCharts";
import { getLearningAnalytics } from "@/lib/backend-data";

export const metadata = { title: "学习分析" };

export default async function LearningAnalyticsPage() {
  const requestHeaders = await headers();
  const ownerId = requestHeaders.get("oai-authenticated-user-id") ?? "local-demo";

  const analytics = await getLearningAnalytics(ownerId, undefined, 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">学习分析</h1>
        <p className="text-sm text-muted-foreground">近30天学习数据概览，支持错题复习和薄弱点定位</p>
      </div>
      <LearningCharts analytics={analytics} />
    </div>
  );
}
