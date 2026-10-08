"use client";

import { useCallback, useState } from "react";

/**
 * One IntersectionObserver per rootMargin, shared by every element that asks
 * for it, so a page of reveal animations costs a handful of observers, not dozens.
 */
const observers = new Map<string, IntersectionObserver>();
const callbacks = new WeakMap<Element, () => void>();

function observerFor(rootMargin: string) {
  let observer = observers.get(rootMargin);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callback = callbacks.get(entry.target);
          callbacks.delete(entry.target);
          observer?.unobserve(entry.target);
          callback?.();
        }
      },
      { rootMargin }
    );
    observers.set(rootMargin, observer);
  }
  return observer;
}

/**
 * `true` once the element has entered the viewport (it never flips back).
 * Browsers without IntersectionObserver get `true` straight away.
 */
export function useInView<T extends Element>(rootMargin = "0px 0px -8% 0px") {
  const [inView, setInView] = useState(false);

  const ref = useCallback(
    (element: T | null) => {
      if (!element) return;
      if (typeof IntersectionObserver === "undefined") {
        setInView(true);
        return;
      }
      const observer = observerFor(rootMargin);
      callbacks.set(element, () => setInView(true));
      observer.observe(element);
      return () => {
        callbacks.delete(element);
        observer.unobserve(element);
      };
    },
    [rootMargin]
  );

  return [ref, inView] as const;
}
