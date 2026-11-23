import "server-only";
import { headers } from "next/headers";
import { backendUrl } from "./backend-client";
import type * as Questions from "./question-repository";
import type * as School from "./school-workflow";
import type * as PaperLibrary from "./paper-library";
import type * as PaperTemplates from "./paper-template-repository";
import { z } from "zod";

async function query<T>(resource: string, ownerId: string, params: Record<string, unknown> = {}): Promise<T> {
  const requestHeaders = new Headers(await headers());
  for (const name of ["host", "connection", "content-length", "transfer-encoding"]) requestHeaders.delete(name);
  requestHeaders.set("content-type", "application/json");
  requestHeaders.set("oai-authenticated-user-id", ownerId);
  const response = await fetch(backendUrl("/api/view"), {
    method: "POST", headers: requestHeaders, body: JSON.stringify({ resource, ...params }),
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null) as { data?: T; error?: string } | null;
  if (!body || !z.record(z.string(), z.unknown()).safeParse(body).success) throw new Error("后端页面数据响应格式无效，请稍后重试");
  if (!response.ok) throw new Error(body.error ?? `页面数据加载失败（HTTP ${response.status}）`);
  if (!Object.hasOwn(body, "data")) throw new Error("后端页面数据响应缺少 data 字段");
  return body.data as T;
}

export const getDocuments = (ownerId: string): ReturnType<typeof Questions.getDocuments> => query("documents", ownerId);
export const getDocumentPage = (ownerId: string): ReturnType<typeof Questions.getDocumentPage> => query("document-page", ownerId);
export const getBankData = (ownerId: string): ReturnType<typeof Questions.getBankData> => query("bank", ownerId);
export const getReviewData = (id: string, ownerId: string): ReturnType<typeof Questions.getReviewData> => query("review", ownerId, { id });
export const getApprovedQuestions = (ownerId: string, ids?: string[]): ReturnType<typeof Questions.getApprovedQuestions> => query("approved-questions", ownerId, { ids });
export const getPaperData = (id: string, ownerId: string): ReturnType<typeof Questions.getPaperData> => query("paper", ownerId, { id });
export const getUploadedPaperData = (id: string, ownerId: string): ReturnType<typeof Questions.getUploadedPaperData> => query("uploaded-paper", ownerId, { id });
export const getPaperLibrary = (ownerId: string): ReturnType<typeof PaperLibrary.getPaperLibrary> => query("paper-library", ownerId);
export const getPaperTemplates = (...args: Parameters<typeof PaperTemplates.getPaperTemplates>): ReturnType<typeof PaperTemplates.getPaperTemplates> => query("paper-templates", args[0], { subject: args[1], stage: args[2] });
export const getTeacherMode = (ownerId: string): ReturnType<typeof School.getTeacherMode> => query("teacher-mode", ownerId);
export const listTeachingClasses = (ownerId: string): ReturnType<typeof School.listTeachingClasses> => query("classes", ownerId);
export const getTeachingClass = (ownerId: string, id: string): ReturnType<typeof School.getTeachingClass> => query("class", ownerId, { id });
export const listAssignments = (ownerId: string): ReturnType<typeof School.listAssignments> => query("assignments", ownerId);
export const getAssignmentDetail = (ownerId: string, id: string): ReturnType<typeof School.getAssignmentDetail> => query("assignment", ownerId, { id });
export const getPaperPrintDataForToken = (id: string, token?: string): ReturnType<typeof Questions.getPaperPrintData> => query("paper-print", "local-demo", { id, token });

/** 错题本：直接调用后端 API（不经 readModel 代理） */
type WrongBookStats = { total: number; open: number; mastered: number; byMastery: Array<{ level: string; n: number }> };

export async function getWrongBookStats(ownerId: string, studentId?: string): Promise<WrongBookStats> {
  const url = new URL("/api/wrong-book", backendUrl("").origin);
  if (studentId) url.searchParams.set("studentId", studentId);
  const res = await fetch(url.toString(), { headers: { "oai-authenticated-user-id": ownerId }, cache: "no-store" });
  if (!res.ok) throw new Error("错题本统计加载失败");
  const data = await res.json() as { stats: WrongBookStats };
  return data.stats;
}

export async function listWrongRecords(ownerId: string, options: { studentId?: string; status?: string; masteryLevel?: string; limit?: number } = {}): Promise<Array<Record<string, unknown>>> {
  const url = new URL("/api/wrong-book", backendUrl("").origin);
  if (options.studentId) url.searchParams.set("studentId", options.studentId);
  if (options.status) url.searchParams.set("status", options.status);
  if (options.masteryLevel) url.searchParams.set("masteryLevel", options.masteryLevel);
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  const res = await fetch(url.toString(), { headers: { "oai-authenticated-user-id": ownerId }, cache: "no-store" });
  if (!res.ok) throw new Error("错题本列表加载失败");
  const data = await res.json() as { records: Array<Record<string, unknown>> };
  return data.records;
}

/** 学习统计 */
export async function getLearningStats(ownerId: string, studentId?: string) {
  const url = new URL("/api/learning/stats", backendUrl("").origin);
  if (studentId) url.searchParams.set("studentId", studentId);
  const res = await fetch(url.toString(), { headers: { "oai-authenticated-user-id": ownerId }, cache: "no-store" });
  if (!res.ok) throw new Error("学习统计加载失败");
  return res.json();
}

/** 练习历史 */
export async function getPracticeHistory(ownerId: string, studentId?: string, limit = 20) {
  const url = new URL("/api/learning/stats", backendUrl("").origin);
  if (studentId) url.searchParams.set("studentId", studentId);
  const res = await fetch(url.toString(), { headers: { "oai-authenticated-user-id": ownerId }, cache: "no-store" });
  if (!res.ok) throw new Error("练习历史加载失败");
  return res.json();
}

/** 学习分析聚合（近N天趋势、题型分布、薄弱题目） */
export async function getLearningAnalytics(ownerId: string, studentId?: string, days = 30) {
  const url = new URL("/api/learning/analytics", backendUrl("").origin);
  if (studentId) url.searchParams.set("studentId", studentId);
  url.searchParams.set("days", String(days));
  const res = await fetch(url.toString(), { headers: { "oai-authenticated-user-id": ownerId }, cache: "no-store" });
  if (!res.ok) throw new Error("学习分析加载失败");
  return res.json();
}
