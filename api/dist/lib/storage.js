import crypto from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
const EXT_BY_MIME = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};
// -----------------------------------------------------------------------------
// Generic (non-photo) attachment support — notice editor inline images + notice
// post attachments. Distinct allow-lists keep inline images image-only while
// post attachments also accept common document formats.
// -----------------------------------------------------------------------------
const EXT_BY_MIME_ALL = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "application/x-hwp": "hwp",
    "application/haansofthwp": "hwp",
    "application/x-hwpx": "hwpx",
    "text/plain": "txt",
    "text/csv": "csv",
};
const MIME_BY_EXT = (() => {
    const m = {};
    for (const [mime, ext] of Object.entries(EXT_BY_MIME_ALL)) {
        if (!m[ext])
            m[ext] = mime;
    }
    m.jpeg = "image/jpeg";
    return m;
})();
/** Allowed mime types for in-body editor images (image-only). */
export const NOTICE_IMAGE_MIME = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
]);
/** Allowed mime types for notice post attachments (images + common docs). */
export const NOTICE_FILE_MIME = new Set(Object.keys(EXT_BY_MIME_ALL));
let warnedS3Fallback = false;
/** Effective storage mode after credential validation (s3 → local fallback). */
export function storageMode() {
    if (config.storage.provider === "s3") {
        const s3 = config.storage.s3;
        if (s3.bucket && s3.region && s3.accessKeyId && s3.secretAccessKey) {
            return "s3";
        }
        if (!warnedS3Fallback) {
            warnedS3Fallback = true;
            // eslint-disable-next-line no-console
            console.warn("[storage] STORAGE_PROVIDER=s3 but S3_BUCKET/S3_REGION/S3_ACCESS_KEY/S3_SECRET incomplete — falling back to local disk.");
        }
    }
    return "local";
}
/** True when a real cloud provider (not local disk) is active. */
export function isCloudStorage() {
    return storageMode() === "s3";
}
function resolveUploadDir() {
    const dir = config.storage.uploadDir;
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}
/** Decode a base64 string or data URL into bytes + detected mime. */
export function decodeBase64Image(raw) {
    let mime = "image/jpeg";
    let data = raw;
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(raw);
    if (m) {
        mime = m[1] || mime;
        data = m[3] ?? "";
    }
    const buffer = Buffer.from(data, "base64");
    if (!EXT_BY_MIME[mime])
        mime = "image/jpeg";
    return { buffer, mime };
}
/**
 * Decode an arbitrary base64 string or data URL into bytes + the data-URL mime
 * (null when the input is bare base64 with no declared mime). Unlike
 * decodeBase64Image this does NOT coerce the mime to an image type — callers
 * validate against an explicit allow-list.
 */
export function decodeBase64Data(raw) {
    let mime = null;
    let data = raw;
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(raw);
    if (m) {
        mime = (m[1] || "").toLowerCase() || null;
        data = m[3] ?? "";
    }
    return { buffer: Buffer.from(data, "base64"), mime };
}
function guessMimeFromName(name) {
    const ext = path.extname(name || "").replace(/^\./, "").toLowerCase();
    return ext ? MIME_BY_EXT[ext] ?? null : null;
}
function sanitizeFilename(name, fallback) {
    const base = (name ?? "").split(/[\\/]/).pop() ?? "";
    const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return (cleaned || fallback).slice(0, 200);
}
async function getS3Client() {
    // Non-literal specifiers so tsc does not require the AWS SDK types at build
    // time; degrade gracefully (→ runtime error / local fallback) if not installed.
    const clientSpec = "@aws-sdk/client-s3";
    const presignSpec = "@aws-sdk/s3-request-presigner";
    const s3mod = await import(clientSpec).catch(() => null);
    const presignMod = await import(presignSpec).catch(() => null);
    if (!s3mod || !presignMod)
        return null;
    const s3 = config.storage.s3;
    const S3Client = s3mod.S3Client;
    const client = new S3Client({
        region: s3.region,
        endpoint: s3.endpoint || undefined,
        forcePathStyle: !!s3.endpoint,
        credentials: {
            accessKeyId: s3.accessKeyId,
            secretAccessKey: s3.secretAccessKey,
        },
    });
    return {
        client,
        PutObjectCommand: s3mod
            .PutObjectCommand,
        GetObjectCommand: s3mod
            .GetObjectCommand,
        getSignedUrl: presignMod
            .getSignedUrl,
    };
}
function s3KeyFor(ownerId, ext) {
    const prefix = config.storage.s3.prefix;
    const base = `photos/${ownerId || "signup"}/${Date.now()}-${crypto
        .randomBytes(6)
        .toString("hex")}.${ext}`;
    return prefix ? `${prefix}/${base}` : base;
}
/**
 * Decode + persist a photo, insert the file_attachments row, return its id.
 * Throws on oversized / empty payloads so callers can surface a 400.
 */
export async function savePhoto(db, input) {
    const { buffer, mime } = decodeBase64Image(input.base64);
    if (buffer.length === 0) {
        throw new StorageError("EMPTY_FILE", "이미지 데이터가 비어 있습니다.");
    }
    if (buffer.length > config.storage.maxBytes) {
        throw new StorageError("FILE_TOO_LARGE", `이미지 용량이 너무 큽니다. (최대 ${Math.floor(config.storage.maxBytes / (1024 * 1024))}MB)`);
    }
    const ext = EXT_BY_MIME[mime] ?? "jpg";
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const filename = input.filename ?? `photo.${ext}`;
    let storageKey;
    if (storageMode() === "s3") {
        const sdk = await getS3Client();
        if (!sdk) {
            // SDK missing despite s3 selected — fall back to local rather than fail.
            storageKey = await writeLocal(input.ownerId, ext, buffer);
        }
        else {
            const key = s3KeyFor(input.ownerId, ext);
            await sdk.getSignedUrl; // keep reference (no-op) — presign used on read
            const cmd = new sdk.PutObjectCommand({
                Bucket: config.storage.s3.bucket,
                Key: key,
                Body: buffer,
                ContentType: mime,
            });
            // S3Client.send
            await sdk.client.send(cmd);
            storageKey = `s3:${key}`;
        }
    }
    else {
        storageKey = await writeLocal(input.ownerId, ext, buffer);
    }
    const ins = await db.query(`INSERT INTO file_attachments (
       owner_type, owner_id, storage_key, original_filename,
       mime_type, size_bytes, checksum_sha256
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`, [
        input.ownerType,
        input.ownerId,
        storageKey,
        filename,
        mime,
        buffer.length,
        checksum,
    ]);
    return {
        fileId: Number(ins.rows[0].id),
        storageKey,
        mimeType: mime,
        sizeBytes: buffer.length,
    };
}
async function writeLocal(ownerId, ext, buffer) {
    const root = resolveUploadDir();
    const sub = path.join("photos", String(ownerId || "signup"));
    const dir = path.join(root, sub);
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    await fs.writeFile(path.join(dir, name), buffer);
    // Store a POSIX-style relative key regardless of host OS.
    const rel = path.join(sub, name).split(path.sep).join("/");
    return `local:${rel}`;
}
async function writeLocalUnder(subdir, ext, buffer) {
    const root = resolveUploadDir();
    const dir = path.join(root, subdir);
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    await fs.writeFile(path.join(dir, name), buffer);
    const rel = path.join(subdir, name).split(path.sep).join("/");
    return `local:${rel}`;
}
function s3KeyUnder(subdir, ext) {
    const prefix = config.storage.s3.prefix;
    const base = `${subdir}/${Date.now()}-${crypto
        .randomBytes(6)
        .toString("hex")}.${ext}`;
    return prefix ? `${prefix}/${base}` : base;
}
/**
 * Decode + persist an arbitrary (validated) attachment, insert the
 * file_attachments row, return its id. Throws StorageError on empty / oversized
 * / disallowed payloads so callers can surface a 400.
 */
export async function saveBase64File(db, input) {
    const { buffer, mime: urlMime } = decodeBase64Data(input.base64);
    if (buffer.length === 0) {
        throw new StorageError("EMPTY_FILE", "파일 데이터가 비어 있습니다.");
    }
    if (buffer.length > input.maxBytes) {
        throw new StorageError("FILE_TOO_LARGE", `용량이 너무 큽니다. (최대 ${Math.floor(input.maxBytes / (1024 * 1024))}MB)`);
    }
    const filename = sanitizeFilename(input.filename, "file");
    // Prefer the data-URL mime, then the client-declared mime, then a guess from
    // the filename extension — accept the first that is in the allow-list.
    const candidates = [
        (urlMime || "").toLowerCase(),
        (input.declaredMime || "").toLowerCase(),
        (guessMimeFromName(filename) || "").toLowerCase(),
    ];
    let mime = candidates.find((c) => c && input.allowedMime.has(c)) || "";
    if (!mime) {
        throw new StorageError("UNSUPPORTED_TYPE", "허용되지 않는 파일 형식입니다.");
    }
    if (mime === "image/jpg")
        mime = "image/jpeg";
    const ext = EXT_BY_MIME_ALL[mime] ||
        path.extname(filename).replace(/^\./, "").toLowerCase() ||
        "bin";
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const folder = `${input.subdir}/${input.ownerId || "inline"}`;
    let storageKey;
    if (storageMode() === "s3") {
        const sdk = await getS3Client();
        if (!sdk) {
            storageKey = await writeLocalUnder(folder, ext, buffer);
        }
        else {
            const key = s3KeyUnder(folder, ext);
            const cmd = new sdk.PutObjectCommand({
                Bucket: config.storage.s3.bucket,
                Key: key,
                Body: buffer,
                ContentType: mime,
            });
            await sdk.client.send(cmd);
            storageKey = `s3:${key}`;
        }
    }
    else {
        storageKey = await writeLocalUnder(folder, ext, buffer);
    }
    const ins = await db.query(`INSERT INTO file_attachments (
       owner_type, owner_id, storage_key, original_filename,
       mime_type, size_bytes, checksum_sha256
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`, [
        input.ownerType,
        input.ownerId,
        storageKey,
        filename,
        mime,
        buffer.length,
        checksum,
    ]);
    return {
        fileId: Number(ins.rows[0].id),
        storageKey,
        mimeType: mime,
        sizeBytes: buffer.length,
    };
}
async function resolveS3Stream(objectKey, mime, filename) {
    const sdk = await getS3Client();
    if (!sdk)
        return null;
    try {
        const cmd = new sdk.GetObjectCommand({
            Bucket: config.storage.s3.bucket,
            Key: objectKey,
        });
        const res = (await sdk.client.send(cmd));
        if (!res.Body)
            return null;
        return { kind: "stream", mime, filename, stream: res.Body };
    }
    catch {
        return null;
    }
}
/**
 * Resolve a file_attachments row to deliverable content.
 *  - local → fs read stream
 *  - s3    → S3 object read stream (proxied by GET /files/:id; no presigned redirect)
 *  - legacy stub:// → null (NOT_FOUND)
 */
export async function resolveFile(row) {
    const key = String(row.storage_key ?? "");
    const mime = row.mime_type || "application/octet-stream";
    const filename = row.original_filename || "file";
    if (key.startsWith("local:")) {
        const rel = key.slice("local:".length);
        const abs = path.join(resolveUploadDir(), rel);
        try {
            await fs.access(abs);
        }
        catch {
            return null;
        }
        return { kind: "stream", mime, filename, stream: createReadStream(abs) };
    }
    if (key.startsWith("s3:")) {
        return resolveS3Stream(key.slice("s3:".length), mime, filename);
    }
    // legacy stub:// or unknown scheme
    return null;
}
/**
 * Read a stored file fully into a Buffer (used by ZIP/Excel export).
 * Returns null for legacy stub rows or missing objects.
 */
export async function readFileBuffer(row) {
    const key = String(row.storage_key ?? "");
    if (key.startsWith("local:")) {
        const abs = path.join(resolveUploadDir(), key.slice("local:".length));
        try {
            return await fs.readFile(abs);
        }
        catch {
            return null;
        }
    }
    if (key.startsWith("s3:")) {
        const sdk = await getS3Client();
        if (!sdk)
            return null;
        try {
            const cmd = new sdk.GetObjectCommand({
                Bucket: config.storage.s3.bucket,
                Key: key.slice("s3:".length),
            });
            const res = (await sdk.client.send(cmd));
            if (!res.Body)
                return null;
            const chunks = [];
            for await (const chunk of res.Body) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        }
        catch {
            return null;
        }
    }
    return null;
}
export class StorageError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
