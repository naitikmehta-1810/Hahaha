import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

let configured = false;

function ensureCloudinary() {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export type UploadFolder =
  | "products"
  | "shops"
  | "misc"
  | "invoices"
  | "categories"
  | "ui"
  | "avatars";

export type UploadResult = {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

/**
 * Upload a binary buffer (e.g. PDF) as a Cloudinary raw asset.
 */
export async function uploadRawFile(input: {
  buffer: Buffer;
  fileName: string;
  folder?: UploadFolder;
  contentType?: string;
}): Promise<UploadResult> {
  ensureCloudinary();
  const folder = `stuffsy/${input.folder ?? "misc"}`;
  const dataUri = `data:${input.contentType ?? "application/pdf"};base64,${input.buffer.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "raw",
      public_id: input.fileName.replace(/\.[^.]+$/, ""),
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      format: "pdf",
      type: "upload",
      access_mode: "public",
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error("[cloudinary] raw upload failed", error);
    throw new AppError(502, "UPLOAD_FAILED", "Could not upload file. Try again.");
  }
}

/**
 * Upload a base64 data URL / raw base64 string or a remote URL to Cloudinary.
 * Pass `publicId` + `overwrite: true` for idempotent seed/re-upload of fixed assets.
 */
export async function uploadImage(input: {
  dataBase64?: string;
  url?: string;
  fileName?: string;
  folder?: UploadFolder;
  /** Asset name inside the folder (no extension). */
  publicId?: string;
  overwrite?: boolean;
}): Promise<UploadResult> {
  ensureCloudinary();

  const folder = `stuffsy/${input.folder ?? "misc"}`;
  const source = input.dataBase64?.trim() || input.url?.trim();
  if (!source) {
    throw new AppError(400, "UPLOAD_SOURCE_REQUIRED", "Provide dataBase64 or url");
  }

  // Accept either a full data URL or bare base64.
  const payload =
    source.startsWith("data:") || source.startsWith("http://") || source.startsWith("https://")
      ? source
      : `data:image/jpeg;base64,${source}`;

  const fixedId = Boolean(input.publicId);

  try {
    const result = await cloudinary.uploader.upload(payload, {
      folder,
      public_id: input.publicId,
      resource_type: "image",
      use_filename: Boolean(input.fileName) && !fixedId,
      unique_filename: !fixedId,
      overwrite: input.overwrite ?? false,
      invalidate: input.overwrite === true,
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error("[cloudinary] upload failed", error);
    throw new AppError(502, "UPLOAD_FAILED", "Could not upload image. Try again.");
  }
}

/* ── Direct browser uploads (video, digital files) ───────────────────────── */

export type DirectUploadKind = "video" | "digital";

/** Eager transform for product videos: H.264 MP4 plays everywhere (iPhone .mov/HEVC does not). */
const VIDEO_EAGER = "q_auto/mp4";

function directUploadFolder(kind: DirectUploadKind, sellerId: string) {
  return kind === "video"
    ? `stuffsy/products/videos/${sellerId}`
    : `stuffsy/digital/${sellerId}`;
}

/**
 * Signed parameters for one upload straight from the browser to Cloudinary, so
 * large files never pass through this API's JSON body limit. The folder is part
 * of the signature, which pins every upload to the requesting seller.
 *
 * Digital files are `authenticated`: they have no public URL and are served only
 * through short-lived signed links (digitalDownloadUrl).
 */
export function signDirectUpload(kind: DirectUploadKind, sellerId: string) {
  ensureCloudinary();
  const folder = directUploadFolder(kind, sellerId);
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string | number | boolean> =
    kind === "video"
      ? { folder, timestamp, eager: VIDEO_EAGER, eager_async: true }
      : { folder, timestamp, type: "authenticated", use_filename: true, unique_filename: true };
  const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
  const resourceType = kind === "video" ? "video" : "raw";
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    fields: { ...params, api_key: env.CLOUDINARY_API_KEY, signature },
    maxBytes: Math.round(
      (kind === "video" ? env.PRODUCT_VIDEO_MAX_MB : env.DIGITAL_FILE_MAX_MB) * 1024 * 1024
    ),
  };
}

export type UploadedAssetProof = { publicId: string; version: number | string; signature: string };

/**
 * True only for an asset Cloudinary really created in this account, inside the
 * seller's own folder for that kind. Stops a seller attaching another seller's
 * file, or an arbitrary public_id, to their product.
 */
export function isOwnDirectUpload(
  proof: UploadedAssetProof,
  kind: DirectUploadKind,
  sellerId: string
) {
  ensureCloudinary();
  const folder = directUploadFolder(kind, sellerId);
  if (!proof.publicId.startsWith(`${folder}/`)) return false;
  // Present at runtime since SDK 1.x but missing from its type definitions.
  const utils = cloudinary.utils as unknown as {
    verify_api_response_signature(publicId: string, version: number, signature: string): boolean;
  };
  return utils.verify_api_response_signature(proof.publicId, Number(proof.version), proof.signature);
}

/** Playback URL matching the eager MP4 made at upload time. */
export function productVideoUrl(publicId: string) {
  ensureCloudinary();
  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [{ quality: "auto" }],
    format: "mp4",
  });
}

/** First frame as a JPEG, used as the video poster. */
export function productVideoPosterUrl(publicId: string) {
  ensureCloudinary();
  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [{ start_offset: 0, quality: "auto", width: 1200, crop: "limit" }],
    format: "jpg",
  });
}

/** Short-lived signed link to a private digital file; forces a download. */
export function digitalDownloadUrl(publicId: string, expiresInSeconds = 300) {
  ensureCloudinary();
  return cloudinary.utils.private_download_url(publicId, "", {
    resource_type: "raw",
    type: "authenticated",
    attachment: true,
    expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
  });
}

/** Best-effort removal of a replaced product video. Never throws. */
export async function deleteVideoAsset(publicId: string) {
  try {
    ensureCloudinary();
    await cloudinary.uploader.destroy(publicId, { resource_type: "video", invalidate: true });
  } catch (error) {
    console.warn("[cloudinary] could not delete replaced video", publicId, error);
  }
}
