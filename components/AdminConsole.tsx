"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminQuestionBank } from "./AdminQuestionBank";

type Tab = "stats" | "teachers" | "documents" | "questions" | "wrong" | "papers" | "folders" | "classes" | "students" | "assignments" | "settings";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "stats", label: "统计概览" },
  { value: "teachers", label: "教师管理" },
  { value: "questions", label: "题库" },
  { value: "wrong", label: "错题管理" },
  { value: "papers", label: "试卷管理" },
  { value: "folders", label: "试卷夹管理" },
  { value: "classes", label: "班级学生管理" },
  { value: "students", label: "学生管理" },
  { value: "assignments", label: "作业管理" },
  { value: "settings", label: "系统设置" },
];

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

/* ---------------- UI helpers ---------------- */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

const btnPrimary = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60";
const btnDanger = "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60";
const btnGhost = "rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50";
const inputClass = "w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground";
const selectClass = inputClass;

function useList<T>(load: () => Promise<ApiResult<T[]>>): { items: T[]; loading: boolean; error: string; reload: () => void } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    setLoading(true);
    const r = await loadRef.current();
    if (r.ok) setItems(r.data);
    else setError(r.error);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { items, loading, error, reload };
}

function withList<T, U>(r: ApiResult<T>, wrap: (data: T) => U[]): ApiResult<U[]> {
  return r.ok ? { ok: true, data: wrap(r.data) } : { ok: false, error: r.error };
}

/* ---------------- 教师管理 ---------------- */

type TeacherRow = { id: string; username: string; name: string; school: string; subject: string; role: string; createdAt: string };

function AdminTeachers() {
  const { items: teachers, loading, error, reload } = useList<TeacherRow>(async () => {
    const r = await api<{ teachers: TeacherRow[] }>("/api/admin/teachers");
    return withList(r, (data) => data.teachers);
  });
  // useList returns data[] ; handle error display
  const [form, setForm] = useState({ username: "", name: "", password: "", school: "", subject: "", role: "teacher" });
  const [createError, setCreateError] = useState("");
  const [createOk, setCreateOk] = useState("");
  const [editId, setEditId] = useState("");
  const [edit, setEdit] = useState({ name: "", school: "", subject: "", role: "teacher" });
  const [editError, setEditError] = useState("");
  const [resetId, setResetId] = useState("");
  const [resetPw, setResetPw] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetOk, setResetOk] = useState("");
  const [delId, setDelId] = useState("");

  const resetForm = () => setForm({ username: "", name: "", password: "", school: "", subject: "", role: "teacher" });

  const create = async () => {
    setCreateError(""); setCreateOk("");
    const r = await api<{ teacher: TeacherRow }>("/api/admin/teachers", {
      method: "POST",
      body: JSON.stringify(form),
    });
    if (r.ok) { setCreateOk("创建成功"); resetForm(); reload(); }
    else setCreateError(r.error);
  };

  const editStart = (t: TeacherRow) => { setEditId(t.id); setEdit({ name: t.name, school: t.school, subject: t.subject, role: t.role }); setEditError(""); };

  const editSave = async () => {
    setEditError("");
    const r = await api(`/api/admin/teachers/${editId}`, { method: "PATCH", body: JSON.stringify(edit) });
    if (r.ok) setEditError("已保存");
    else setEditError(r.error);
    reload();
  };

  const resetStart = (id: string, name: string) => { setResetId(id); setResetPw(""); setResetError(""); setResetOk(""); };
  const resetSave = async () => {
    setResetError(""); setResetOk("");
    const r = await api(`/api/admin/teachers/${resetId}/password`, { method: "POST", body: JSON.stringify({ password: resetPw }) });
    if (r.ok) setResetOk(`${nameLabel(teachers, resetId)} 的密码已重置`);
    else setResetError(r.error);
    setResetPw("");
  };

  const del = async () => {
    const r = await api(`/api/admin/teachers/${delId}`, { method: "DELETE" });
    if (r.ok) { setDelId(""); reload(); }
    else alert(r.error);
  };

  function nameLabel(list: TeacherRow[], id: string) { const t = list.find((x) => x.id === id); return t?.name ?? t?.username ?? ""; }

  if (loading && teachers.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card divide-y">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
          <span>用户名</span><span>姓名</span><span>学校</span><span>学科</span><span>角色</span><span>操作</span>
        </div>
        {teachers.map((t) => (
          <div key={t.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center px-3 py-2 text-sm">
            <span className="font-medium">{t.username}</span><span>{t.name}</span><span className="text-muted-foreground">{t.school}</span><span className="text-muted-foreground">{t.subject}</span>
            <span className={t.role === "admin" ? "text-blue-600 font-medium" : ""}>{t.role}</span>
            <span className="flex gap-1 justify-end">
              <button className={btnGhost} onClick={() => editStart(t)}>编辑</button>
              <button className={btnGhost} onClick={() => resetStart(t.id, t.name)}>重置密码</button>
              <button className={btnDanger} onClick={() => setDelId(t.id)}>删除</button>
            </span>
          </div>
        ))}
      </div>

      {/* 创建表单 */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">创建教师</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>用户名</span><input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="3-20 位字母数字" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>姓名</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="真实姓名" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学校</span><input className={inputClass} value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="如：第一中学" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学科</span><input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="如：数学" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>密码（6-32 位）</span><input className={inputClass} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="登录密码" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>角色</span><select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="teacher">教师</option><option value="admin">管理员</option></select></label>
        </div>
        {createError && <p className="text-xs text-red-600">{createError}</p>}
        {createOk && <p className="text-xs text-green-600">{createOk}</p>}
        <div><button className={btnPrimary} onClick={() => void create()}>创建教师</button></div>
      </div>

      {/* 编辑教师 */}
      {editId && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">编辑教师 #{editId.slice(0, 8)}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>姓名</span><input className={inputClass} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学校</span><input className={inputClass} value={edit.school} onChange={(e) => setEdit({ ...edit, school: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学科</span><input className={inputClass} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>角色</span><select className={selectClass} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="teacher">教师</option><option value="admin">管理员</option></select></label>
          </div>
          {editError && <p className="text-xs text-muted-foreground">{editError}</p>}
          <div><button className={btnPrimary} onClick={() => void editSave()}>保存修改</button> <button className={btnGhost} onClick={() => setEditId("")}>取消</button></div>
        </div>
      )}

      {/* 重置密码 */}
      {resetId && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">重置密码（{nameLabel(teachers, resetId)}）</h3>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>新密码（6-32 位）</span><input className={inputClass} type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="新密码" /></label>
          {resetError && <p className="text-xs text-red-600">{resetError}</p>}
          {resetOk && <p className="text-xs text-green-600">{resetOk}</p>}
          <div><button className={btnPrimary} onClick={() => void resetSave()} disabled={!resetPw}>重置密码</button> <button className={btnGhost} onClick={() => setResetId("")}>取消</button></div>
        </div>
      )}

      {/* 删除确认 */}
      {delId && (
        <div className="rounded-lg border bg-red-50 border-red-200 p-4 text-sm space-y-2">
          <p>确定要删除教师「{nameLabel(teachers, delId)}」吗？删除后该账号将无法登录，其数据保留。</p>
          <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 统计概览 ---------------- */

type AdminStats = Record<"teachers" | "documents" | "questions" | "approvedQuestions" | "papers" | "wrongRecords" | "classes" | "students" | "assignments" | "learningRecords", number>;

const STAT_LABELS: Array<[keyof AdminStats, string]> = [
  ["teachers", "教师"], ["documents", "试卷文档"], ["questions", "题目"], ["approvedQuestions", "已审核题目"],
  ["papers", "试卷"], ["wrongRecords", "错题记录"], ["classes", "班级"], ["students", "学生"],
  ["assignments", "作业"], ["learningRecords", "学习记录"],
];

function AdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const r = await api<{ admin: Record<string, unknown>; stats: AdminStats }>("/api/admin");
    if (r.ok) setStats(r.data.stats); else setError(r.error);
  })(); }, []);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-muted-foreground">加载中…</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {STAT_LABELS.map(([key, label]) => <StatCard key={key} label={label} value={stats[key] ?? 0} />)}
    </div>
  );
}

/* ---------------- 状态标签 / 日期 ---------------- */

const STATUS_STYLE: Record<string, string> = {
  uploading: "bg-gray-100 text-gray-700",
  awaiting_model: "bg-gray-200 text-gray-700",
  extracting: "bg-blue-100 text-blue-700",
  reviewing: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-600",
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  open: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-700",
};

function StatusTag({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

function fmt(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card divide-y">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

/* ---------------- 错题管理 ---------------- */

type WrongRecord = { id: string; ownerId: string; ownerName: string | null; questionId: string; stem: string; type: string; documentName: string; userAnswer: string; correctAnswer: string; wrongReason: string | null; firstWrongAt: string; lastReviewedAt: string | null; reviewCount: number; masteryLevel: string; status: string; createdAt: string };

const MASTERY_LEVELS = ["unfamiliar", "learning", "mastered"] as const;

function AdminWrong() {
  const { items: records, loading, error, reload } = useList<WrongRecord>(async () => {
    const r = await api<{ records: WrongRecord[]; pagination: { total: number } }>("/api/admin/wrong-records?page=1&pageSize=50");
    return withList(r, (data) => data.records);
  });
  const [busyId, setBusyId] = useState("");
  const [saveOk, setSaveOk] = useState("");
  const [delId, setDelId] = useState("");

  const setMastery = async (id: string, level: string) => {
    setBusyId(id); setSaveOk("");
    const r = await api(`/api/admin/wrong-records/${id}`, { method: "PATCH", body: JSON.stringify({ masteryLevel: level }) });
    if (r.ok) setSaveOk(`已将 ${id.slice(0, 8)} 设为 ${level}`); else alert(r.error);
    setBusyId(""); void reload();
  };
  const setStatus = async (id: string, status: string) => {
    const r = await api(`/api/admin/wrong-records/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (!r.ok) alert(r.error);
    void reload();
  };
  const del = async () => {
    const r = await api(`/api/admin/wrong-records/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void reload();
  };

  if (loading && records.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <Section title={`错题记录（${records.length} 条）`}>
      {saveOk && <p className="px-3 py-2 text-xs text-green-600">{saveOk}</p>}
      <div className="grid grid-cols-[1.6fr_1fr_0.7fr_1fr_0.8fr_0.9fr_1fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span>题目</span><span>题型</span><span>文档</span><span>掌握度</span><span>状态</span><span>错误原因</span><span>记录时间</span><span>操作</span>
      </div>
      {records.map((r) => (
        <div key={r.id} className="grid grid-cols-[1.6fr_1fr_0.7fr_1fr_0.8fr_0.9fr_1fr_auto] gap-2 items-center px-3 py-2 text-sm">
          <span className="truncate" title={r.stem}>{r.stem?.slice(0, 40) || "-"}</span>
          <span>{r.type}</span>
          <span className="text-muted-foreground truncate">{r.documentName || "-"}</span>
          <span className="flex flex-col gap-1">
            {MASTERY_LEVELS.map((l) => (
              <button key={l} className={`text-xs px-2 py-0.5 rounded border ${r.masteryLevel === l ? "bg-blue-50 border-blue-300 font-medium" : "border-gray-200 hover:bg-gray-50"}`} disabled={busyId === r.id} onClick={() => void setMastery(r.id, l)}>{l === "unfamiliar" ? "未掌握" : l === "learning" ? "学习中" : "已掌握"}</button>
            ))}
          </span>
          <span><button className={r.status === "open" ? "bg-gray-100 underline" : btnGhost} disabled={busyId === r.id} onClick={() => void setStatus(r.id, r.status === "open" ? "closed" : "open")}>{r.status === "open" ? "开启" : "已关闭"}</button></span>
          <span className="text-muted-foreground text-xs truncate">{r.wrongReason || "-"}</span>
          <span className="text-muted-foreground text-xs">{fmt(r.createdAt)}</span>
          <span><button className={btnDanger} onClick={() => setDelId(r.id)}>删除</button></span>
        </div>
      ))}
      {records.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无错题记录</div>}
      {delId && (
        <div className="px-3 py-3 border-t space-y-2">
          <p className="text-sm">确定要删除错题记录「{records.find((r) => r.id === delId)?.stem?.slice(0, 30) ?? delId.slice(0, 8)}」吗？</p>
          <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
        </div>
      )}
    </Section>
  );
}

/* ---------------- 试卷管理 ---------------- */

type PaperRow = { id: string; ownerId: string; ownerName: string | null; title: string; subtitle: string; questionCount: number; subject: string | null; stage: string | null; createdAt: string; updatedAt: string };

function AdminPapers() {
  const { items: papers, loading, error, reload } = useList<PaperRow>(async () => {
    const r = await api<{ papers: PaperRow[] }>("/api/admin/papers");
    return withList(r, (data) => data.papers);
  });
  const [delId, setDelId] = useState("");
  const del = async () => {
    const r = await api(`/api/admin/papers/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void reload();
  };
  if (loading && papers.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <Section title={`试卷（${papers.length} 份）`}>
      <div className="grid grid-cols-[1.5fr_1fr_0.6fr_0.8fr_0.8fr_1fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span>标题</span><span>所有者</span><span>题目数</span><span>学科</span><span>学段</span><span>更新时间</span><span>操作</span>
      </div>
      {papers.map((p) => (
        <div key={p.id} className="grid grid-cols-[1.5fr_1fr_0.6fr_0.8fr_0.8fr_1fr_auto] gap-2 items-center px-3 py-2 text-sm">
          <span className="font-medium truncate" title={p.title}>{p.title}</span>
          <span className="text-muted-foreground truncate">{p.ownerName ?? "-"}</span>
          <span>{p.questionCount}</span>
          <span className="text-muted-foreground">{p.subject || "-"}</span>
          <span className="text-muted-foreground">{p.stage || "-"}</span>
          <span className="text-muted-foreground text-xs">{fmt(p.updatedAt)}</span>
          <span><button className={btnDanger} onClick={() => setDelId(p.id)}>删除</button></span>
        </div>
      ))}
      {papers.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无试卷</div>}
      {delId && (
        <div className="px-3 py-3 border-t space-y-2">
          <p className="text-sm">确定要删除试卷「{papers.find((p) => p.id === delId)?.title ?? delId.slice(0, 8)}」吗？该操作不可恢复。</p>
          <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
        </div>
      )}
    </Section>
  );
}

/* ---------------- 试卷夹管理 ---------------- */

type FolderRow = { id: string; ownerId: string; ownerName: string | null; name: string; subject: string; stage: string; createdAt: string };

function AdminFolders() {
  const { items: folders, loading, error, reload } = useList<FolderRow>(async () => {
    const r = await api<{ folders: FolderRow[] }>("/api/admin/paper-folders");
    return withList(r, (data) => data.folders);
  });
  const [form, setForm] = useState({ name: "", subject: "数学", stage: "middle" });
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [delId, setDelId] = useState("");

  const create = async () => {
    setFormError(""); setFormOk("");
    const r = await api("/api/admin/paper-folders", { method: "POST", body: JSON.stringify(form) });
    if (r.ok) { setFormOk("已创建文件夹"); setForm({ name: "", subject: "数学", stage: "middle" }); void reload(); }
    else setFormError(r.error);
  };
  const del = async () => {
    const r = await api(`/api/admin/paper-folders/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void reload();
  };

  if (loading && folders.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="space-y-4">
      <Section title={`试卷夹（${folders.length} 个）`}>
        <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_1.4fr] gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>名称</span><span>学科</span><span>学段</span><span>所有者</span><span>创建时间</span>
        </div>
        {folders.map((f) => (
          <div key={f.id} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_1.4fr] gap-2 items-center px-3 py-2 text-sm">
            <span className="font-medium truncate">{f.name}</span><span>{f.subject}</span><span>{f.stage}</span>
            <span className="text-muted-foreground truncate">{f.ownerName ?? "-"}</span>
            <span className="text-muted-foreground text-xs">{fmt(f.createdAt)}</span>
          </div>
        ))}
        {folders.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无文件夹</div>}
        {delId && (
          <div className="px-3 py-3 border-t space-y-2">
            <p className="text-sm">确定要删除试卷夹「{folders.find((f) => f.id === delId)?.name ?? delId.slice(0, 8)}」吗？</p>
            <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
          </div>
        )}
      </Section>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">新建试卷夹</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>名称</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：人教版必修" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学科</span><input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学段</span><input className={inputClass} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} /></label>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
        {formOk && <p className="text-xs text-green-600">{formOk}</p>}
        <div><button className={btnPrimary} onClick={() => void create()}>创建文件夹</button></div>
      </div>
    </div>
  );
}

/* ---------------- 班级学生管理 ---------------- */

type ClassRow = { id: string; ownerId: string; ownerName: string | null; name: string; grade: string; subject: string; schoolYear: string; archived: number; studentCount: number; createdAt: string; updatedAt: string };

function AdminClasses() {
  const { items: classes, loading, error, reload } = useList<ClassRow>(async () => {
    const r = await api<{ classes: ClassRow[] }>("/api/admin/classes");
    return withList(r, (data) => data.classes);
  });
  const [form, setForm] = useState({ name: "", grade: "", subject: "数学", schoolYear: "" });
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [delId, setDelId] = useState("");

  const create = async () => {
    setFormError(""); setFormOk("");
    const r = await api("/api/admin/classes", { method: "POST", body: JSON.stringify(form) });
    if (r.ok) { setFormOk("班级已创建"); setForm({ name: "", grade: "", subject: "数学", schoolYear: "" }); void reload(); }
    else setFormError(r.error);
  };
  const del = async () => {
    const r = await api(`/api/admin/classes/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void reload();
  };

  if (loading && classes.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="space-y-4">
      <Section title={`班级（${classes.length} 个）`}>
        <div className="grid grid-cols-[1.5fr_0.9fr_0.8fr_0.9fr_1.2fr_0.6fr_1.2fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>名称</span><span>年级</span><span>学科</span><span>学年</span><span>所有者</span><span>学生数</span><span>更新时间</span><span>操作</span>
        </div>
        {classes.map((c) => (
          <div key={c.id} className="grid grid-cols-[1.5fr_0.9fr_0.8fr_0.9fr_1.2fr_0.6fr_1.2fr_auto] gap-2 items-center px-3 py-2 text-sm">
            <span className="font-medium truncate">{c.name}{c.archived ? "（已归档）" : ""}</span>
            <span>{c.grade}</span><span>{c.subject}</span><span className="text-muted-foreground truncate">{c.schoolYear}</span>
            <span className="text-muted-foreground truncate">{c.ownerName ?? "-"}</span>
            <span>{c.studentCount}</span>
            <span className="text-muted-foreground text-xs">{fmt(c.updatedAt)}</span>
            <span><button className={btnDanger} onClick={() => setDelId(c.id)}>删除</button></span>
          </div>
        ))}
        {classes.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无班级</div>}
        {delId && (
          <div className="px-3 py-3 border-t space-y-2">
            <p className="text-sm">确定要删除班级「{classes.find((c) => c.id === delId)?.name ?? delId.slice(0, 8)}」吗？该操作会清空班级成员，学生本身保留。</p>
            <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
          </div>
        )}
      </Section>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">新建班级</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>班级名称</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：九年级（1）班" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>年级</span><input className={inputClass} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="如：九年级" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学科</span><input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学年</span><input className={inputClass} value={form.schoolYear} onChange={(e) => setForm({ ...form, schoolYear: e.target.value })} placeholder="如：2026-2027" /></label>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
        {formOk && <p className="text-xs text-green-600">{formOk}</p>}
        <div><button className={btnPrimary} onClick={() => void create()}>创建班级</button></div>
      </div>
    </div>
  );
}

/* ---------------- 学生管理 ---------------- */

type StudentRow = { id: string; ownerId: string; ownerName: string | null; studentNo: string; name: string; classCount: number; createdAt: string };

function AdminStudents() {
  const { items: students, loading, error, reload } = useList<StudentRow>(async () => {
    const r = await api<{ students: StudentRow[] }>("/api/admin/students");
    return withList(r, (data) => data.students);
  });
  const [form, setForm] = useState({ studentNo: "", name: "" });
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [delId, setDelId] = useState("");

  const create = async () => {
    setFormError(""); setFormOk("");
    const r = await api("/api/admin/students", { method: "POST", body: JSON.stringify(form) });
    if (r.ok) { setFormOk("学生已创建"); setForm({ studentNo: "", name: "" }); void reload(); }
    else setFormError(r.error);
  };
  const del = async () => {
    const r = await api(`/api/admin/students/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void reload();
  };

  if (loading && students.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="space-y-4">
      <Section title={`学生（${students.length} 人）`}>
        <div className="grid grid-cols-[0.9fr_1.2fr_0.6fr_1.2fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>学号</span><span>姓名</span><span>班级数</span><span>所属教师</span><span>操作</span>
        </div>
        {students.map((s) => (
          <div key={s.id} className="grid grid-cols-[0.9fr_1.2fr_0.6fr_1.2fr_auto] gap-2 items-center px-3 py-2 text-sm">
            <span className="font-medium">{s.studentNo}</span>
            <span className="truncate">{s.name}</span>
            <span>{s.classCount}</span>
            <span className="text-muted-foreground truncate">{s.ownerName ?? "-"}</span>
            <span><button className={btnDanger} onClick={() => setDelId(s.id)}>删除</button></span>
          </div>
        ))}
        {students.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无学生</div>}
        {delId && (
          <div className="px-3 py-3 border-t space-y-2">
            <p className="text-sm">确定要删除学生「{students.find((s) => s.id === delId)?.name ?? delId.slice(0, 8)}」吗？该操作会同时移出其所有班级，不可恢复。</p>
            <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
          </div>
        )}
      </Section>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">新建学生</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>学号</span><input className={inputClass} value={form.studentNo} onChange={(e) => setForm({ ...form, studentNo: e.target.value })} placeholder="如：00101" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>姓名</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="学生姓名" /></label>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
        {formOk && <p className="text-xs text-green-600">{formOk}</p>}
        <div><button className={btnPrimary} onClick={() => void create()}>创建学生</button></div>
      </div>
    </div>
  );
}

/* ---------------- 作业管理 ---------------- */

type AssignmentRow = { id: string; ownerId: string; ownerName: string | null; title: string; assignmentCode: string; status: string; dueAt: string | null; totalScore: number; createdAt: string };

function AdminAssignments() {
  const { items: assignments, loading, error, reload } = useList<AssignmentRow>(async () => {
    const r = await api<{ assignments: AssignmentRow[] }>("/api/admin/assignments");
    return withList(r, (data) => data.assignments);
  });
  const [delId, setDelId] = useState("");
  const del = async () => {
    const r = await api(`/api/admin/assignments/${delId}`, { method: "DELETE" });
    if (!r.ok) alert(r.error);
    setDelId(""); void reload();
  };
  if (loading && assignments.length === 0 && !error) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <Section title={`作业（${assignments.length} 份）`}>
      <div className="grid grid-cols-[1.6fr_1fr_0.7fr_0.8fr_0.8fr_1.4fr_auto] gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span>标题</span><span>所有者</span><span>状态</span><span>截止时间</span><span>总分</span><span>更新时间</span><span>操作</span>
      </div>
      {assignments.map((a) => (
        <div key={a.id} className="grid grid-cols-[1.6fr_1fr_0.7fr_0.8fr_0.8fr_1.4fr_auto] gap-2 items-center px-3 py-2 text-sm">
          <span className="font-medium truncate" title={a.title}>{a.title}</span>
          <span className="text-muted-foreground truncate">{a.ownerName ?? "-"}</span>
          <span><StatusTag status={a.status} /></span>
          <span className="text-muted-foreground text-xs">{fmt(a.dueAt)}</span>
          <span>{a.totalScore || "-"}</span>
          <span className="text-muted-foreground text-xs">{fmt(a.createdAt)}</span>
          <span><button className={btnDanger} onClick={() => setDelId(a.id)}>删除</button></span>
        </div>
      ))}
      {assignments.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">暂无作业</div>}
      {delId && (
        <div className="px-3 py-3 border-t space-y-2">
          <p className="text-sm">确定要删除作业「{assignments.find((a) => a.id === delId)?.title ?? delId.slice(0, 8)}」吗？该操作不可恢复。</p>
          <div><button className={btnDanger} onClick={() => void del()}>确认删除</button> <button className={btnGhost} onClick={() => setDelId("")}>取消</button></div>
        </div>
      )}
    </Section>
  );
}

/* ---------------- 系统设置 ---------------- */

function AdminSettings() {
  const [appName, setAppName] = useState("拣题");
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [siteNotice, setSiteNotice] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const r = await api<{ settings: { appName: string; registrationOpen: boolean; siteNotice: string } }>("/api/admin/settings");
    if (r.ok) { setAppName(r.data.settings.appName); setRegistrationOpen(r.data.settings.registrationOpen); setSiteNotice(r.data.settings.siteNotice); }
    else setError(r.error);
  })(); }, []);
  const save = async () => {
    setMessage(""); setError("");
    const r = await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ appName, registrationOpen, siteNotice }) });
    if (r.ok) setMessage("设置已保存"); else setError(r.error);
  };
  return (
    <div className="space-y-4">
      <Section title="系统设置">
        <div className="px-3 py-3 space-y-4">
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>应用名称（显示在登录页标题）</span><input className={inputClass} value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="拣题" /></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>允许新教师注册</span><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={registrationOpen} onChange={(e) => setRegistrationOpen(e.target.checked)} /> 开放注册</label></label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1"><span>系统公告（显示在工作台页面顶部）</span><textarea className={`${inputClass} min-h-20`} value={siteNotice} onChange={(e) => setSiteNotice(e.target.value)} placeholder="可选" /></label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {message && <p className="text-xs text-green-600">{message}</p>}
          <div><button className={btnPrimary} onClick={() => void save()}>保存设置</button></div>
        </div>
      </Section>
    </div>
  );
}

/* ---------------- 主组件 ---------------- */

export function AdminConsole() {
  const [tab, setTab] = useState<Tab>("stats");
  useEffect(() => {
    fetch("/api/admin").then((r) => { if (!r.ok) window.location.assign("/"); }).catch(() => window.location.assign("/"));
  }, []);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">后台管理</h1>
        <p className="text-sm text-muted-foreground mt-1">集中管理教师、题库、错题、试卷、班级与系统设置</p>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-gray-100 pb-2">
        {TABS.map((item) => (
          <button key={item.value} onClick={() => setTab(item.value)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${tab === item.value ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </nav>
      <div key={tab} className="space-y-4">
        {tab === "stats" && <AdminStats />}
        {tab === "teachers" && <AdminTeachers />}
        {tab === "questions" && <AdminQuestionBank />}
        {tab === "wrong" && <AdminWrong />}
        {tab === "papers" && <AdminPapers />}
        {tab === "folders" && <AdminFolders />}
        {tab === "classes" && <AdminClasses />}
        {tab === "students" && <AdminStudents />}
        {tab === "assignments" && <AdminAssignments />}
        {tab === "settings" && <AdminSettings />}
      </div>
    </div>
  );
}
