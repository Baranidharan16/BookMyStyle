import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Errors } from "./http/errors";

/**
 * Object storage abstraction. "local" writes to ./public/uploads (dev);
 * an S3-compatible driver (AWS S3 / Cloudflare R2 / GCS interop) plugs in
 * behind the same `putObject` contract for production.
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** Validate by magic bytes, never by the client-supplied MIME type or extension. */
export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null; // SVG and others rejected (XSS risk)
}

export async function putImage(buf: Buffer, folder: string) {
  if (buf.length > MAX_BYTES) throw Errors.validation("Images must be 5 MB or smaller.");
  const kind = sniffImage(buf);
  if (!kind) throw Errors.validation("Please upload a JPG, PNG or WebP image.");
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "");
  const name = `${randomBytes(12).toString("hex")}.${kind.ext}`;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") throw new Error(`Storage driver "${driver}" is not configured in this build`);
  const dir = path.join(process.cwd(), "public", "uploads", safeFolder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return { url: `/uploads/${safeFolder}/${name}`, mime: kind.mime, size: buf.length };
}
