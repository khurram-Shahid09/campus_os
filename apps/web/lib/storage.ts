import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Uploaded images (payment screenshots). Local disk for now (UPLOAD_DIR, outside git); swapped for private
 * R2 storage with signed URLs at hosting time (docs/11). Files are named by their SHA-256, per school.
 */
function root() {
  const dir = process.env.UPLOAD_DIR || ".data/uploads";
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), "../..", dir);
}

export const ALLOWED_IMAGES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function saveImage(schoolId: string, bytes: Uint8Array, mime: string) {
  const ext = ALLOWED_IMAGES[mime];
  if (!ext) throw new Error("unsupported image type");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const key = `${schoolId}/${hash}.${ext}`;
  const file = path.join(root(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return { key, hash };
}

export async function readImage(key: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$/.test(key)) throw new Error("bad key");
  return readFile(path.join(root(), key));
}
