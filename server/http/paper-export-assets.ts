import sharp from "sharp";
import { getFile } from "../../lib/file-storage";
import type { QuestionAsset } from "../../lib/types";
import type { PreparedImage } from "../../lib/paper-docx";

const RASTER_FORMATS = new Set(["png", "jpeg", "gif", "bmp"]);

/** Decode a `data:` URL produced by `getPaperPrintData`. */
function dataUrlBytes(value: string): Uint8Array | null {
  if (!value.startsWith("data:")) return null;
  const comma = value.indexOf(",");
  if (comma < 0) return null;
  const payload = value.slice(comma + 1);
  const buffer = value.slice(0, comma).includes(";base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return buffer.length ? new Uint8Array(buffer) : null;
}

/**
 * Load one question asset as bytes Word accepts directly. Anything else
 * (webp, tiff, svg crops) is re-encoded to PNG through sharp.
 */
export async function loadImageAsset(asset: QuestionAsset): Promise<PreparedImage | null> {
  let bytes = dataUrlBytes(asset.url ?? "");
  if (!bytes && asset.cropKey) {
    try {
      bytes = new Uint8Array(await getFile(asset.cropKey));
    } catch {
      return null;
    }
  }
  if (!bytes?.length) return null;
  try {
    const image = sharp(bytes);
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) return null;
    const format = metadata.format ?? "";
    if (RASTER_FORMATS.has(format)) {
      const type = format === "jpeg" ? "jpg" : format as PreparedImage["type"];
      return { data: bytes, type, width, height };
    }
    const png = await image.png().toBuffer();
    return { data: new Uint8Array(png), type: "png", width, height };
  } catch {
    return null;
  }
}

/** Same bytes as `loadImageAsset`, tagged with the extension LaTeX expects. */
export async function loadLatexAsset(asset: QuestionAsset): Promise<{ data: Uint8Array; extension: string } | null> {
  const image = await loadImageAsset(asset);
  if (!image) return null;
  return { data: image.data, extension: image.type === "jpg" ? "jpg" : image.type };
}
