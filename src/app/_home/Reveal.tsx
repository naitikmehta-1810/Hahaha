"use client";

import React from "react";
import { useInView } from "./useInView";
import styles from "../page.module.css";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "ul";
  /** Extra delay in ms, to stagger siblings. */
  delay?: number;
};

/** Fades and lifts its content in the first time it scrolls into view. */
export default function Reveal({
  as = "div",
  delay,
  className = "",
  style,
  children,
  ...rest
}: RevealProps) {
  const [ref, inView] = useInView<HTMLElement>();
  return React.createElement(
    as,
    {
      ...rest,
      ref,
      className: `${styles.reveal} ${className}`,
      "data-in": inView ? "" : undefined,
      style: delay ? ({ ...style, "--d": `${delay}ms` } as React.CSSProperties) : style,
    },
    children
  );
}
