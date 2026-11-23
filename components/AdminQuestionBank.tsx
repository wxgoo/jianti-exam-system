"use client";

import { useEffect, useState } from "react";
import { typeLabels } from "../lib/question-labels";

type QuestionRow = {
  id: string;
  documentId: string;
  documentName: string;
  ownerName: string | null;
  subject: string | null;
  grade: string | null;
  type: string;
  number: string;
  status: string;
  difficulty: string;
  score: number;
  stem: string;
  createdAt: string;
};

type DetailRow = QuestionRow & {
  answer?: string | null;
  analysis?: string | null;
  optionsJson?: string | null;
  tags?: string[];
};

type SubjectFacet = { subject: string; count: number };

const STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已审核",
  failed: "需复核",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-600",
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已审核" },
  { value: "failed", label: "需复核" },
];

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  ...(["single", "multiple", "fill", "answer"] as const).map((t) => ({ value: t, label: typeLabels[t] })),
];

const DIFFICULTY_LABELS: Record<string, string> = { easy: "简单", medium: "中等", hard: "困难" };

const TYPE_STYLE: Record<string, string> = {
  single: "bg-blue-50 text-blue-700",
  multiple: "bg-violet-50 text-violet-700",
  fill: "bg-cyan-50 text-cyan-700",
  answer: "bg-amber-50 text-amber-700",
};

const chipBase = "rounded-full border px-3 py-1 text-xs transition-colors";
const chipActive = "border-blue-600 bg-blue-600 text-white";
const chipIdle = "border-gray-200 bg-card text-gray-600 hover:border-blue-300 hover:text-blue-700";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok || !data) return { ok: false, error: (typeof data?.error === "string" && data.error) || `请求失败（HTTP ${res.status}）` };
    return { ok: true, data: data as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "网络错误" };
  }
}

function parseOptions(optionsJson: string | null | undefined): string[] {
  if (!optionsJson) return [];
  try {
    const arr = JSON.parse(optionsJson) as Array<{ key?: string; content?: string }>;
    if (!Array.isArray(arr)) return [];
    return arr.map((o) => `${o.key ?? ""} ${o.content ?? ""}`.trim()).filter(Boolean);
  } catch { return []; }
}

function fmt(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const btnPrimary = "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700";
const btnGhost = "rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50";
const btnDanger = "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700";
const inputClass = "w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs text-foreground";
const selectClass = inputClass;

export function AdminQuestionBank() {
  const [filters, setFilters] = useState({ subject: "", type: "", status: "", search: "" });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [subjects, setSubjects] = useState<SubjectFacet[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [busyId, setBusyId] = useState("");
  const [delId, setDelId] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters.subject) params.set("subject", filters.subject);
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    const r = await api<{ questions: QuestionRow[]; pagination: { page: number; pageSize: number; total: number }; subjects?: SubjectFacet[]; filteredTotal?: number }>(`/api/admin/questions?${params.toString()}`);
    if (r.ok) {
      setQuestions(r.data.questions);
      setTotal(r.data.pagination.total);
      setSubjects(r.data.subjects ?? []);
      setFilteredTotal(r.data.filteredTotal ?? r.data.pagination.total);
      setError("");
    } else setError(r.error);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [page, filters.subject, filters.type, filters.status, filters.search]);

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: searchInput.trim() }));
    setPage(1);
  };

  const setStatus = async (id: string, status: string) => {
    setBusyId(id);
    const r = await api(`/api/admin/questions/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    if (!r.ok) alert(r.error);
    setBusyId(""); void load();
  };

  const viewDetail = async (id: string) => {
    setDetail({ loading: true } as never);
    const r = await api<{ question: DetailRow }>(`/api/admin/questions/${id}`);
    setDetail(r.ok ? r.data.question : { id } as DetailRow);
  };

  const del = async () => {
    const r = await api(`/api/admin/questions/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void load();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading && questions.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">题目库</h2>
          <p className="text-xs text-muted-foreground">按科目与题型查看具体题目，可查看详情、调整审核状态或删除。</p>
        </div>
        <span className="text-xs text-muted-foreground">共 {total} 道题目</span>
      </div>

      {/* 筛选 */}
      <div className="rounded-lg border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">科目</span>
          <button type="button" onClick={() => setFilter("subject", "")} className={`${chipBase} ${filters.subject === "" ? chipActive : chipIdle}`}>全部（{filteredTotal}）</button>
          {subjects.map((s) => (
            <button type="button" key={s.subject} onClick={() => setFilter("subject", s.subject)} className={`${chipBase} ${filters.subject === s.subject ? chipActive : chipIdle}`}>
              {s.subject}（{s.count}）
            </button>
          ))}
          {subjects.length === 0 && <span className="text-xs text-muted-foreground">暂无科目数据</span>}
        </div>
        <div className="grid grid-cols-[0.9fr_0.9fr_1.8fr] gap-2 items-end">
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>类型</span><select className={selectClass} value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>{TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>状态</span><select className={selectClass} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <form onSubmit={applySearch} className="flex gap-2">
            <input className={selectClass} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索题干…" />
            <button type="submit" className={btnGhost} disabled={busyId !== ""}>搜索</button>
          </form>
        </div>
      </div>

      {/* 题目列表 */}
      <div className="rounded-lg border bg-card divide-y">
        <div className="grid grid-cols-[0.6fr_0.6fr_1.8fr_0.7fr_0.6fr_1fr_0.9fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>科目</span><span>类型</span><span>题干</span><span>状态</span><span>难度</span><span>来源文档</span><span>创建时间</span><span>操作</span>
        </div>
        {questions.map((q) => (
          <div key={q.id} className="grid grid-cols-[0.6fr_0.6fr_1.8fr_0.7fr_0.6fr_1fr_0.9fr_auto] gap-2 items-center px-3 py-2 text-sm">
            <span className="truncate font-medium">{q.subject || "—"}</span>
            <span><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${TYPE_STYLE[q.type] ?? "bg-gray-100 text-gray-700"}`}>{typeLabels[q.type as keyof typeof typeLabels] ?? q.type}</span></span>
            <span className="truncate" title={q.stem}>{q.stem || "—"}</span>
            <span><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[q.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABELS[q.status] ?? q.status}</span></span>
            <span className="text-muted-foreground">{DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}</span>
            <span className="truncate text-xs text-muted-foreground" title={q.documentName}>{q.documentName}</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">{fmt(q.createdAt)}</span>
            <span className="flex flex-wrap justify-end gap-1">
              <button className={btnGhost} onClick={() => void viewDetail(q.id)}>详情</button>
              <button className={btnGhost} disabled={busyId === q.id} onClick={() => void setStatus(q.id, "approved")}>标记审核通过</button>
              <button className={btnGhost} disabled={busyId === q.id} onClick={() => void setStatus(q.id, "pending")}>标记未审核</button>
              <button className={btnGhost} disabled={busyId === q.id} onClick={() => void setStatus(q.id, "failed")}>标记需复核</button>
              <button className={btnDanger} onClick={() => setDelId(q.id)}>删除</button>
            </span>
          </div>
        ))}
        {questions.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无题目</div>}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>共 {total} 道题目，第 {page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <button className={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
          <button className={btnGhost} disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</button>
        </div>
      </div>

      {delId && (
        <div className="rounded-lg border bg-red-50 border-red-200 p-4 text-sm space-y-2">
          <p>确定要删除这道题目吗？删除后不可恢复。</p>
          <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl border p-5 max-h-[80vh] overflow-y-auto w-[560px] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">题目详情</h3>
              <button className={btnGhost} onClick={() => setDetail(null)}>关闭</button>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ["来源文档", detail.documentName],
                ["科目", detail.subject],
                ["年级", detail.grade],
                ["类型", typeLabels[detail.type as keyof typeof typeLabels] ?? detail.type],
                ["状态", STATUS_LABELS[detail.status] ?? detail.status],
                ["难度", DIFFICULTY_LABELS[detail.difficulty] ?? detail.difficulty],
                ["所属教师", detail.ownerName],
                ["创建时间", fmt(detail.createdAt)],
                ["题干", detail.stem],
                ["选项", parseOptions(detail.optionsJson).join("\n") || "-"],
                ["答案", detail.answer],
                ["解析", detail.analysis],
                ["标签", detail.tags?.join("、") || "-"],
              ].map(([label, value]) => (
                <div key={label as string} className="grid grid-cols-[5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{value ?? "-"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => void setStatus(detail.id, "approved")}>标记审核通过</button>
              <button className={btnGhost} onClick={() => void setStatus(detail.id, "pending")}>标记未审核</button>
              <button className={btnGhost} onClick={() => void setStatus(detail.id, "failed")}>标记需复核</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
