import React from "react";
import Link from "next/link";
import styles from "./Breadcrumbs.module.css";
import { ChevronRight } from "lucide-react";

interface BreadcrumbsProps extends React.HTMLAttributes<HTMLOListElement> {
  children: React.ReactNode;
  className?: string;
}

const BreadcrumbsRoot = ({ children, className = "", ...props }: BreadcrumbsProps) => {
  const childrenArray = React.Children.toArray(children);
  
  return (
    <nav aria-label="Breadcrumb">
      <ol className={`${styles.breadcrumbs} ${className}`} {...props}>
        {childrenArray.map((child, index) => {
          const isLast = index === childrenArray.length - 1;
          return (
            <React.Fragment key={index}>
              {child}
              {!isLast && (
                <li className={styles.separator} aria-hidden="true">
                  <ChevronRight size={14} strokeWidth={2.5} />
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

interface BreadcrumbsItemProps {
  children: React.ReactNode;
  href?: string;
  active?: boolean;
}

const BreadcrumbsItem = ({ children, href, active = false }: BreadcrumbsItemProps) => {
  return (
    <li className={`${styles.item} ${active ? styles.active : ""}`}>
      {href && !active ? (
        <Link href={href} className={styles.link}>
          {children}
        </Link>
      ) : (
        <span>{children}</span>
      )}
    </li>
  );
};

export const Breadcrumbs = Object.assign(BreadcrumbsRoot, {
  Item: BreadcrumbsItem,
});

export default Breadcrumbs;
