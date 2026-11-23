export type MeasuredPaperBlock = {
  sectionId: string;
  contentHeight: number;
  headingHeight: number;
  /** 需要书写空白（综合题 / 答题卡） */
  answer: boolean;
  minimumBlank: number;
};

export type PaperPageItem = { index: number; heading: boolean; blank: number; continuation?: boolean };
export type PaperPageLayout = { header: boolean; columns: PaperPageItem[][] };

/** 所有尺寸是加载完字体和图片后在实际 paper 宽度下测量出来的 CSS pixel。 */
export function paginatePaper(blocks: MeasuredPaperBlock[], pageHeight: number, headerHeight: number, gap: number, columnCount = 1) {
  const pages: PaperPageLayout[] = [];
  let page: PaperPageLayout = { header: true, columns: Array.from({ length: columnCount }, () => []) };
  pages.push(page);
  let column = 0;
  let used = headerHeight;
  let columnHeights = page.columns.map(() => headerHeight);
  let previousSection = "";
  const newPage = () => {
    page = { header: false, columns: Array.from({ length: columnCount }, () => []) };
    pages.push(page);
    column = 0;
    used = 0;
    columnHeights = page.columns.map(() => 0);
    previousSection = "";
  };
  const advance = () => {
    if (column + 1 < page.columns.length) {
      column += 1;
      used = page.header ? headerHeight : 0;
      previousSection = "";
    } else newPage();
  };
  const currentItems = () => page.columns[column];

  blocks.forEach((block, index) => {
    let heading = previousSection !== block.sectionId;
    const size = () => {
      const headingHeight = heading ? block.headingHeight : 0;
      // 答题卡书写空白自适应：小题 12% 页高，大题最多 25% 页高。
      // 模板列数（columnCount）由用户在排版设置里定，
      // 这里不再因为 block.answer=true 就强制切到单列全宽区域——
      // 综合题在 A3 双栏模板下也双栏排版。
      const blank = block.answer
        ? Math.min(pageHeight * 0.25, Math.max(pageHeight * 0.12, block.minimumBlank))
        : 0;
      return { blank, height: headingHeight + block.contentHeight + blank + (block.answer ? 0 : gap) };
    };
    let dimensions = size();

    // 当前栏放不下 → 跳下一栏；栏已完则新页
    if (used + dimensions.height > pageHeight + 0.5 && currentItems().length) {
      advance();
      heading = true;
      dimensions = size();
    }
    // 第一页头部以下的长题目，也需要新页
    if (used + dimensions.height > pageHeight + 0.5 && page.header && headerHeight > 0 && block.contentHeight + (heading ? block.headingHeight : 0) > pageHeight - used) {
      newPage();
      heading = true;
      dimensions = size();
    }

    const promptHeight = block.contentHeight + (heading ? block.headingHeight : 0);
    const blank = block.answer ? Math.min(dimensions.blank, Math.max(0, pageHeight - used - promptHeight)) : 0;
    currentItems().push({ index, heading, blank });
    used += promptHeight + blank + (block.answer ? 0 : gap);
    columnHeights[column] = used;
    previousSection = block.sectionId;

    // 答题卡续页（剩余空白跨页）
    let remainingBlank = Math.max(0, dimensions.blank - blank);
    while (remainingBlank > 0.5) {
      // 同一题的续页 → 跟随当前模板列数，不再强制单列
      const nextPage = { header: false, columns: Array.from({ length: columnCount }, () => []) } as PaperPageLayout;
      pages.push(nextPage);
      const part = Math.min(remainingBlank, pageHeight - 28);
      nextPage.columns[0].push({ index, heading: false, blank: part, continuation: true });
      column = 0;
      used = part + 28;
      columnHeights = nextPage.columns.map(() => 0);
      columnHeights[0] = used;
      previousSection = block.sectionId;
      remainingBlank -= part;
      page = nextPage;
    }
  });
  return pages;
}
