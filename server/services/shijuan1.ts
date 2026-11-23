/**
 * 第一试卷网 (www.shijuan1.com) 抓取服务。
 *
 * 纯 HTTP 抓取 + GB2312 解码 + HTML 解析，把用户给的 Python 爬虫逻辑翻成 Node。
 * 注意：网站结构如变更，需要同步更新选择器 / regex。
 */

import iconv from "iconv-lite";

const BASE = "https://www.shijuan1.com";

export const SUBJECT_CODES: Record<string, string> = {
  语文: "sjyw", 数学: "sjsx", 英语: "sjyy", 物理: "sjwl", 化学: "sjhx",
  政治: "sjzz", 历史: "sjls", 地理: "sjdl", 生物: "sjsw",
};

export const GRADE_CODES: Record<string, string> = {
  一年级: "1", 二年级: "2", 三年级: "3", 四年级: "4", 五年级: "5", 六年级: "6",
  七年级: "7", 八年级: "8", 九年级: "9",
  中考试卷: "zk", 高一: "g1", 高二: "g2", 高三: "g3", 高考试卷: "gk",
};

export type ShijuanItem = {
  id: string;
  title: string;
  pageUrl: string;
  downUrl?: string;
  version?: string;
  year?: string;
  fileType?: string;
};

export type ShijuanSearchResult = {
  items: ShijuanItem[];
  pageCount: number;
  currentPage: number;
  source: "shijuan1";
};

/** 构造栏目首页 URL */
function buildSectionUrl(subject: string, grade: string): string {
  const s = SUBJECT_CODES[subject];
  const g = GRADE_CODES[grade];
  if (!s || !g) throw new Error(`不支持的科目或年级: ${subject}/${grade}`);
  return `${BASE}/a/${s}${g}`;
}

/**
 * 从 pagelist 里解析栏目 list id 和总页数。
 * 分页链接格式：list_126_2.html  → 栏目ID=126
 * 例如首页 pagelist 里有 <a href='list_126_2.html'>2</a>
 */
function parsePaginator(html: string): { sectionId?: string; pageCount: number } {
  let pageCount = 1;

  // 从 <strong>N</strong> 里取总数（Python 版也是这样）
  const strongMatch = html.match(/class="pagelist"[\s\S]*?<strong>(\d+)<\/strong>/i);
  if (strongMatch) {
    pageCount = Math.max(1, parseInt(strongMatch[1]!, 10));
  } else {
    // fallback：数 list_N_K.html 里最大的 K
    const listLinks = html.matchAll(/list_(\d+)_(\d+)\.html/gi);
    let maxPage = 1;
    for (const m of listLinks) {
      const p = parseInt(m[2]!, 10);
      if (p > maxPage) maxPage = p;
    }
    pageCount = maxPage;
  }

  // 取栏目 ID
  const listLink = html.match(/list_(\d+)_\d+\.html/i);
  const sectionId = listLink?.[1];

  return { sectionId, pageCount };
}

/** 构造任意分页的完整 URL */
function buildPageUrl(subject: string, grade: string, page: number, sectionId?: string): string {
  if (page === 1) return buildSectionUrl(subject, grade);
  if (sectionId) {
    // 真实分页格式：list_{栏目ID}_{page}.html，相对栏目目录
    return `${BASE}/a/${SUBJECT_CODES[subject]}${GRADE_CODES[grade]}/list_${sectionId}_${page}.html`;
  }
  // fallback
  return buildSectionUrl(subject, grade);
}

function decodeGb2312(bytes: Uint8Array): string {
  try {
    return iconv.decode(Buffer.from(bytes), "gb2312");
  } catch {
    return iconv.decode(Buffer.from(bytes), "gbk");
  }
}

async function fetchGb2312(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": BASE,
    },
  });
  if (!response.ok) throw new Error(`抓取失败 HTTP ${response.status}: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeGb2312(bytes);
}

/**
 * 从 <ul class="c1"><table>...<tr>...</tr></table></ul> 解析每行试卷。
 * 每行 6 列：资源名称 (a.title) | 文件类型 | 所属栏目 | 版本 | 大小 | 上传日期
 */
function parseListPage(html: string): { items: ShijuanItem[]; pageCount: number; sectionId?: string } {
  const items: ShijuanItem[] = [];

  // 定位 ul.c1 里的 table
  const listMatch = html.match(/<ul[^>]*class="c1"[^>]*>([\s\S]*?)<\/ul>/i);
  const tableHtml = listMatch ? listMatch[1]! : html;

  // 逐行 <tr> 解析（跳过表头）
  const rowPattern = /<tr\s*>[\s\S]*?<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[0]!;

    // 跳过表头行（资源名称 / 文件类型 / 所属栏目 ...）
    if (/资源名称|文件类型|所属栏目/.test(rowHtml) && !/<a\s+[^>]*class="title"/i.test(rowHtml)) continue;

    // 抓 <a class="title" href="...">标题</a>
    const titleMatch = rowHtml.match(/<a\s+href="(\/[a-zA-Z0-9_\-/]+\.html)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const href = titleMatch[1]!;
    const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();
    if (!href || !title) continue;

    // 把整行里所有 <td> 的内容提出来
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]!.replace(/<[^>]+>/g, "").trim());

    const pageUrl = BASE + href;
    if (seen.has(pageUrl)) continue;
    seen.add(pageUrl);

    items.push({
      id: href.replace(/[^a-z0-9]/gi, "_") + "_" + title.slice(0, 20),
      title,
      pageUrl,
      fileType: tds[1]?.replace(/^\./, ""),
      version: tds[3],
      year: tds[5]?.match(/(20\d{2})/)?.[1],
    });
  }

  const { pageCount, sectionId } = parsePaginator(html);
  return { items, pageCount, sectionId };
}

/** 从试卷详情页提取直接下载链接 */
function parseDetailPage(html: string): { downUrl?: string } {
  // 模式 1：class="downurllist" 里的 <a href="...">
  let m = html.match(/class="downurllist"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>/i);
  if (m) {
    return { downUrl: normalizeUrl(m[1]!) };
  }

  // 模式 2：/plus/download.php?open=...
  m = html.match(/<a\s+href="(\/plus\/download\.php\?[^\"]+)"[^>]*>(?:下载|点击下载)/i);
  if (m) return { downUrl: normalizeUrl(m[1]!) };

  // 模式 3：任何包含 download.php 或 .rar 的链接（兜底）
  m = html.match(/href="([^"]*(?:download\.php|soft\/[^"]*\.rar)[^"]*)"/i);
  if (m) return { downUrl: normalizeUrl(m[1]!) };

  return {};
}

function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  // 相对路径（如 soft/shijuan/...）
  return `${BASE}/${url}`;
}

/**
 * 搜索第一试卷网的试卷列表（支持分页）。
 * @param subject 科目名（中文）
 * @param grade 年级名（中文）
 * @param version 版本关键词（可选，如"人教版"），用于在 td[3] 版本列过滤
 * @param page 分页页码（1 起）
 */
export async function searchShijuan(
  subject: string,
  grade: string,
  version?: string,
  page = 1,
): Promise<ShijuanSearchResult> {
  // 第一页必须先抓一次获取栏目 sectionId，后续页才能构造正确 URL
  let sectionId: string | undefined;
  if (page > 1) {
    try {
      const firstHtml = await fetchGb2312(buildSectionUrl(subject, grade));
      sectionId = parsePaginator(firstHtml).sectionId;
    } catch { /* ignore */ }
  }

  const listUrl = buildPageUrl(subject, grade, page, sectionId);
  const html = await fetchGb2312(listUrl);
  const parsed = parseListPage(html);

  let items = parsed.items;
  if (version) {
    const kw = version.trim();
    items = items.filter((item) =>
      (item.title && item.title.includes(kw)) ||
      (item.version && item.version.includes(kw))
    );
  }

  // 给前 10 条补充下载链接（详情页逐个抓取耗 IO，只处理前 10 条）
  const limit = Math.min(items.length, 10);
  const enriched: ShijuanItem[] = [];
  for (let i = 0; i < limit; i++) {
    const item = items[i]!;
    try {
      const detailHtml = await fetchGb2312(item.pageUrl);
      const { downUrl } = parseDetailPage(detailHtml);
      enriched.push({ ...item, downUrl });
    } catch {
      enriched.push(item);
    }
  }
  for (let i = limit; i < items.length; i++) enriched.push(items[i]!);

  return {
    items: enriched,
    pageCount: parsed.pageCount,
    currentPage: page,
    source: "shijuan1",
  };
}

/**
 * 代理下载：从第一试卷网下载文件并返回 ArrayBuffer。
 * 接受完整 URL，也接受以 / 开头的相对路径（自动补 BASE）。
 */
export async function proxyDownload(url: string, filenameHint?: string): Promise<{ bytes: Uint8Array; finalUrl: string; filename: string }> {
  // 补全相对路径
  let full = url.trim();
  if (full.startsWith("//")) full = "https:" + full;
  else if (full.startsWith("/")) full = BASE + full;
  else if (!/^https?:\/\//i.test(full)) throw new Error(`下载地址无效: ${url}`);

  const response = await fetch(full, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": BASE,
      "Accept": "*/*",
    },
  });
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const finalUrl = response.url;

  let filename = filenameHint || "";
  if (!filename) {
    const urlMatch = finalUrl.match(/([^\/?#]+\.(?:rar|zip|doc|docx|pdf))(?:$|[?#])/i);
    if (urlMatch) filename = decodeURIComponent(urlMatch[1]!).replace(/["<>]/g, "");
  }
  if (!filename) filename = "shijuan.rar";

  return { bytes, finalUrl, filename };
}

export const SHIJUAN1_SUBJECTS = Object.keys(SUBJECT_CODES);
export const SHIJUAN1_GRADES = Object.keys(GRADE_CODES);
