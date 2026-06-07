import React from "react";
import Link from "next/link";
import styles from "./Sidebar.module.css";
import { Button } from "../../ui/Button/Button";
import { Store } from "lucide-react";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

const SidebarRoot = ({ children, className = "", ...props }: SidebarProps) => {
  return (
    <aside className={`${styles.sidebar} ${className}`} {...props}>
      {children}
    </aside>
  );
};

interface SidebarNavProps {
  children: React.ReactNode;
}

const SidebarNav = ({ children }: SidebarNavProps) => {
  return <nav className={styles.navSection}>{children}</nav>;
};

interface SidebarItemProps {
  children: React.ReactNode;
  icon: React.ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ children, icon, href, active = false, onClick }: SidebarItemProps) => {
  const itemClass = `${styles.item} ${active ? styles.active : ""}`;

  if (href) {
    return (
      <Link href={href} className={itemClass}>
        <span className={styles.icon}>{icon}</span>
        <span>{children}</span>
      </Link>
    );
  }

  return (
    <button type="button" className={itemClass} onClick={onClick}>
      <span className={styles.icon}>{icon}</span>
      <span>{children}</span>
    </button>
  );
};

interface SidebarCalloutProps {
  title: string;
  description: string;
  buttonText: string;
  onButtonClick?: () => void;
}

const SidebarCallout = ({
  title,
  description,
  buttonText,
  onButtonClick,
}: SidebarCalloutProps) => {
  return (
    <div className={styles.callout}>
      <div className={styles.calloutTitle}>{title}</div>
      <div className={styles.calloutDesc}>{description}</div>
      <Button
        variant="primary"
        size="sm"
        className={styles.calloutBtn}
        onClick={onButtonClick}
      >
        {buttonText}
      </Button>
      <Store size={80} className={styles.calloutIcon} />
    </div>
  );
};

export const Sidebar = Object.assign(SidebarRoot, {
  Nav: SidebarNav,
  Item: SidebarItem,
  Callout: SidebarCallout,
});

export default Sidebar;
