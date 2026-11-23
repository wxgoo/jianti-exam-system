# 评估：pdf-manage 的三块是否值得借鉴（应用于 Teacher-DB）

pdf-manage 是「纸序 PDF」（ZhiXu PDF）——Windows 本地 PDF 工具箱（Python/PyQt6，约 5800 行/文件，测试+文档+打包）。以下分析其中 3 个块：

## 评估总表

| 块 | 方式/强度 | 值得借鉴吗 |
|---|---|---|
| **PDF→Excel 表格导出**（`app/pdf2excel/`） | 检测级联 + 写入精华 | **是，值得（高优先级）** |
| **OCR→Word 导出**（`app/ocr/word_export.py`） | 布局还原精华 | **中（视我们是否有 OCR 基础）** |
| **PDF 对比**（`app/pdfcompare.py`） | 配对/区域/安全边界精华 | **低（可作配套工具）** |

Teacher-DB 现有导出：Word/PDF/LaTeX（无 Excel），没有 OCR 功能。

## 提取的精华

### PDF→Excel（app/pdf2excel/）
- **级联表格检测**：lines_strict → lines → text → raster_grid → alignment_grid，分层抽象（强到弱逐层试，统一边界接口）
- **类型推断**：type_parser.parse_value（数字/日期自动识别）
- **置信度**：strategy_base × (0.5 + 0.5×fill_ratio)
- **多行文本归并**：按 Y 坐标分组
- **水印过滤**：_filter_watermarks

### OCR→Word（app/ocr/word_export.py）
- **布局还原**：document_layout 三类（表格/文本/图片）
- **字符完整性校验**：exported_text + character_counts
- **字体映射**：PDF 字体→Office 名称（word_font）
- **页面缩放**：scaled_layout

### PDF 对比（app/pdfcompare.py）
- **指纹配对**：64×64 缩略图 + 文字词袋 + DP（bounded O(N×M)）
- **连通域锚定**：_components（无第三方库）
- **安全边界**：200 页/512 MiB/10 万行程限制

### 值不值得借鉴

- **PDF→Excel —— 值得（高优先级）**：PDF 里的表格内容（统计/数据表）是老师整理入库需求，导出 Excel 现有系统没有。
- **PDF 对比 —— 值得做成配套工具**：两份试卷比较对 Teacher-DB 场景比较少见，但精华（指纹配对、区域锚定）可复用。
- **OCR→Word —— 优先级低**：Teacher-DB 没有 OCR 基础（扫描识别规模大）。

### 建议

1. **第一优先：PDF→Excel**（题库导出 Excel 缺口，低成本高价值）
2. **第二：PDF 对比**（配套工具）
3. **第三：OCR→Word**（等有 OCR 基础后）

需要我开始实施其中任意一块吗？（最推荐：PDF→Excel）
