"use client";
import { educationScopeCookie, normalizeEducationScope, type EducationScope } from "../lib/education-scope";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  LibraryBig,
  FilePlus2,
  FolderOpen,
  House,
  ClipboardCheck,
  Settings2,
  Menu,
  X,
  SlidersHorizontal,
  Users,
  AlertCircle,
  RefreshCw,
  LogOut,
  User,
  Power,
  ShieldCheck,
} from "lucide-react";
import { educationStages, subjects, type EducationStage } from "../lib/education-taxonomy";
import type { TeacherMode } from "../lib/school-workflow";

type EducationScopeValue = {
  subject: string;
  stage: EducationStage;
  setSubject: (value: string) => void;
  setStage: (value: EducationStage) => void;
};

const EducationScopeContext = createContext<EducationScopeValue>({
  subject: "数学",
  stage: "middle",
  setSubject: () => undefined,
  setStage: () => undefined,
});

export function useEducationScope() {
  return useContext(EducationScopeContext);
}

type TeacherModeValue = { mode: TeacherMode; setMode: (mode: TeacherMode) => Promise<void>; changing: boolean };
const TeacherModeContext = createContext<TeacherModeValue>({ mode: "personal", setMode: async () => undefined, changing: false });
export function useTeacherMode() { return useContext(TeacherModeContext); }

export type TeacherSession = {
  teacherId: string;
  username: string;
  name: string;
  school: string;
  subject: string;
  role: string;
  exp: number;
};

const TeacherContext = createContext<TeacherSession | null>(null);
export function useTeacher() { return useContext(TeacherContext); }

export async function logoutTeacher() {
  await fetch("/api/auth/logout", { method: "POST" });
}

type NavItem = { href: string; label: string; icon: typeof House; schoolOnly?: boolean; adminOnly?: boolean };
const navigation: NavItem[] = [
  { href: "/", label: "工作台", icon: House },
  { href: "/bank", label: "题库", icon: LibraryBig },
  { href: "/papers/new", label: "组卷", icon: FilePlus2 },
  { href: "/papers", label: "试卷库", icon: FolderOpen },
  { href: "/wrong-book", label: "错题本", icon: AlertCircle },
  { href: "/wrong-book/review", label: "错题复习", icon: RefreshCw },
  { href: "/practice", label: "练习", icon: BookOpen },
  { href: "/learning/analytics", label: "学习分析", icon: BarChart3 },
  { href: "/classes", label: "班级学生", icon: Users, schoolOnly: true },
  { href: "/assignments", label: "作业批改", icon: ClipboardCheck, schoolOnly: true },
  { href: "/settings/skills", label: "识题规则", icon: BookOpen },
  { href: "/settings/models", label: "模型配置", icon: SlidersHorizontal },
  { href: "/settings/usage", label: "模型用量", icon: BarChart3 },
  { href: "/admin", label: "后台管理", icon: ShieldCheck, adminOnly: true },
];

export function AppShell({ children, initialMode, initialScope }: { children: React.ReactNode; initialMode: TeacherMode; initialScope: EducationScope }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setModeState] = useState<TeacherMode>(initialMode);
  const [modeChanging, setModeChanging] = useState(false);
  const [modeError, setModeError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { subject, stage } = initialScope;
  const [scopeChanging, startScopeTransition] = useTransition();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [teacher, setTeacher] = useState<TeacherSession | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(true);

  // 从后端获取当前教师信息
  useEffect(() => {
    async function loadTeacher() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.teacher) {
            setTeacher(data.teacher);
          } else {
            setTeacher(null);
          }
        } else {
          setTeacher(null);
        }
      } catch {
        setTeacher(null);
      } finally {
        setTeacherLoading(false);
      }
    };
    loadTeacher();
  }, []);

  // 进入受保护页面时若本地还没有登录态，先向后端复验；确实未登录才跳登录页。
  // 这样登录成功后的客户端跳转不会因为这里缓存了旧的“未登录”状态而弹回登录页。
  useEffect(() => {
    if (teacherLoading || teacher) return;
    if (pathname.startsWith("/login") || pathname.startsWith("/register")) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (!active) return;
        if (data?.ok && data.teacher) {
          setTeacher(data.teacher);
          setTeacherLoading(false);
          return;
        }
      } catch {
        // 网络异常时不在客户端来回跳转，交由页面自身的错误处理。
        return;
      }
      if (active) router.replace("/login");
    })();
    return () => { active = false; };
  }, [teacherLoading, teacher, pathname, router]);

  useEffect(() => {
    if (document.cookie.split(";").some(item => item.trim().startsWith(`${educationScopeCookie}=`))) return;
    const saved = normalizeEducationScope({ subject: window.localStorage.getItem("teacher-db-subject"), stage: window.localStorage.getItem("teacher-db-stage") });
    document.cookie = `${educationScopeCookie}=${encodeURIComponent(JSON.stringify(saved))}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (saved.subject !== subject || saved.stage !== stage) startScopeTransition(() => router.refresh());
  }, [router, subject, stage]);

  useEffect(() => {
    if (!scopeOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setScopeOpen(false);
        setSubjectOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (subjectOpen) setSubjectOpen(false);
      else setScopeOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [scopeOpen, subjectOpen]);

  const scope = useMemo<EducationScopeValue>(() => {
    const change = (next: EducationScope) => {
      if (next.subject === subject && next.stage === stage) return;
      setScopeOpen(false);
      setSubjectOpen(false);
      document.cookie = `${educationScopeCookie}=${encodeURIComponent(JSON.stringify(next))}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.localStorage.setItem("teacher-db-subject", next.subject);
      window.localStorage.setItem("teacher-db-stage", next.stage);
      startScopeTransition(() => {
        const destination = pathname.startsWith("/review") ? "/" : pathname.startsWith("/papers/") && pathname !== "/papers/new" ? "/papers" : pathname;
        if (destination !== pathname || window.location.search) router.replace(destination);
        router.refresh();
      });
    };
    return { subject, stage, setSubject: value => change({ subject: value, stage }), setStage: value => change({ subject, stage: value }) };
  }, [stage, subject, pathname, router]);

  const modeValue = useMemo<TeacherModeValue>(() => ({
    mode,
    changing: modeChanging,
    setMode: async (nextMode) => {
      if (nextMode === mode || modeChanging) return;
      setModeChanging(true);
      setModeError("");
      try {
        const response = await fetch("/api/teacher-mode", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: nextMode }) });
        if (!response.ok) throw new Error("切换失败");
        setModeState(nextMode);
        if (nextMode === "personal" && (pathname.startsWith("/classes") || pathname.startsWith("/assignments"))) router.push("/");
        router.refresh();
      } catch { setModeError("切换失败，请稍后重试。"); }
      finally { setModeChanging(false); }
    },
  }), [mode, modeChanging, pathname, router]);

  if (/^\/papers\/[^/]+\/print$/.test(pathname) || /^\/assignments\/[^/]+\/answer-sheet$/.test(pathname)) return <>{children}</>;

  return (
    <TeacherModeContext.Provider value={modeValue}><EducationScopeContext.Provider value={scope}><TeacherContext.Provider value={teacher}>
      <div className="app-frame shell-ui">
        <aside className={`sidebar${mobileNavOpen ? " mobile-open" : ""}`}>
          <div className="shell-brand-row">
          <Link href="/" className="brand">
            <span className="brand-mark"><BookOpen size={21} strokeWidth={2.2} /></span>
            <span><strong>拣题</strong><small>教师智能工作台</small></span>
          </Link>
          <button type="button" className="shell-menu-toggle" aria-label={mobileNavOpen ? "收起导航" : "展开导航"} aria-expanded={mobileNavOpen} aria-controls="shell-navigation" onClick={() => setMobileNavOpen(value => !value)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>

          {/* 用户信息区域 */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{teacher?.username || "未登录"}</p>
                <p className="text-xs text-gray-500 truncate">{[teacher?.name && teacher.name !== teacher.username ? teacher.name : "", teacher?.school, teacher?.subject].filter(Boolean).join(" · ")}</p>
              </div>
              {teacher ? (
                <button
                  onClick={async () => {
                    await logoutTeacher();
                    setTeacher(null);
                    router.push("/login");
                  }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded px-2 py-1"
                >
                  <LogOut className="h-3.5 w-3.5" /> 退出
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link href="/login" className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50">登录</Link>
                  <Link href="/register" className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">注册</Link>
                </div>
              )}
            </div>
          </div>

          <div className="shell-navigation" id="shell-navigation">
          <div ref={switcherRef} className={`education-switcher${scopeOpen ? " open" : ""}`} aria-label="教学范围">
            <button
              type="button"
              className="scope-trigger"
              aria-expanded={scopeOpen}
              aria-controls="education-scope-settings"
              onClick={() => { setScopeOpen((value) => !value); setSubjectOpen(false); }}
            >
              <span><small>教学范围</small><strong>{educationStages.find((item) => item.value === stage)?.label} · {subject}</strong></span>
              <i><Settings2 size={15} aria-hidden="true" /></i>
            </button>
            {scopeOpen && (
              <div id="education-scope-settings" className="scope-settings">
                <div className="scope-field-heading"><span>学段</span><small>工作台、题库、试卷库独立</small></div>
                <div className="stage-switch" role="group" aria-label="学段">
                  {educationStages.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={stage === item.value ? "active" : ""}
                      aria-pressed={stage === item.value}
                      onClick={() => scope.setStage(item.value)}
                    >{item.label}</button>
                  ))}
                </div>
                <div className={`subject-picker${subjectOpen ? " open" : ""}`}>
                  <span id="subject-picker-label">学科</span>
                  <button
                    type="button"
                    className="subject-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={subjectOpen}
                    aria-labelledby="subject-picker-label subject-current-value"
                    onClick={() => setSubjectOpen((value) => !value)}
                  >
                    <strong id="subject-current-value">{subject}</strong><ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {subjectOpen && (
                    <div className="subject-menu" role="listbox" aria-labelledby="subject-picker-label">
                      {subjects.map((item) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={subject === item}
                          key={item}
                          onClick={() => { scope.setSubject(item); setSubjectOpen(false); }}
                        ><span>{item}</span>{subject === item && <Check size={13} aria-hidden="true" />}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="teacher-mode-switch" role="group" aria-label="教师工作模式">
            <button type="button" aria-pressed={mode === "personal"} className={mode === "personal" ? "active" : ""} disabled={modeChanging} onClick={() => void modeValue.setMode("personal")}>个人教师</button>
            <button type="button" aria-pressed={mode === "school"} className={mode === "school" ? "active" : ""} disabled={modeChanging} onClick={() => void modeValue.setMode("school")}>学校教师</button>
          </div>
          {modeError && <p className="shell-mode-error" role="alert">{modeError}</p>}
          <nav className="side-nav" aria-label="主导航">
            {[{ label: "教学工作", settings: false }, { label: "设置与用量", settings: true }].map(group => <div className="nav-group" key={group.label}>
            <span className="nav-kicker">{group.label}</span>
            {navigation.filter((item) => (!item.adminOnly || teacher?.role === "admin") && (!item.schoolOnly || mode === "school") && item.href.startsWith("/settings/") === group.settings).map(({ href, label, icon: Icon }) => {
              const active = href === "/"
                ? pathname === "/" || pathname.startsWith("/review")
                : href === "/papers/new"
                  ? pathname === href
                  : href === "/papers"
                    ? pathname === "/papers" || (/^\/papers\/[^/]+$/.test(pathname) && pathname !== "/papers/new")
                    : href === "/wrong-book"
                      ? pathname === href
                      : pathname === href || pathname.startsWith(href + "/");
              return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => setMobileNavOpen(false)}><i><Icon size={18} /></i><span>{label}</span></Link>;
            })}
            </div>)}
          </nav>
          <div className="sidebar-footnote">
            {mode === "school" ? "出题 · 批改 · 教学分析" : "从原卷到题库"}
          </div>
          </div>
        </aside>
        <main className="app-main" key={`${stage}:${subject}`} aria-busy={scopeChanging}>{scopeChanging ? <p role="status">正在切换教学范围…</p> : children}</main>
      </div>
    </TeacherContext.Provider></EducationScopeContext.Provider></TeacherModeContext.Provider>
  );
}
