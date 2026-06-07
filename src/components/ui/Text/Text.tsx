import React from "react";
import styles from "./Text.module.css";

interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: "p" | "span" | "div";
  size?: "xs" | "sm" | "md" | "lg";
  weight?: "normal" | "medium" | "semibold" | "bold";
  color?: "main" | "muted" | "light" | "primary";
  children: React.ReactNode;
  className?: string;
}

export const Text = ({
  as: Tag = "p",
  size = "md",
  weight = "normal",
  color = "main",
  children,
  className = "",
  ...props
}: TextProps) => {
  const textClass = `${styles.text} ${styles[size]} ${styles[weight]} ${styles[color]} ${className}`;

  return (
    <Tag className={textClass} {...props}>
      {children}
    </Tag>
  );
};
export default Text;
