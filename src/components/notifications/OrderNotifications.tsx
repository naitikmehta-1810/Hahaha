"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest } from "@/utils/api-client";
import styles from "./OrderNotifications.module.css";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function whenLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OrderNotifications() {
  const { isAuthenticated, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "ready" || !isAuthenticated) return;
    let cancelled = false;

    const load = async () => {
      const result = await apiRequest<{
        unreadCount: number;
        notifications: AppNotification[];
      }>("GET", "/api/account/notifications");
      if (cancelled || !result.data) return;
      setUnread(result.data.unreadCount);
      setItems(result.data.notifications);
    };

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAuthenticated, status]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  if (!isAuthenticated) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      void apiRequest("POST", "/api/account/notifications/read", { body: {} });
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.button}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell size={18} />
        {unread > 0 ? <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Order notifications">
          <p className={styles.title}>Notifications</p>
          {items.length === 0 ? (
            <p className={styles.empty}>No order updates yet.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => {
                const content = (
                  <>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <time dateTime={item.createdAt}>{whenLabel(item.createdAt)}</time>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} className={styles.item} onClick={() => setOpen(false)}>
                        {content}
                      </Link>
                    ) : (
                      <div className={styles.item}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
