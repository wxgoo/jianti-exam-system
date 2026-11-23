"use client";

import Link from "next/link";
import { ExternalLink, FileUp, LoaderCircle, Search, Download, X, BookOpen, Globe2, Filter, Archive, CheckCircle2, AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchUploadJson } from "../lib/upload-request";
import { WorkbenchDialog } from "./WorkbenchDialog";

// ====== 第一试卷网 · 抓取服务 ======
const SHOUJUAN_SUBJECTS: Record<string, string> = {
  语文: "sjyw", 数学: "sjsx", 英语: "sjyy", 物理: "sjwl", 化学: "sjhx",
  政治: "sjzz", 历史: "sjls", 地理: "sjdl", 生物: "sjsw",
};

const SHOUJUAN_GRADES: Record<string, string> = {
  一年级: "1", 二年级: "2", 三年级: "3", 四年级: "4", 五年级: "5", 六年级: "6",
  七年级: "7", 八年级: "8", 九年级: "9",
  中考试卷: "zk", 高一: "g1", 高二: "g2", 高三: "g3", 高考试卷: "gk",
};

type ShijuanItem = {
  id: string;
  title: string;
  pageUrl: string;
  downUrl?: string;
  version?: string;
  year?: string;
  fileType?: string;
};

type ShijuanResult = {
  items: ShijuanItem[];
  pageCount: number;
  currentPage: number;
  source: "shijuan1";
};

type BackendStatus = {
  backend: { backend: string; executable: string } | null;
  installHint: string;
  platform: string;
  hasPython: boolean;
};

type AutoImportOutcome = {
  totalDocuments: number;
  totalImportedQuestions: number;
  backendUsed: string;
  documents: Array<{ documentId: string; name: string; questionCount: number; warnings: string[] }>;
  skippedReason?: string[];
  archiveSize: number;
  extractedTotal: number;
};

// ====== 组卷网 / 学科网 · 油猴脚本 ======
const TAMPERMONKEY_SCRIPTS = [
  {
    name: "学科网 / 组卷网 · 题目导出",
    url: "https://github.com/Frank-678/zxxk-zujuan-paper-downloader",
    hint: "打开仓库，点 README 里的「安装脚本」链接导入 Tampermonkey / Violentmonkey。",
  },
];

type ImportResult = { documentId: string; name?: string; questionCount: number; warnings?: string[] };

export function SourceFinderDialog({ open, onClose, subject, grade }: {
  open: boolean; onClose: () => void; subject: string; grade: string;
}) {
  const [tab, setTab] = useState<"shijuan1" | "zujuan">("shijuan1");

  // ====== 第一试卷网 状态 ======
  const [sourceSubject, setSourceSubject] = useState(
    Object.keys(SHOUJUAN_SUBJECTS).includes(subject) ? subject : "数学"
  );
  const [sourceGrade, setSourceGrade] = useState(
    Object.keys(SHOUJUAN_GRADES).includes(grade) ? grade : "九年级"
  );
  const [versionKw, setVersionKw] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [result, setResult] = useState<ShijuanResult | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [autoImportOutcome, setAutoImportOutcome] = useState<AutoImportOutcome | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);

  // ====== 组卷网导入 状态 ======
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开时探测解压后端
  useEffect(() => {
    if (!open || tab !== "shijuan1") return;
    fetch(`/api/sources/shijuan1?action=archive-backends`)
      .then((r) => r.json())
      .then((data: BackendStatus) => setBackendStatus(data))
      .catch(() => setBackendStatus(null));
  }, [open, tab]);

  async function doSearch(page = 1) {
    setSearching(true);
    setSearchError("");
    try {
      const params = new URLSearchParams({ subject: sourceSubject, grade: sourceGrade, page: String(page) });
      if (versionKw.trim()) params.set("version", versionKw.trim());
      const response = await fetch(`/api/sources/shijuan1?action=search&${params}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `搜索失败 (${response.status})`);
      }
      setResult((await response.json()) as ShijuanResult);
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : "搜索失败");
      setResult(null);
    } finally {
      setSearching(false);
    }
  }

  async function downloadItem(item: ShijuanItem) {
    if (!item.downUrl) { window.open(item.pageUrl, "_blank", "noopener"); return; }
    setDownloadingId(item.id);
    try {
      const params = new URLSearchParams({ action: "download", url: item.downUrl, filename: `${item.title}.rar` });
      const a = document.createElement("a");
      a.href = `/api/sources/shijuan1?${params}`;
      a.download = `${item.title}.rar`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloadingId(null), 1500);
    }
  }

  async function autoImportItem(item: ShijuanItem) {
    if (!item.downUrl) { window.open(item.pageUrl, "_blank", "noopener"); return; }
    setImportingId(item.id);
    setAutoImportOutcome(null);
    try {
      const form = new FormData();
      form.set("url", item.downUrl);
      form.set("filename", `${item.title}.rar`);
      form.set("subject", sourceSubject);
      form.set("grade", sourceGrade);
      if (item.version) form.set("sourceTextbook", item.version);
      if (item.year) form.set("sourceYear", item.year);

      const response = await fetch("/api/sources/shijuan1?action=import", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(`服务器缺少解压后端：${data.error ?? "请安装 unrar 或 7-Zip"}`);
        }
        throw new Error(data.error ?? `自动入库失败 (${response.status})`);
      }
      setAutoImportOutcome(data as AutoImportOutcome);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "自动入库失败");
    } finally {
      setImportingId(null);
    }
  }

  async function importExport(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(""); setImportResult(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("file", file));
      form.set("subject", subject); form.set("grade", grade);
      ["sourceYear", "sourceExamType", "sourceRegion", "sourceTextbook", "sourceSchool"].forEach((k) => form.set(k, ""));
      setImportResult(await fetchUploadJson<ImportResult>("/api/imports/zujuan", { method: "POST", body: form }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败，请重试");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const hasBackend = Boolean(backendStatus?.backend);

  return (
    <WorkbenchDialog
      open={open}
      titleId="source-finder-title"
      onClose={onClose}
      className="wb-import-dialog"
      busy={busy || searching || Boolean(importingId)}
    >
      <header className="wb-dialog-header">
        <div>
          <h2 id="source-finder-title">找题 / 下载试卷</h2>
          <p>自动搜索 → 一键下载 .rar → 后端自动解压入库</p>
        </div>
        <button type="button" className="wb-icon-button" aria-label="关闭" onClick={onClose}>
          <X size={19} />
        </button>
      </header>

      <nav className="wb-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "shijuan1"} className={`wb-tab ${tab === "shijuan1" ? "wb-tab-active" : ""}`} onClick={() => setTab("shijuan1")}>
          <BookOpen size={14} /> 第一试卷网
        </button>
        <button role="tab" aria-selected={tab === "zujuan"} className={`wb-tab ${tab === "zujuan" ? "wb-tab-active" : ""}`} onClick={() => setTab("zujuan")}>
          <Globe2 size={14} /> 组卷网 / 学科网
        </button>
      </nav>

      <div className="wb-dialog-body wb-import-layout">
        {/* ======== Tab 1: 第一试卷网 ======== */}
        {tab === "shijuan1" && (
          <>
            <section className="wb-import-settings">
              <div className="wb-import-destination">
                <Search size={20} aria-hidden="true" />
                <div>
                  <span>第一试卷网 · 自动抓取</span>
                  <strong>选好条件后点搜索 → 点「自动下载并入库」</strong>
                  <p>后端自动下载 .rar → 解压 → 把里面的 Word/PDF 直接送入题库审核流程。</p>
                </div>
              </div>

              {/* 解压后端状态提示 */}
              {backendStatus && (
                <div className={`wb-backend-status ${hasBackend ? "wb-backend-ok" : "wb-backend-missing"}`}>
                  {hasBackend
                    ? <>
                      <CheckCircle2 size={16} />
                      <span>后端解压就绪：<strong>{backendStatus.backend!.backend}</strong> ({backendStatus.backend!.executable})</span>
                    </>
                    : <>
                      <AlertTriangle size={16} />
                      <span>未检测到解压后端，「自动入库」按钮会禁用。{backendStatus.installHint}</span>
                    </>}
                </div>
              )}

              <div className="wb-field">
                <label htmlFor="sf-subject">科目</label>
                <select id="sf-subject" value={sourceSubject} onChange={(e) => setSourceSubject(e.target.value)}>
                  {Object.keys(SHOUJUAN_SUBJECTS).map((name) => <option key={name}>{name}</option>)}
                </select>
              </div>
              <div className="wb-field">
                <label htmlFor="sf-grade">年级</label>
                <select id="sf-grade" value={sourceGrade} onChange={(e) => setSourceGrade(e.target.value)}>
                  {Object.keys(SHOUJUAN_GRADES).map((name) => <option key={name}>{name}</option>)}
                </select>
              </div>
              <div className="wb-field">
                <label htmlFor="sf-version">版本关键词 <small className="wb-field-hint">（可选，如「人教版」「苏教版」）</small></label>
                <input id="sf-version" type="text" placeholder="留空=全部版本" value={versionKw} onChange={(e) => setVersionKw(e.target.value)} />
              </div>

              <button type="button" className="wb-button wb-primary" disabled={searching} onClick={() => doSearch(1)}>
                {searching ? <LoaderCircle size={15} className="spin" /> : <Filter size={15} />}
                {searching ? "正在搜索…" : "搜索匹配试卷"}
              </button>
              {searchError && <p role="alert" className="wb-field-error">{searchError}</p>}

              <div className="wb-field-hint">
                <ExternalLink size={12} /> 也可以
                <a href={`https://www.shijuan1.com/a/${SHOUJUAN_SUBJECTS[sourceSubject]}${SHOUJUAN_GRADES[sourceGrade]}`}
                  target="_blank" rel="noopener noreferrer" className="wb-link">直接打开栏目页</a>
                在浏览器里手动搜索下载。
              </div>
            </section>

            <section className="wb-import-files">
              <div className="wb-import-section-heading">
                <h3>搜索结果</h3>
                {result && <p>第 <strong>{result.currentPage}</strong> / {result.pageCount} 页，共展示 <strong>{result.items.length}</strong> 份试卷</p>}
              </div>

              {!result && !searching && <div className="wb-empty">选择条件后点「搜索匹配试卷」开始查找</div>}
              {searching && !result && (
                <div className="wb-empty">
                  <LoaderCircle size={20} className="spin" />
                  <p>正在从第一试卷网抓取试卷列表…</p>
                  <small>提示：该网站使用 GB2312 编码，首次加载稍慢</small>
                </div>
              )}

              {/* 自动入库结果展示 */}
              {autoImportOutcome && (
                <div className="wb-auto-import-result">
                  {autoImportOutcome.totalDocuments > 0 ? (
                    <>
                      <CheckCircle2 size={20} />
                      <div>
                        <p>
                          <strong>成功</strong> — 通过 {autoImportOutcome.backendUsed} 解压，
                          导入 <strong>{autoImportOutcome.totalDocuments}</strong> 份文档、
                          合计 <strong>{autoImportOutcome.totalImportedQuestions}</strong> 道题目。
                        </p>
                        <p className="wb-field-hint">共解压 {autoImportOutcome.extractedTotal} 个文件，源 RAR {Math.round(autoImportOutcome.archiveSize / 1024)} KB。</p>
                        {autoImportOutcome.skippedReason?.length ? (
                          <ul className="wb-field-hint">
                            {autoImportOutcome.skippedReason.map((r, i) => <li key={i}>跳过：{r}</li>)}
                          </ul>
                        ) : null}
                        <div className="wb-inline-row" style={{ marginTop: 8 }}>
                          {autoImportOutcome.documents.map((doc) => (
                            <Link key={doc.documentId} className="wb-button" href={`/review/${doc.documentId}`}>
                              去审核「{doc.name}」({doc.questionCount} 题)
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={20} />
                      <div>
                        <p><strong>未找到可入库的 .docx</strong>，请先解压 .rar 把里面的 .doc 另存为 .docx，再用「导入试卷」上传。</p>
                        {autoImportOutcome.skippedReason?.length ? (
                          <ul className="wb-field-hint">
                            {autoImportOutcome.skippedReason.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              )}

              {result && (
                <>
                  <ul className="shijuan-list">
                    {result.items.map((item) => (
                      <li key={item.id} className="shijuan-item">
                        <div className="shijuan-info">
                          <a href={item.pageUrl} target="_blank" rel="noopener noreferrer" className="shijuan-title">
                            {item.title}
                            {item.year && <span className="shijuan-year">{item.year}</span>}
                            {item.version && <span className="shijuan-year">{item.version}</span>}
                            <ExternalLink size={12} className="shijuan-ext" />
                          </a>
                        </div>
                        <div className="shijuan-actions">
                          {item.downUrl ? (
                            <>
                              <button
                                type="button"
                                className="wb-button wb-primary"
                                disabled={!hasBackend || importingId === item.id}
                                title={hasBackend ? "下载并自动解压入库" : "缺少解压后端，请先安装 unrar / 7-Zip"}
                                onClick={() => autoImportItem(item)}
                              >
                                {importingId === item.id ? <LoaderCircle size={13} className="spin" /> : <Archive size={13} />}
                                自动入库
                              </button>
                              <button
                                type="button"
                                className="wb-button"
                                disabled={downloadingId === item.id}
                                onClick={() => downloadItem(item)}
                              >
                                {downloadingId === item.id ? <LoaderCircle size={13} className="spin" /> : <Download size={13} />}
                                仅下载
                              </button>
                            </>
                          ) : (
                            <a href={item.pageUrl} target="_blank" rel="noopener noreferrer" className="wb-button">
                              <ExternalLink size={13} /> 打开详情页
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {result.pageCount > 1 && (
                    <div className="shijuan-pagination">
                      {result.currentPage > 1 && (
                        <button type="button" className="wb-button" onClick={() => doSearch(result.currentPage - 1)}>上一页</button>
                      )}
                      <span className="wb-field-hint">第 {result.currentPage} / {result.pageCount} 页</span>
                      {result.currentPage < result.pageCount && (
                        <button type="button" className="wb-button" onClick={() => doSearch(result.currentPage + 1)}>下一页</button>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="wb-field-hint" style={{ marginTop: 16 }}>
                <strong>下载后：</strong>
                {hasBackend ? "「自动入库」会让后端自动解压并送入审核；「仅下载」把 .rar 存到你本机，可手工解压后另存为 .docx 再用" : "请先解压 .rar，把里面的 .doc 另存为 .docx，然后用"}
                <Link href="/?import=1" className="wb-link">试卷导入页</Link>上传。
              </div>
            </section>
          </>
        )}

        {/* ======== Tab 2: 组卷网 / 学科网 ======== */}
        {tab === "zujuan" && (
          <>
            <section className="wb-import-settings">
              <div className="wb-import-destination">
                <Globe2 size={20} aria-hidden="true" />
                <div>
                  <span>组卷网 / 学科网 · 油猴脚本导出</span>
                  <strong>安装脚本 → 打开网站 → 导出题目 HTML/ZIP → 回此弹窗导入</strong>
                  <p>本系统不自动抓取组卷网/学科网；题目导出由你在浏览器里手动完成。</p>
                </div>
              </div>

              <div className="wb-import-section-heading"><h3>第一步 · 安装油猴导出脚本</h3></div>
              {TAMPERMONKEY_SCRIPTS.map((script) => (
                <div key={script.url} className="wb-field">
                  <label>{script.name}</label>
                  <a className="wb-button" href={script.url} target="_blank" rel="noopener noreferrer">
                    {script.name.includes("学科") ? "学科网" : script.name.includes("组卷") ? "组卷网" : "打开仓库"}
                    <ExternalLink size={13} />
                  </a>
                  <p className="wb-field-hint">{script.hint}</p>
                </div>
              ))}

              <div className="wb-import-section-heading"><h3>第二步 · 打开网站并导出</h3></div>
              <div className="source-finder-sites">
                <a className="wb-button" href="https://zujuan.xkw.com/" target="_blank" rel="noopener noreferrer">组卷网 <ExternalLink size={13} /></a>
                <a className="wb-button" href="https://www.zxxk.com/zujuan/" target="_blank" rel="noopener noreferrer">学科网组卷 <ExternalLink size={13} /></a>
              </div>
              <ol className="wb-field-hint" style={{ marginLeft: 18 }}>
                <li>用 Chrome/Edge 打开上面的网站，登录账号。</li>
                <li>安装 Tampermonkey / Violentmonkey 扩展，再从脚本仓库安装导出脚本。</li>
                <li>在网站内按脚本提示导出 <strong>当前页的题目 HTML</strong> 或 <strong>答案合集 ZIP</strong>，保存到本机。</li>
              </ol>
            </section>

            <section className="wb-import-files">
              <div className="wb-import-section-heading">
                <h3>第三步 · 导入到题库</h3>
                <p>支持油猴脚本导出的 .html / .zip，上传后自动解析题目进入审核</p>
              </div>
              <input ref={inputRef} className="wb-sr-only" type="file" multiple accept=".html,.htm,.zip"
                aria-label="选择组卷网导出包" disabled={busy}
                onChange={(event) => { void importExport(event.target.files); event.target.value = ""; }} />
              <button type="button" className="wb-button wb-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
                {busy ? <LoaderCircle size={15} className="spin" /> : <FileUp size={15} />}
                {busy ? "正在导入…" : "选择导出文件并导入"}
              </button>
              {error && <p role="alert" className="wb-field-error">{error}</p>}
              {importResult && (
                <div className="source-finder-result" role="status">
                  <p>已解析 <strong>{importResult.questionCount}</strong> 道题，保存为「{importResult.name ?? "组卷网导出"}」。</p>
                  {importResult.warnings?.length ? <ul>{importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
                  <Link className="wb-button" href={`/review/${importResult.documentId}`}>去审核</Link>
                </div>
              )}
              <p className="wb-field-hint">导入后进入文字审核页，确认入库后才能用于组卷；重复文件会被自动识别。</p>
            </section>
          </>
        )}
      </div>
    </WorkbenchDialog>
  );
}
