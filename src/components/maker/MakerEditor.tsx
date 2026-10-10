"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Mic, Trash2, Upload, Video } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice, { type NoticeTone } from "@/components/ui/Notice/Notice";
import IndiaMap from "@/components/maker/IndiaMap";
import { apiRequest } from "@/utils/api-client";
import { directUpload, formatBytes, type UploadedFile } from "@/utils/direct-upload";
import { INDIA_STATES } from "@/utils/india-states";
import { optimizedImage } from "@/utils/media";
import type { MakerIntro, StudioPhoto } from "@/utils/shop";
import ui from "@/components/console/console.module.css";
import styles from "./Maker.module.css";

const MAX_PHOTOS = 8;
const MAX_INTRO_SECONDS = 120;

type EditorMaker = {
  name: string;
  hometownCity: string;
  hometownState: string;
  practicingSinceYear: number | null;
  yearsOfPractice: number | null;
  intro: MakerIntro | null;
  studioPhotos: StudioPhoto[];
};

type PhotoDraft = { key: string; url: string; caption: string };

/** Pending replacement of the saved intro: undefined = untouched, null = remove. */
type IntroChange = undefined | null | { kind: "video" | "audio"; file: UploadedFile; previewUrl: string };

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Length of a local audio/video file, read in the browser before uploading. */
function localClipSeconds(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => done(Number.isFinite(media.duration) ? media.duration : null);
    media.onerror = () => done(null);
    media.src = url;
  });
}

let photoKeyCounter = 0;
const nextKey = () => `photo-${(photoKeyCounter += 1)}`;

/**
 * Seller-side editor for the "Meet the maker" profile: name, hometown, years of
 * practice, a short video or voice intro and the studio photo wall. Saves on its
 * own (separate from the rest of shop setup) so a clip upload never blocks it.
 */
export default function MakerEditor({ onSaved }: { onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [saved, setSaved] = useState<EditorMaker | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [since, setSince] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [introChange, setIntroChange] = useState<IntroChange>(undefined);
  const [introKind, setIntroKind] = useState<"video" | "audio">("video");
  const [introProgress, setIntroProgress] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hydrate = useCallback((maker: EditorMaker) => {
    setSaved(maker);
    setName(maker.name);
    setCity(maker.hometownCity);
    setState(maker.hometownState);
    setSince(maker.practicingSinceYear != null ? String(maker.practicingSinceYear) : "");
    setPhotos(maker.studioPhotos.map((p) => ({ key: nextKey(), url: p.url, caption: p.caption ?? "" })));
    setIntroChange(undefined);
    if (maker.intro) setIntroKind(maker.intro.kind);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ maker: EditorMaker }>("GET", "/api/seller/maker").then((result) => {
      if (cancelled) return;
      if (result.data?.maker) hydrate(result.data.maker);
      else setMessage({ tone: "danger", text: result.error ?? "Could not load your maker profile." });
      setLoading(false);
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [hydrate]);

  // Local preview URLs for a freshly uploaded clip are revoked when replaced.
  useEffect(() => {
    return () => {
      if (introChange && typeof introChange === "object") URL.revokeObjectURL(introChange.previewUrl);
    };
  }, [introChange]);

  const onPickIntro = async (file: File) => {
    setMessage(null);
    const wantsVideo = introKind === "video";
    if (!file.type.startsWith(wantsVideo ? "video/" : "audio/")) {
      setMessage({ tone: "danger", text: wantsVideo ? "Choose a video file." : "Choose an audio file." });
      return;
    }
    const seconds = await localClipSeconds(file);
    if (seconds != null && seconds > MAX_INTRO_SECONDS) {
      setMessage({
        tone: "danger",
        text: `Keep your intro under ${MAX_INTRO_SECONDS} seconds. This one is ${Math.round(seconds)}.`,
      });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIntroProgress(0);
    try {
      const uploaded = await directUpload(wantsVideo ? "intro_video" : "intro_audio", file, {
        onProgress: setIntroProgress,
        signal: controller.signal,
      });
      setIntroChange({ kind: introKind, file: uploaded, previewUrl: URL.createObjectURL(file) });
      setMessage({ tone: "success", text: "Intro uploaded. Save to publish it." });
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Upload failed." });
      }
    } finally {
      setIntroProgress(null);
    }
  };

  const onAddPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setMessage(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) {
      setMessage({ tone: "warning", text: `Only ${MAX_PHOTOS} photos fit on the wall; extra ones were skipped.` });
    }
    setPhotoBusy(true);
    try {
      for (const file of picked) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 10 * 1024 * 1024) {
          setMessage({ tone: "danger", text: `"${file.name}" is ${formatBytes(file.size)}. Photos can be up to 10 MB.` });
          continue;
        }
        const dataBase64 = await readDataUrl(file);
        const result = await apiRequest<{ url: string }>("POST", "/api/seller/uploads", {
          body: { fileName: file.name, dataBase64, folder: "shops" },
        });
        if (result.error || !result.data?.url) {
          setMessage({ tone: "danger", text: result.error ?? "Photo upload failed." });
          break;
        }
        const url = result.data.url;
        setPhotos((current) => [...current, { key: nextKey(), url, caption: "" }]);
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const movePhoto = (index: number, delta: number) =>
    setPhotos((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    const year = since.trim() ? Number(since) : null;
    const thisYear = new Date().getFullYear();
    if (year != null && (!Number.isInteger(year) || year < 1950 || year > thisYear)) {
      setMessage({ tone: "danger", text: `Enter a year between 1950 and ${thisYear} for when you started.` });
      return;
    }
    if (city.trim() && !state) {
      setMessage({ tone: "danger", text: "Choose the state your hometown is in." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await apiRequest<{ maker: EditorMaker }>("PUT", "/api/seller/maker", {
      body: {
        name: name.trim() || null,
        hometownCity: city.trim() || null,
        hometownState: state || null,
        practicingSinceYear: year,
        studioPhotos: photos.map((p) => ({ url: p.url, caption: p.caption.trim() || null })),
        ...(introChange === undefined
          ? {}
          : introChange === null
            ? { intro: null }
            : {
                intro: {
                  kind: introChange.kind,
                  publicId: introChange.file.publicId,
                  version: introChange.file.version,
                  signature: introChange.file.signature,
                },
              }),
      },
    });
    setSaving(false);
    if (result.error || !result.data?.maker) {
      setMessage({ tone: "danger", text: result.error ?? "Could not save." });
      return;
    }
    hydrate(result.data.maker);
    setMessage({ tone: "success", text: "Your maker profile is saved." });
    onSaved?.();
  };

  if (loading) return <p className={ui.muted}>Loading your maker profile…</p>;

  const savedIntro = introChange === undefined ? saved?.intro ?? null : null;
  const hasIntro = Boolean(savedIntro) || (introChange !== undefined && introChange !== null);

  return (
    <div className={ui.stack}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <section className={ui.card}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>About you</h2>
            <p className={ui.cardSub}>
              Buyers see “Made by {name.trim() || "your name"}
              {city.trim() ? ` in ${city.trim()}` : ""}” on every one of your products.
            </p>
          </div>
        </div>
        <div className={ui.formGrid2}>
          <div className={ui.field}>
            <label htmlFor="maker-name">Your name</label>
            <input
              id="maker-name"
              value={name}
              maxLength={60}
              placeholder="e.g. Meera"
              onChange={(e) => setName(e.target.value)}
            />
            <span className={ui.fieldHint}>The name you want buyers to know you by. A first name is fine.</span>
          </div>
          <div className={ui.field}>
            <label htmlFor="maker-since">Practising since</label>
            <input
              id="maker-since"
              inputMode="numeric"
              value={since}
              maxLength={4}
              placeholder="e.g. 2014"
              onChange={(e) => setSince(e.target.value.replace(/\D/g, ""))}
            />
            <span className={ui.fieldHint}>The year you started your craft. We show it as years of practice.</span>
          </div>
          <div className={ui.field}>
            <label htmlFor="maker-city">Hometown</label>
            <input
              id="maker-city"
              value={city}
              maxLength={60}
              placeholder="e.g. Jaipur"
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label htmlFor="maker-state">State</label>
            <select id="maker-state" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Choose a state</option>
              {INDIA_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {city.trim() || state ? (
          <div style={{ maxWidth: 280, marginTop: 12 }}>
            <IndiaMap city={city} state={state} />
          </div>
        ) : null}
      </section>

      <section className={ui.card}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>Introduce yourself</h2>
            <p className={ui.cardSub}>
              A short video or voice note (up to {MAX_INTRO_SECONDS} seconds). Tell buyers who you are and what
              you love making.
            </p>
          </div>
        </div>
        <div className={styles.editorIntro}>
          {hasIntro ? (
            introChange && typeof introChange === "object" ? (
              introChange.kind === "video" ? (
                <video src={introChange.previewUrl} controls preload="metadata" />
              ) : (
                <audio src={introChange.previewUrl} controls preload="metadata" />
              )
            ) : savedIntro?.kind === "video" ? (
              <video src={savedIntro.url} poster={savedIntro.posterUrl ?? undefined} controls preload="none" />
            ) : savedIntro ? (
              <audio src={savedIntro.url} controls preload="none" />
            ) : null
          ) : (
            <p className={ui.muted}>No intro yet.</p>
          )}

          <div className={styles.editorRow} role="radiogroup" aria-label="Intro format">
            <Button
              size="sm"
              variant={introKind === "video" ? "primary" : "outline"}
              leftIcon={<Video size={15} />}
              aria-pressed={introKind === "video"}
              onClick={() => setIntroKind("video")}
              disabled={introProgress !== null}
            >
              Video
            </Button>
            <Button
              size="sm"
              variant={introKind === "audio" ? "primary" : "outline"}
              leftIcon={<Mic size={15} />}
              aria-pressed={introKind === "audio"}
              onClick={() => setIntroKind("audio")}
              disabled={introProgress !== null}
            >
              Voice note
            </Button>
          </div>

          <div className={styles.editorRow}>
            <label className={`${ui.linkInline}`} style={{ cursor: introProgress !== null ? "not-allowed" : "pointer" }}>
              <input
                type="file"
                hidden
                accept={introKind === "video" ? "video/*" : "audio/*"}
                disabled={introProgress !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickIntro(file);
                  e.target.value = "";
                }}
              />
              <Upload size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }} />
              {hasIntro ? "Replace with a new clip" : `Upload a ${introKind === "video" ? "video" : "voice note"}`}
            </label>
            {introProgress !== null ? (
              <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            ) : null}
            {hasIntro && introProgress === null ? (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Trash2 size={14} />}
                onClick={() => setIntroChange(null)}
              >
                Remove
              </Button>
            ) : null}
          </div>
          {introProgress !== null ? (
            <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(introProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.round(introProgress * 100)}%` }} />
            </div>
          ) : null}
          {introChange === null && saved?.intro ? (
            <span className={ui.fieldHint}>Your intro will be removed when you save.</span>
          ) : null}
        </div>
      </section>

      <section className={ui.card}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>Studio photo wall</h2>
            <p className={ui.cardSub}>
              Up to {MAX_PHOTOS} photos of your workspace, tools and process. The first one is shown largest.
            </p>
          </div>
          <label className={ui.linkInline} style={{ cursor: photoBusy || photos.length >= MAX_PHOTOS ? "not-allowed" : "pointer" }}>
            <input
              type="file"
              hidden
              multiple
              accept="image/*"
              disabled={photoBusy || photos.length >= MAX_PHOTOS}
              onChange={(e) => {
                void onAddPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <Upload size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {photoBusy ? "Uploading…" : "Add photos"}
          </label>
        </div>
        {photos.length === 0 ? (
          <p className={ui.muted}>No photos yet.</p>
        ) : (
          <ul className={styles.editorPhotos}>
            {photos.map((photo, index) => (
              <li key={photo.key} className={styles.editorPhoto}>
                <img src={optimizedImage(photo.url, 320)} alt="" />
                <input
                  className={ui.input}
                  value={photo.caption}
                  maxLength={120}
                  placeholder="Caption (optional)"
                  aria-label={`Caption for photo ${index + 1}`}
                  onChange={(e) =>
                    setPhotos((current) =>
                      current.map((p) => (p.key === photo.key ? { ...p, caption: e.target.value } : p))
                    )
                  }
                />
                <div className={styles.editorPhotoActions}>
                  <button type="button" aria-label="Move earlier" disabled={index === 0} onClick={() => movePhoto(index, -1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move later"
                    disabled={index === photos.length - 1}
                    onClick={() => movePhoto(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPhotos((current) => current.filter((p) => p.key !== photo.key))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={ui.formActions}>
        <Button variant="primary" disabled={saving || introProgress !== null || photoBusy} onClick={() => void save()}>
          {saving ? "Saving…" : "Save maker profile"}
        </Button>
      </div>
    </div>
  );
}
