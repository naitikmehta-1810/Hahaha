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
  | "ui";

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
