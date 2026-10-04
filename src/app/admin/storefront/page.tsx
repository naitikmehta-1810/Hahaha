"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ImageIcon, RotateCcw, Upload } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice, { type NoticeTone } from "@/components/ui/Notice/Notice";
import { apiRequest } from "@/utils/api-client";
import { formatDateTime } from "@/utils/format";
import { optimizedImage } from "@/utils/media";
import { resetSiteMedia, type SiteMediaSlot } from "@/utils/siteMedia";
import ui from "@/components/console/console.module.css";
import styles from "./storefront.module.css";

const SECTIONS = {
  homepage: {
    title: "Homepage images",
    description: "Banners on the storefront homepage. Empty slots show the built-in icon design.",
  },
  pages: {
    title: "Sign-in & seller pages",
    description: "Artwork on the sign-in, sign-up and seller registration pages. Empty slots use the built-in artwork.",
  },
  shops: {
    title: "Shop page images",
    description: "Defaults used on shop pages when a seller hasn’t uploaded their own.",
  },
} as const;

type Section = keyof typeof SECTIONS;

const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export default function StorefrontPage() {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading storefront images…</p>}>
      <StorefrontImages />
    </Suspense>
  );
}

function StorefrontImages() {
  const params = useSearchParams();
  const requested = params?.get("section");
  const section: Section = requested === "shops" || requested === "pages" ? requested : "homepage";
  const [slots, setSlots] = useState<SiteMediaSlot[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await apiRequest<{ slots: SiteMediaSlot[] }>("GET", "/api/admin/site-media");
    if (result.error) {
      setMessage({ tone: "danger", text: result.error });
      setSlots([]);
      return;
    }
    setSlots(result.data?.slots ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (slot: SiteMediaSlot, file: File) => {
    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setMessage({ tone: "danger", text: "Choose an image file (JPG, PNG or WebP)." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ tone: "danger", text: "That image is over 8 MB. Export a smaller version and try again." });
      return;
    }
    setBusyKey(slot.key);
    try {
      const dataBase64 = await readAsDataUrl(file);
      const result = await apiRequest<{ slot: SiteMediaSlot }>(
        "PUT",
        `/api/admin/site-media/${encodeURIComponent(slot.key)}`,
        { body: { fileName: file.name, dataBase64 } }
      );
      if (result.error || !result.data?.slot) {
        setMessage({ tone: "danger", text: result.error ?? "Upload failed." });
        return;
      }
      const updated = result.data.slot;
      setSlots((current) => current?.map((item) => (item.key === updated.key ? updated : item)) ?? null);
      resetSiteMedia();
      setMessage({ tone: "success", text: `${slot.label} updated. It shows on the site within a minute.` });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusyKey(null);
    }
  };

  const reset = async (slot: SiteMediaSlot) => {
    setMessage(null);
    setBusyKey(slot.key);
    const result = await apiRequest("DELETE", `/api/admin/site-media/${encodeURIComponent(slot.key)}`);
    setBusyKey(null);
    if (result.error) {
      setMessage({ tone: "danger", text: result.error });
      return;
    }
    setSlots((current) =>
      current?.map((item) => (item.key === slot.key ? { ...item, url: null, updatedAt: null } : item)) ?? null
    );
    resetSiteMedia();
    setMessage({ tone: "success", text: `${slot.label} removed. The default shows instead.` });
  };

  const visible = (slots ?? []).filter((slot) => slot.section === section);

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Storefront"
        title={SECTIONS[section].title}
        description={SECTIONS[section].description}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {slots === null ? (
        <p className={ui.muted}>Loading storefront images…</p>
      ) : (
        <div className={styles.grid}>
          {visible.map((slot) => {
            const busy = busyKey === slot.key;
            const [w, h] = slot.aspect.split(":").map(Number);
            return (
              <section key={slot.key} className={`${ui.card} ${styles.slot}`}>
                <div
                  className={styles.preview}
                  style={{ aspectRatio: w && h ? `${w} / ${h}` : undefined }}
                >
                  {slot.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedImage(slot.url, 720)} alt="" />
                  ) : (
                    <span className={styles.empty}>
                      <ImageIcon size={28} strokeWidth={1.5} aria-hidden="true" />
                      {section === "homepage"
                        ? "Using the icon design"
                        : section === "shops"
                          ? "Using the plain banner"
                          : "Using the built-in artwork"}
                    </span>
                  )}
                </div>
                <div className={styles.meta}>
                  <h2 className={ui.cardTitle}>{slot.label}</h2>
                  <p className={ui.cardSub}>{slot.hint}</p>
                  <p className={styles.updated}>
                    {slot.updatedAt ? `Updated ${formatDateTime(slot.updatedAt)}` : "Not uploaded yet"}
                  </p>
                </div>
                <div className={styles.actions}>
                  <label className={`${styles.uploadButton} ${busy ? styles.uploadBusy : ""}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busyKey !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void upload(slot, file);
                      }}
                    />
                    <Upload size={16} aria-hidden="true" />
                    {busy ? "Uploading…" : slot.url ? "Replace image" : "Upload image"}
                  </label>
                  {slot.url ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyKey !== null}
                      leftIcon={<RotateCcw size={15} />}
                      onClick={() => void reset(slot)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
