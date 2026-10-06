import { apiRequest } from "@/utils/api-client";

export type DirectUploadKind = "video" | "digital";

type SignedUpload = {
  uploadUrl: string;
  fields: Record<string, string | number | boolean>;
  maxBytes: number;
};

/** What the product save needs to prove the file was uploaded by this seller. */
export type UploadProof = {
  publicId: string;
  version: number;
  signature: string;
};

export type UploadedFile = UploadProof & {
  fileName: string;
  bytes: number;
  contentType: string | null;
};

/** Cloudinary accepts chunks of at least 5 MB (except the last). */
const CHUNK_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function postChunk(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>;
      } catch {
        // Cloudinary always answers JSON; anything else is a network-level failure.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else {
        const error = (body.error as { message?: string } | undefined)?.message;
        reject(new Error(error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Uploads a file straight to Cloudinary with parameters signed by our API, in
 * chunks for large files, reporting progress from 0 to 1.
 */
export async function directUpload(
  kind: DirectUploadKind,
  file: File,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<UploadedFile> {
  const signed = await apiRequest<SignedUpload>("POST", "/api/seller/uploads/sign", {
    body: { kind },
  });
  if (signed.error || !signed.data) {
    throw new Error(signed.error ?? "Could not start the upload.");
  }
  const { uploadUrl, fields, maxBytes } = signed.data;
  if (file.size > maxBytes) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`
    );
  }

  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  let result: Record<string, unknown> = {};
  for (let start = 0; start < file.size || start === 0; start += CHUNK_BYTES) {
    const end = Math.min(start + CHUNK_BYTES, file.size);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    form.append("file", file.slice(start, end), file.name);
    const headers: Record<string, string> =
      file.size > CHUNK_BYTES
        ? {
            "X-Unique-Upload-Id": uploadId,
            "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
          }
        : {};
    result = await postChunk(
      uploadUrl,
      form,
      headers,
      (loaded) => opts.onProgress?.(Math.min(1, (start + loaded) / Math.max(file.size, 1))),
      opts.signal
    );
    if (file.size === 0) break;
  }
  opts.onProgress?.(1);

  if (typeof result.public_id !== "string" || typeof result.signature !== "string") {
    throw new Error("Upload finished but the file could not be confirmed. Try again.");
  }
  return {
    publicId: result.public_id,
    version: Number(result.version),
    signature: result.signature,
    fileName: file.name,
    bytes: Number(result.bytes ?? file.size),
    contentType: file.type || null,
  };
}
