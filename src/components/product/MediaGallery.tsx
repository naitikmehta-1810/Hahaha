"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { optimizedImage } from "@/utils/media";
import styles from "./MediaGallery.module.css";

type Slide = { kind: "video"; url: string; posterUrl: string } | { kind: "image"; url: string };

/** How long each photo stays before the reel moves on. */
const IMAGE_MS = 5200;
const SWIPE_PX = 40;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * Product media as a story reel: the video plays first, then the photos take
 * over with a slow drift-and-zoom, each marked by a segment in the progress bar.
 * After one pass the video steps aside and the photos keep cycling. Pauses on
 * hover, when scrolled away or the tab is hidden; respects reduced motion.
 */
export default function MediaGallery({
  title,
  images,
  video,
  fallbackImage,
  className,
  children,
}: {
  title: string;
  images: string[];
  video: { url: string; posterUrl: string } | null;
  fallbackImage: string;
  className?: string;
  /** Overlays drawn on the stage (badges, wishlist button). */
  children?: React.ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);
  const slides = useMemo<Slide[]>(() => {
    const photos: Slide[] = (images.length ? images : [fallbackImage]).map((url) => ({
      kind: "image",
      url,
    }));
    return video && !videoFailed ? [{ kind: "video", ...video }, ...photos] : photos;
  }, [images, video, videoFailed, fallbackImage]);

  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [muted, setMuted] = useState(true);
  const [videoBlocked, setVideoBlocked] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pointerStart = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const current = slides[Math.min(index, slides.length - 1)];
  const multiple = slides.length > 1;
  const running = multiple && !paused && !hovering && inView && pageVisible && !reducedMotion;

  const goTo = useCallback(
    (next: number) => {
      elapsedRef.current = 0;
      setIndex(((next % slides.length) + slides.length) % slides.length);
      setProgress(0);
      setCycle((c) => c + 1);
    },
    [slides.length]
  );

  /** Forward, but once the reel wraps the video sits out and photos loop. */
  const advance = useCallback(() => {
    const next = index + 1;
    if (next < slides.length) goTo(next);
    else goTo(slides[0]?.kind === "video" && slides.length > 1 ? 1 : 0);
  }, [goTo, index, slides]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(node);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Photo timer: fills the active segment, then moves on. Elapsed time lives in
  // a ref so pausing and resuming carries on from where the bar stopped.
  useEffect(() => {
    if (current?.kind !== "image" || !running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      const next = elapsedRef.current / IMAGE_MS;
      if (next >= 1) {
        setProgress(1);
        advance();
        return;
      }
      setProgress(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current?.kind, running, advance, cycle]);

  // Video: plays only while it is the active, visible slide.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (current?.kind === "video" && inView && pageVisible && !paused && !reducedMotion) {
      el.muted = muted;
      void el.play().then(
        () => setVideoBlocked(false),
        () => setVideoBlocked(true)
      );
    } else {
      el.pause();
    }
  }, [current?.kind, inView, pageVisible, paused, reducedMotion, muted]);

  useEffect(() => {
    // Leaving the video rewinds it, so it starts from the top next time.
    if (current?.kind !== "video" && videoRef.current) videoRef.current.currentTime = 0;
  }, [current?.kind]);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  const showPause = multiple && !reducedMotion;

  return (
    <div className={`${styles.gallery} ${className ?? ""}`} ref={rootRef}>
      {multiple ? (
        <div className={styles.rail} role="tablist" aria-label="Product media">
          {slides.map((slide, i) => (
            <button
              key={`${slide.kind}-${slide.url}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={slide.kind === "video" ? "Play product video" : `Show photo ${i + (slides[0].kind === "video" ? 0 : 1)}`}
              className={`${styles.thumb} ${i === index ? styles.thumbActive : ""}`}
              onClick={() => goTo(i)}
            >
              <img
                src={slide.kind === "video" ? slide.posterUrl : optimizedImage(slide.url, 200)}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).src = fallbackImage;
                }}
              />
              {slide.kind === "video" ? (
                <span className={styles.thumbPlay} aria-hidden="true">
                  <Play size={14} fill="currentColor" />
                </span>
              ) : null}
              {i === index && running ? (
                <span className={styles.thumbProgress} style={{ transform: `scaleX(${progress})` }} />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={styles.stage}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${title} media`}
        tabIndex={0}
        onKeyDown={onKey}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") pointerStart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (start == null) return;
          const dx = e.clientX - start;
          if (Math.abs(dx) > SWIPE_PX) goTo(index + (dx < 0 ? 1 : -1));
        }}
      >
        {slides.map((slide, i) => {
          const active = i === index;
          if (slide.kind === "video") {
            return (
              <div key="video" className={`${styles.slide} ${active ? styles.slideActive : ""}`} aria-hidden={!active}>
                <video
                  ref={videoRef}
                  className={styles.media}
                  src={slide.url}
                  poster={slide.posterUrl}
                  muted={muted}
                  playsInline
                  preload="metadata"
                  controls={false}
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    if (active && el.duration) setProgress(el.currentTime / el.duration);
                  }}
                  onEnded={() => {
                    if (active) advance();
                  }}
                  onError={() => {
                    // Not playable (e.g. still processing): fall back to photos only.
                    setVideoFailed(true);
                    setIndex(0);
                  }}
                />
                {active && (videoBlocked || reducedMotion || paused) ? (
                  <button
                    type="button"
                    className={styles.bigPlay}
                    aria-label="Play video"
                    onClick={() => {
                      setPaused(false);
                      setVideoBlocked(false);
                      void videoRef.current?.play().catch(() => setVideoBlocked(true));
                    }}
                  >
                    <Play size={28} fill="currentColor" />
                  </button>
                ) : null}
              </div>
            );
          }
          return (
            <div key={`img-${i}`} className={`${styles.slide} ${active ? styles.slideActive : ""}`} aria-hidden={!active}>
              <img
                // Re-keyed per visit so the drift animation restarts each time.
                key={active ? `on-${cycle}` : "off"}
                src={optimizedImage(slide.url, 1200)}
                alt={active ? title : ""}
                loading={i === 0 || active ? "eager" : "lazy"}
                className={`${styles.media} ${active && !reducedMotion ? styles[`drift${i % 4}`] : ""} ${
                  running ? "" : styles.driftPaused
                }`}
                style={{ animationDuration: `${IMAGE_MS + 1200}ms` }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = fallbackImage;
                }}
              />
            </div>
          );
        })}

        {children}

        {multiple ? (
          <>
            <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} aria-label="Previous" onClick={() => goTo(index - 1)}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} aria-label="Next" onClick={() => goTo(index + 1)}>
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}

        <div className={styles.hud}>
          {multiple ? (
            <div className={styles.segments} aria-hidden="true">
              {slides.map((slide, i) => (
                <span key={i} className={`${styles.segment} ${slide.kind === "video" ? styles.segmentVideo : ""}`}>
                  <span
                    className={styles.segmentFill}
                    style={{ transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})` }}
                  />
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.controls}>
            {current?.kind === "video" ? (
              <button
                type="button"
                className={styles.control}
                aria-label={muted ? "Turn sound on" : "Mute"}
                aria-pressed={!muted}
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            ) : null}
            {showPause ? (
              <button
                type="button"
                className={styles.control}
                aria-label={paused ? "Play slideshow" : "Pause slideshow"}
                aria-pressed={paused}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            ) : null}
            {multiple ? (
              <span className={styles.counter} aria-live={running ? "off" : "polite"}>
                {index + 1} / {slides.length}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
