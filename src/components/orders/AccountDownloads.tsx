"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import { ButtonLink } from "@/components/ui/Button/Button";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import { fetchAccountDownloads, type AccountDownload } from "@/utils/downloads";
import DownloadList from "./DownloadList";
import styles from "./AccountDownloads.module.css";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Every digital product the buyer owns, with fresh download buttons. */
export default function AccountDownloads() {
  const [items, setItems] = useState<AccountDownload[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAccountDownloads().then((result) => {
      if (cancelled) return;
      setItems(result.downloads);
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return <p className={styles.muted}>Loading your downloads…</p>;
  }
  if (error && items.length === 0) {
    return <p className={styles.error}>{error}</p>;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        bare
        icon={<Download size={22} />}
        title="No downloads yet"
        description="Digital products you buy show up here, ready to download any time."
        action={
          <ButtonLink href="/shop" size="sm">
            Browse products
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.orderItemId} className={styles.item}>
          <div className={styles.head}>
            <img
              src={optimizedImage(item.imageUrl || FALLBACK_PRODUCT_IMAGE, 160)}
              alt=""
              className={styles.thumb}
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
              }}
            />
            <div className={styles.meta}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.sub}>
                Bought {formatDate(item.purchasedAt)} ·{" "}
                <Link href={`/orders/${item.orderId}/details`} className={styles.link}>
                  Order #{item.orderNumber}
                </Link>
              </span>
            </div>
          </div>
          {item.files.length > 0 ? (
            <DownloadList orderId={item.orderId} orderItemId={item.orderItemId} files={item.files} />
          ) : (
            <p className={styles.muted}>The maker hasn&apos;t attached files to this product.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
