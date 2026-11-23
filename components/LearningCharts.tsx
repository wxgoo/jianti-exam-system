"use client";

import { MathText } from "@/components/MathText";

type LearningChartsProps = {
  analytics: {
    total: {
      total: number;
      correct: number;
      accuracy: number;
      avgScore: number;
      totalScore: number;
      totalTimeMs: number;
    };
    daily: Array<{ day: string; accuracy: number; total: number; correct: number }>;
    byType: Array<{ type: string; total: number; correct: number; accuracy: number }>;
    weakQuestions: Array<{
      questionId: string;
      stem: string;
      type: string;
      difficulty: string;
      total: number;
      correct: number;
      wrongCount: number;
      accuracy: number;
    }>;
  };
};

export function LearningCharts({ analytics }: LearningChartsProps) {
  const { total, daily, byType, weakQuestions } = analytics;

  const width = 640;
  const height = 220;
  const padding = 44;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = daily.map((d, i) => ({
    x: padding + (i / Math.max(daily.length - 1, 1)) * chartWidth,
    y: padding + chartHeight - (d.accuracy / 100) * chartHeight,
    d,
  }));

  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");

  const typeLabel = (t: string) => (t === "practice" ? "练习" : t === "exam" ? "考试" : t === "wrong_review" ? "错题复习" : t);
  const questionTypeLabel = (t: string) => (t === "single" ? "单选" : t === "multiple" ? "多选" : t === "fill" ? "填空" : "解答");

  return (
    <div className="space-y-8">
      {/* 总体统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="总做题数" value={total.total} icon="" />
        <StatCard title="正确率" value={total.accuracy + "%"} icon="" />
        <StatCard title="平均分" value={total.avgScore.toFixed(1)} icon="" />
        <StatCard title="总用时" value={Math.round((total.totalTimeMs ?? 0) / 1000 / 60) + " 分钟"} icon="⏱" />
      </div>

      {/* 正确率趋势 */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-sm font-semibold mb-4">近30天正确率趋势</h3>
        <div className="w-full">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]">
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d={`M ${padding} ${padding + chartHeight} ${linePath} L ${points[points.length - 1]?.x ?? padding} ${padding + chartHeight} Z`}
              fill="url(#grad)"
            />
            <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" />
            {points.map((p) => (
              <circle key={p.d.day} cx={p.x} cy={p.y} r={3} fill="#3b82f6" />
            ))}
            {[0, 25, 50, 75, 100].map((v) => (
              <text
                key={v}
                x={padding - 8}
                y={padding + chartHeight - (v / 100) * chartHeight + 4}
                fontSize="10"
                fill="#9ca3af"
                textAnchor="end"
              >
                {v}%
              </text>
            ))}
            {daily
              .filter((_, i) => i % Math.max(Math.floor(daily.length / 5), 1) === 0)
              .map((d) => {
                const p = points.find((pp) => pp.d.day === d.day);
                if (!p) return null;
                return (
                  <text
                    key={d.day}
                    x={p.x}
                    y={padding + chartHeight + 18}
                    fontSize="10"
                    fill="#9ca3af"
                    textAnchor="middle"
                  >
                    {d.day.slice(5)}
                  </text>
                );
              })}
          </svg>
        </div>
      </div>

      {/* 题型分布 */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-sm font-semibold mb-4">题型正确率分布</h3>
        <div className="space-y-3">
          {byType.map((t) => (
            <div key={t.type} className="flex items-center gap-3">
              <span className="w-20 text-xs">{typeLabel(t.type)}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                <div className="bg-blue-600 h-full" style={{ width: `${t.accuracy}%` }} />
              </div>
              <span className="w-14 text-xs text-right font-mono">{t.accuracy}% ({t.correct}/{t.total})</span>
            </div>
          ))}
        </div>
      </div>

      {/* 薄弱题目 */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="text-sm font-semibold mb-4">薄弱题目（错误最多）</h3>
        {weakQuestions.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">暂无薄弱题目，继续保持！</div>
        ) : (
          <div className="space-y-2">
            {weakQuestions.map((w) => (
              <div key={w.questionId} className="flex items-center justify-between p-2 rounded border border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    <MathText text={w.stem} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {questionTypeLabel(w.type)} · {w.difficulty} · 错 {w.wrongCount} 次
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-destructive">{w.accuracy}%</span>
              </div>
            ))}
          </div>
        )}
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
