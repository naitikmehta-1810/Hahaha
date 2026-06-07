import React from "react";
import styles from "./Heading.module.css";

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
}

export const Heading = ({
  level = 2,
  children,
  className = "",
  ...props
}: HeadingProps) => {
  const Tag = `h${level}` as const;
  const headingClass = `${styles.heading} ${styles[`h${level}`]} ${className}`;

  return (
    <Tag className={headingClass} {...props}>
      {children}
    </Tag>
  );
};
export default Heading;
