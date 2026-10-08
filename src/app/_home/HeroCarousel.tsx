"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button/Button";
import { Asterisk, Squiggle } from "@/components/art/Doodles";
import { FALLBACK_PRODUCT_IMAGE, imageSrcSet, optimizedImage } from "@/utils/media";
import Mark from "./Mark";
import styles from "../page.module.css";

const SLIDE_INTERVAL_MS = 6500;
const SWIPE_PX = 40;
const FRAME_WIDTHS = [320, 480, 640, 800];

type SlideNote = { Icon: LucideIcon; small: string; strong: string };

export type Slide = {
  /** Hand-lettered line above the title. */
  kicker: string;
  /** Title text before the brush-underlined phrase. */
  lead: string;
  /** The phrase that gets the brush underline. */
  mark: string;
  text: string;
  cta: string;
  href: string;
  secondary?: { label: string; href: string };
  /** One photo in a tilted frame, or two overlapping frames. */
  images: string[];
  notes: [SlideNote, SlideNote];
};

function swapToFallback(event: React.SyntheticEvent<HTMLImageElement, Event>) {
  const img = event.currentTarget;
  img.removeAttribute("srcset");
  img.src = FALLBACK_PRODUCT_IMAGE;
}

export default function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const frame = useRef(0);
  const count = slides.length;

  const go = useCallback((index: number) => setCurrent((index + count) % count), [count]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setTimeout(() => setCurrent((prev) => (prev + 1) % count), SLIDE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, reduceMotion, count]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** Writes the pointer position as CSS variables (-1 to 1); no React re-render. */
  const setPointer = useCallback((x: number, y: number) => {
    const hero = heroRef.current;
    if (!hero) return;
    hero.style.setProperty("--px", x.toFixed(3));
    hero.style.setProperty("--py", y.toFixed(3));
  }, []);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || reduceMotion) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = heroRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPointer(((clientX - rect.left) / rect.width - 0.5) * 2, ((clientY - rect.top) / rect.height - 0.5) * 2);
    });
  };

  const onPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    setPointer(0, 0);
  };

  return (
    <div
      ref={heroRef}
      className={`${styles.hero} ${paused ? styles.heroPaused : ""}`}
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientX;
        touchStart.current = null;
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) > SWIPE_PX) go(current + (delta < 0 ? 1 : -1));
      }}
    >
      {slides.map((slide, index) => {
        const active = index === current;
        const split = slide.images.length > 1;
        // The first slide paints first; the next one is warmed up so the swap is instant.
        const eager = index === 0 || index === current || index === (current + 1) % count;
        const title = (
          <>
            {slide.lead} <Mark>{slide.mark}</Mark>
          </>
        );
        return (
          <div
            key={slide.mark}
            className={`${styles.slide} ${active ? styles.slideActive : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            aria-hidden={!active}
          >
            <div className={styles.slideCopy}>
              <p className={styles.handKicker}>{slide.kicker}</p>
              {index === 0 ? (
                <h1 className={styles.slideTitle}>{title}</h1>
              ) : (
                <h2 className={styles.slideTitle}>{title}</h2>
              )}
              <p className={styles.slideText}>{slide.text}</p>
              <div className={styles.slideActions}>
                <ButtonLink
                  href={slide.href}
                  size="lg"
                  variant="primary"
                  className={styles.ctaArrow}
                  tabIndex={active ? 0 : -1}
                  rightIcon={<ArrowRight size={18} />}
                >
                  {slide.cta}
                </ButtonLink>
                {slide.secondary ? (
                  <Link href={slide.secondary.href} className={styles.textLink} tabIndex={active ? 0 : -1}>
                    {slide.secondary.label}
                  </Link>
                ) : null}
              </div>
            </div>

            <div className={styles.slideArt} aria-hidden="true">
              <div className={styles.layerBack}>
                {slide.images.map((src, imageIndex) => (
                  <figure
                    key={`${src}-${imageIndex}`}
                    className={`${styles.frame} ${
                      split ? (imageIndex === 0 ? styles.frameLeft : styles.frameRight) : styles.frameSolo
                    }`}
                  >
                    { }
                    <img
                      src={optimizedImage(src, split ? 420 : 640)}
                      srcSet={imageSrcSet(src, FRAME_WIDTHS)}
                      sizes={split ? "(max-width: 860px) 40vw, 260px" : "(max-width: 860px) 60vw, 300px"}
                      alt=""
                      loading={eager ? "eager" : "lazy"}
                      fetchPriority={index === 0 && imageIndex === 0 ? "high" : "auto"}
                      decoding="async"
                      draggable={false}
                      onError={swapToFallback}
                    />
                  </figure>
                ))}
                <Asterisk className={styles.artStar} />
                <Squiggle className={styles.artSquiggle} />
              </div>
              <div className={styles.layerFront}>
                {slide.notes.map(({ Icon, small, strong }, noteIndex) => (
                  <div
                    key={strong}
                    className={`${styles.note} ${noteIndex === 0 ? styles.noteA : styles.noteB}`}
                  >
                    <span className={`${styles.noteIcon} ${noteIndex === 1 ? styles.noteIconWarm : ""}`}>
                      <Icon size={18} />
                    </span>
                    <span>
                      <small>{small}</small>
                      <strong>{strong}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className={styles.controls}>
        <span className={styles.counter} aria-hidden="true">
          <strong>{String(current + 1).padStart(2, "0")}</strong> / {String(count).padStart(2, "0")}
        </span>
        <div className={styles.dots}>
          {slides.map((slide, index) => (
            <button
              key={slide.mark}
              type="button"
              className={`${styles.dot} ${index === current ? styles.dotActive : ""}`}
              aria-label={`Show slide ${index + 1}: ${slide.lead} ${slide.mark}`}
              aria-current={index === current}
              onClick={() => go(index)}
            >
              <span className={styles.dotBar}>
                <span
                  key={index === current ? `${current}-${paused}` : "idle"}
                  className={`${styles.dotFill} ${
                    index === current && reduceMotion
                      ? styles.dotFillDone
                      : index === current
                        ? styles.dotFillRun
                        : ""
                  }`}
                  style={index === current ? { animationDuration: `${SLIDE_INTERVAL_MS}ms` } : undefined}
                />
              </span>
            </button>
          ))}
        </div>
        <div className={styles.arrows}>
          <button type="button" className={styles.arrow} aria-label="Previous slide" onClick={() => go(current - 1)}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className={styles.arrow} aria-label="Next slide" onClick={() => go(current + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
