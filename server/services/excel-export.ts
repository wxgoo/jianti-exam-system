import { zip } from "fflate";

/** 题库导出：极简 xlsx（inlineStr，无共享字符串，用 fflate 生成 zip）。 */
export type ExcelRow = Record<string, string | number | boolean | null | undefined>;

const escapeXml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function sheetXml(rows: ExcelRow[]): string {
  const body = rows
    .map((row, index) => {
      const cells = Object.entries(row)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([column, value]) => {
          const ref = `${column}${index + 1}`;
          if (typeof value === "boolean") {
            return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${index + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function buildExcelXlsx(sheets: Array<{ name: string; rows: ExcelRow[] }>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const files: Record<string, Uint8Array> = {
      "[Content_Types].xml": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((sheet, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`),
      "_rels/.rels": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
      "xl/workbook.xml": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`),
      "xl/_rels/workbook.xml.rels": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
</Relationships>`),
    };
    sheets.forEach((sheet, i) => {
      files[`xl/worksheets/sheet${i + 1}.xml`] = enc(sheetXml(sheet.rows));
    });
    zip(files, (error, data) => (error ? reject(error) : resolve(data)));
  });
}
