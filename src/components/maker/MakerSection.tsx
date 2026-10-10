"use client";

import { useState } from "react";
import { CalendarClock, MapPin, Volume2 } from "lucide-react";
import IndiaMap from "@/components/maker/IndiaMap";
import PhotoLightbox from "@/components/ui/PhotoLightbox/PhotoLightbox";
import { optimizedImage } from "@/utils/media";
import type { MakerProfile } from "@/utils/shop";
import styles from "./Maker.module.css";

function formatClock(seconds: number | null) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.round(seconds - m * 60));
  return `${m}:${String(s).padStart(2, "0")}`;
}

function practiceText(maker: MakerProfile) {
  if (maker.practicingSinceYear == null || maker.yearsOfPractice == null) return null;
  if (maker.yearsOfPractice < 1) return { big: "New", small: `Started in ${maker.practicingSinceYear}` };
  return {
    big: `${maker.yearsOfPractice} ${maker.yearsOfPractice === 1 ? "year" : "years"}`,
    small: `Practising since ${maker.practicingSinceYear}`,
  };
}

/** Studio photo wall; photos open in the shared lightbox. */
function StudioWall({ photos, makerName }: { photos: MakerProfile["studioPhotos"]; makerName: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <ul className={styles.wall} aria-label={`Photos from ${makerName}'s studio`}>
        {photos.map((photo, index) => (
          <li key={photo.id} className={index === 0 && photos.length > 2 ? styles.wallFeature : undefined}>
            <button
              type="button"
              className={styles.wallTile}
              onClick={() => setOpen(index)}
              aria-label={photo.caption ? `Open photo: ${photo.caption}` : `Open studio photo ${index + 1}`}
            >
              <img
                src={optimizedImage(photo.url, index === 0 && photos.length > 2 ? 720 : 420)}
                alt={photo.caption ?? ""}
                loading="lazy"
                decoding="async"
              />
              {photo.caption ? <span className={styles.wallCaption}>{photo.caption}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {open != null ? (
        <PhotoLightbox
          photos={photos}
          index={open}
          label="Studio photo"
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/** The "Meet the maker" panel on a shop page. */
export default function MakerSection({ maker, shopName }: { maker: MakerProfile; shopName: string }) {
  const name = maker.name || shopName;
  const practice = practiceText(maker);
  const place = [maker.hometownCity, maker.hometownState].filter(Boolean).join(", ");
  const duration = formatClock(maker.intro?.durationSeconds ?? null);

  return (
    <section className={styles.section} aria-labelledby="maker-heading">
      <header className={styles.sectionHead}>
        <p className={styles.eyebrow}>Meet the maker</p>
        <h2 id="maker-heading" className={styles.sectionTitle}>
          {maker.name ? `Hi, I’m ${name}` : `The hands behind ${shopName}`}
        </h2>
      </header>

      <div className={styles.grid}>
        <div className={styles.intro}>
          {maker.intro?.kind === "video" ? (
            <video
              className={styles.video}
              controls
              preload="none"
              playsInline
              poster={maker.intro.posterUrl ?? undefined}
              aria-label={`Intro video from ${name}`}
            >
              <source src={maker.intro.url} type="video/mp4" />
            </video>
          ) : maker.intro?.kind === "audio" ? (
            <div className={styles.voice}>
              <span className={styles.voiceIcon} aria-hidden="true">
                <Volume2 size={22} />
              </span>
              <div className={styles.voiceBody}>
                <strong>A note from {name}</strong>
                <span>{duration ? `Voice note · ${duration}` : "Voice note"}</span>
                <audio controls preload="none" src={maker.intro.url} aria-label={`Voice note from ${name}`} />
              </div>
            </div>
          ) : (
            <div className={styles.introEmpty}>
              <p>{name} hasn’t recorded an introduction yet.</p>
            </div>
          )}
        </div>

        <div className={styles.facts}>
          <div className={styles.mapCard}>
            <IndiaMap city={maker.hometownCity} state={maker.hometownState} />
            {place ? (
              <p className={styles.mapLabel}>
                <MapPin size={14} aria-hidden="true" />
                <span>
                  Hometown <strong>{place}</strong>
                </span>
              </p>
            ) : null}
          </div>
          {practice ? (
            <div className={styles.practice}>
              <CalendarClock size={20} aria-hidden="true" />
              <div>
                <strong>{practice.big}</strong>
                <span>{practice.small}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {maker.studioPhotos.length > 0 ? (
        <div className={styles.studio}>
          <h3 className={styles.studioTitle}>Inside the studio</h3>
          <StudioWall photos={maker.studioPhotos} makerName={name} />
        </div>
      ) : null}
    </section>
  );
}
