import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { canonicalState } from "./pincode.service.js";
import {
  deleteVideoAsset,
  isOwnCloudinaryImage,
  isOwnDirectUpload,
  makerIntroPosterUrl,
  makerIntroUrl,
  inspectUploadedClip,
  type UploadedAssetProof,
} from "./media.service.js";

/**
 * "Meet the maker": the person behind a shop. Public reads are shaped here once
 * so the shop page and the product page can't disagree about what a maker is.
 */

export const MAX_STUDIO_PHOTOS = 8;

export type MakerIntro = {
  kind: "video" | "audio";
  url: string;
  posterUrl: string | null;
  durationSeconds: number | null;
};

export type StudioPhoto = { id: string; url: string; caption: string | null };

/** What a shop page shows. */
export type MakerProfile = {
  name: string;
  hometownCity: string | null;
  hometownState: string | null;
  practicingSinceYear: number | null;
  yearsOfPractice: number | null;
  intro: MakerIntro | null;
  studioPhotos: StudioPhoto[];
};

/** What a product page shows: "Made by Meera in Jaipur", plus enough to link to the rest. */
export type MakerSummary = {
  /** True when the seller filled in their maker profile; false means the shop-name fallback. */
  isProfile: boolean;
  name: string;
  hometownCity: string | null;
  hometownState: string | null;
  yearsOfPractice: number | null;
  hasIntro: boolean;
  studioPhotoCount: number;
};

export type MakerRow = {
  maker_name: string | null;
  hometown_city: string | null;
  hometown_state: string | null;
  practicing_since_year: number | null;
  maker_intro_kind: string | null;
  maker_intro_public_id: string | null;
  maker_intro_duration_seconds: number | null;
};

export function yearsOfPractice(sinceYear: number | null, now = new Date()): number | null {
  if (sinceYear == null) return null;
  return Math.max(0, now.getFullYear() - Number(sinceYear));
}

function introFromRow(row: MakerRow): MakerIntro | null {
  const kind = row.maker_intro_kind;
  const publicId = row.maker_intro_public_id;
  if (!publicId || (kind !== "video" && kind !== "audio")) return null;
  return {
    kind,
    url: makerIntroUrl(publicId, kind),
    posterUrl: makerIntroPosterUrl(publicId, kind),
    durationSeconds: row.maker_intro_duration_seconds,
  };
}

export async function loadStudioPhotos(sellerId: string): Promise<StudioPhoto[]> {
  const result = await pool.query<{ id: string; url: string; caption: string | null }>(
    `select id, url, caption
     from public.seller_studio_photos
     where seller_id = $1
     order by display_order asc, created_at asc
     limit ${MAX_STUDIO_PHOTOS}`,
    [sellerId]
  );
  return result.rows;
}

/** Null when the seller hasn't started a maker profile. */
export function buildMakerProfile(row: MakerRow, photos: StudioPhoto[]): MakerProfile | null {
  const intro = introFromRow(row);
  const hasAnything =
    Boolean(row.maker_name) ||
    Boolean(row.hometown_city) ||
    Boolean(row.hometown_state) ||
    row.practicing_since_year != null ||
    intro !== null ||
    photos.length > 0;
  if (!hasAnything) return null;
  return {
    name: row.maker_name ?? "",
    hometownCity: row.hometown_city,
    hometownState: row.hometown_state,
    practicingSinceYear: row.practicing_since_year,
    yearsOfPractice: yearsOfPractice(row.practicing_since_year),
    intro,
    studioPhotos: photos,
  };
}

/**
 * Product-page summary. A seller without a maker name falls back to the shop
 * name and the city they sell from, so every listing carries a "Made by" line
 * without exposing anyone's personal name.
 */
export function buildMakerSummary(
  row: MakerRow & { shop_name: string; selling_city: string | null; selling_state: string | null },
  studioPhotoCount: number
): MakerSummary {
  const hasName = Boolean(row.maker_name);
  return {
    isProfile: hasName,
    name: row.maker_name ?? row.shop_name,
    hometownCity: row.hometown_city ?? row.selling_city,
    hometownState: row.hometown_state ?? row.selling_state,
    yearsOfPractice: yearsOfPractice(row.practicing_since_year),
    hasIntro: Boolean(row.maker_intro_public_id),
    studioPhotoCount,
  };
}

/** Everything the seller's own editor needs (includes unsaved-state basics). */
export async function getMakerForEditor(sellerId: string) {
  const result = await pool.query<MakerRow>(
    `select maker_name, hometown_city, hometown_state, practicing_since_year,
            maker_intro_kind, maker_intro_public_id, maker_intro_duration_seconds
     from public.sellers where id = $1 and deleted_at is null`,
    [sellerId]
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "SELLER_NOT_FOUND", "Shop not found");
  const photos = await loadStudioPhotos(sellerId);
  return {
    name: row.maker_name ?? "",
    hometownCity: row.hometown_city ?? "",
    hometownState: row.hometown_state ?? "",
    practicingSinceYear: row.practicing_since_year,
    yearsOfPractice: yearsOfPractice(row.practicing_since_year),
    intro: introFromRow(row),
    studioPhotos: photos,
  };
}

export type SaveMakerInput = {
  name?: string | null;
  hometownCity?: string | null;
  hometownState?: string | null;
  practicingSinceYear?: number | null;
  /** undefined keeps the current clip, null removes it, an object replaces it. */
  intro?: ({ kind: "video" | "audio" } & UploadedAssetProof) | null;
  /** undefined keeps the current wall; an array replaces it (order = display order). */
  studioPhotos?: Array<{ url: string; caption?: string | null }>;
};

async function replaceStudioPhotos(
  client: PoolClient,
  sellerId: string,
  photos: Array<{ url: string; caption?: string | null }>
) {
  await client.query(`delete from public.seller_studio_photos where seller_id = $1`, [sellerId]);
  for (const [index, photo] of photos.entries()) {
    await client.query(
      `insert into public.seller_studio_photos (id, seller_id, url, caption, display_order, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, now())`,
      [sellerId, photo.url, photo.caption?.trim() || null, index]
    );
  }
}

/**
 * Saves the maker profile in one transaction. The new intro clip is verified
 * (own folder, valid signature, short enough) before anything is written, and
 * a replaced clip is removed from Cloudinary only after the database commits.
 */
export async function saveMaker(sellerId: string, input: SaveMakerInput) {
  if (input.studioPhotos) {
    if (input.studioPhotos.length > MAX_STUDIO_PHOTOS) {
      throw new AppError(400, "TOO_MANY_PHOTOS", `You can show up to ${MAX_STUDIO_PHOTOS} studio photos.`);
    }
    for (const photo of input.studioPhotos) {
      // Uploaded through /seller/uploads (folder "shops").
      if (!isOwnCloudinaryImage(photo.url, "stuffsy/shops")) {
        throw new AppError(400, "INVALID_PHOTO", "Studio photos must be uploaded through Stuffsy.");
      }
    }
  }

  let hometownState: string | null | undefined;
  if (input.hometownState !== undefined) {
    if (input.hometownState === null || input.hometownState.trim() === "") {
      hometownState = null;
    } else {
      const canonical = canonicalState(input.hometownState);
      if (!canonical) {
        throw new AppError(400, "INVALID_STATE", "Choose a state or union territory from the list.");
      }
      hometownState = canonical;
    }
  }

  if (input.practicingSinceYear != null) {
    const thisYear = new Date().getFullYear();
    if (input.practicingSinceYear < 1950 || input.practicingSinceYear > thisYear) {
      throw new AppError(
        400,
        "INVALID_YEAR",
        `Enter a year between 1950 and ${thisYear} for when you started.`
      );
    }
  }

  let introUpdate: { kind: string | null; publicId: string | null; duration: number | null } | undefined;
  let replacedIntro: string | null = null;
  const current = await pool.query<{ maker_intro_public_id: string | null }>(
    `select maker_intro_public_id from public.sellers where id = $1 and deleted_at is null`,
    [sellerId]
  );
  if (!current.rows[0]) throw new AppError(404, "SELLER_NOT_FOUND", "Shop not found");

  if (input.intro === null) {
    introUpdate = { kind: null, publicId: null, duration: null };
    replacedIntro = current.rows[0].maker_intro_public_id;
  } else if (input.intro) {
    const { kind, publicId, version, signature } = input.intro;
    if (!isOwnDirectUpload({ publicId, version, signature }, kind === "video" ? "intro_video" : "intro_audio", sellerId)) {
      throw new AppError(400, "INVALID_UPLOAD", "That upload couldn't be verified. Upload the clip again.");
    }
    const { seconds, isAudio } = await inspectUploadedClip(publicId);
    if (kind === "video" && isAudio === true) {
      await deleteVideoAsset(publicId);
      throw new AppError(400, "INTRO_NOT_VIDEO", "That file has no video. Upload a video, or choose a voice note.");
    }
    if (seconds != null && seconds > env.MAKER_INTRO_MAX_SECONDS) {
      await deleteVideoAsset(publicId);
      throw new AppError(
        400,
        "INTRO_TOO_LONG",
        `Keep your intro under ${env.MAKER_INTRO_MAX_SECONDS} seconds (this one is ${Math.round(seconds)}).`
      );
    }
    introUpdate = { kind, publicId, duration: seconds == null ? null : Math.round(seconds) };
    if (current.rows[0].maker_intro_public_id && current.rows[0].maker_intro_public_id !== publicId) {
      replacedIntro = current.rows[0].maker_intro_public_id;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update public.sellers set
         maker_name = case when $2::boolean then $3 else maker_name end,
         hometown_city = case when $4::boolean then $5 else hometown_city end,
         hometown_state = case when $6::boolean then $7 else hometown_state end,
         practicing_since_year = case when $8::boolean then $9::smallint else practicing_since_year end,
         maker_intro_kind = case when $10::boolean then $11 else maker_intro_kind end,
         maker_intro_public_id = case when $10::boolean then $12 else maker_intro_public_id end,
         maker_intro_duration_seconds = case when $10::boolean then $13::integer else maker_intro_duration_seconds end,
         updated_at = now()
       where id = $1 and deleted_at is null`,
      [
        sellerId,
        input.name !== undefined,
        input.name?.trim() || null,
        input.hometownCity !== undefined,
        input.hometownCity?.trim() || null,
        hometownState !== undefined,
        hometownState ?? null,
        input.practicingSinceYear !== undefined,
        input.practicingSinceYear ?? null,
        introUpdate !== undefined,
        introUpdate?.kind ?? null,
        introUpdate?.publicId ?? null,
        introUpdate?.duration ?? null,
      ]
    );
    if (input.studioPhotos) await replaceStudioPhotos(client, sellerId, input.studioPhotos);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (replacedIntro) void deleteVideoAsset(replacedIntro);
  return getMakerForEditor(sellerId);
}
