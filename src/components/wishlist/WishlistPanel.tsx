"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, FolderPlus, Heart, Link2, Link2Off, Pencil, Trash2 } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import Notice from "@/components/ui/Notice/Notice";
import { formatInr, priceWithGst } from "@/utils/gst";
import { productHref } from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import {
  createWishlistCollection,
  deleteWishlistCollection,
  disableWishlistShare,
  enableWishlistShare,
  fetchWishlistFull,
  moveWishlistItem,
  renameWishlistCollection,
  resetWishedProductIds,
  toggleWishlist,
  type WishlistFull,
} from "@/utils/wishlist";
import styles from "./WishlistPanel.module.css";

const ALL = "all";

/** Account → Wishlist: saved pieces, organised into named lists, with share links. */
export default function WishlistPanel({ onCountChange }: { onCountChange?: (count: number) => void }) {
  const [data, setData] = useState<WishlistFull | null>(null);
  const [selected, setSelected] = useState<string>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchWishlistFull();
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load your wishlist.");
      return;
    }
    setError(null);
    setData(result.data);
    onCountChange?.(result.data.total);
  }, [onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const collections = data?.collections ?? [];
  const activeCollection = collections.find((c) => c.id === selected) ?? null;
  // A deleted list falls back to "All".
  const effective = selected === ALL || activeCollection ? selected : ALL;

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return effective === ALL ? all : all.filter((item) => item.collectionId === effective);
  }, [data, effective]);

  const shareToken = effective === ALL ? (data?.shareToken ?? null) : (activeCollection?.shareToken ?? null);
  const shareUrl = shareToken && typeof window !== "undefined" ? `${window.location.origin}/wishlist/${shareToken}` : null;

  async function run<T extends { error: string | null }>(work: () => Promise<T>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await work();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return null;
    }
    if (success) setNotice(success);
    await load();
    return result;
  }

  async function newList() {
    const name = window.prompt("Name your list (e.g. Gifts for Mum)")?.trim();
    if (!name) return;
    const result = await run(() => createWishlistCollection(name));
    const created = (result as { data?: { collection: { id: string } } } | null)?.data?.collection;
    if (created) setSelected(created.id);
  }

  async function rename() {
    if (!activeCollection) return;
    const name = window.prompt("Rename this list", activeCollection.name)?.trim();
    if (!name || name === activeCollection.name) return;
    await run(() => renameWishlistCollection(activeCollection.id, name));
  }

  async function removeList() {
    if (!activeCollection) return;
    if (!window.confirm(`Delete the list “${activeCollection.name}”? Its items stay in your wishlist.`)) return;
    await run(() => deleteWishlistCollection(activeCollection.id));
    setSelected(ALL);
  }

  async function toggleShare() {
    const collectionId = effective === ALL ? null : effective;
    if (shareToken) {
      await run(() => disableWishlistShare(collectionId), "Sharing is off. The old link no longer works.");
    } else {
      await run(() => enableWishlistShare(collectionId), "Sharing is on. Copy the link below.");
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", shareUrl);
    }
  }

  async function remove(productId: string) {
    const result = await toggleWishlist(productId, true);
    if (result.error) {
      setError(result.error);
      return;
    }
    resetWishedProductIds();
    await load();
  }

  if (!data) return <p className={styles.muted}>{error ?? "Loading your wishlist…"}</p>;

  if (data.total === 0 && collections.length === 0) {
    return (
      <EmptyState
        bare
        icon={<Heart size={22} />}
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here."
        action={<ButtonLink href="/shop" size="sm">Discover products</ButtonLink>}
      />
    );
  }

  return (
    <div className={styles.wrap}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className={styles.pills} role="tablist" aria-label="Your lists">
        <button
          type="button"
          role="tab"
          aria-selected={effective === ALL}
          className={`${styles.pill} ${effective === ALL ? styles.pillActive : ""}`}
          onClick={() => setSelected(ALL)}
        >
          All saved <span>{data.total}</span>
        </button>
        {collections.map((collection) => (
          <button
            key={collection.id}
            type="button"
            role="tab"
            aria-selected={effective === collection.id}
            className={`${styles.pill} ${effective === collection.id ? styles.pillActive : ""}`}
            onClick={() => setSelected(collection.id)}
          >
            {collection.name} <span>{collection.count}</span>
          </button>
        ))}
        <button type="button" className={styles.pillNew} onClick={() => void newList()} disabled={busy}>
          <FolderPlus size={14} aria-hidden="true" /> New list
        </button>
      </div>

      <div className={styles.tools}>
        <Button
          size="sm"
          variant={shareToken ? "secondary" : "outline"}
          disabled={busy || (effective !== ALL && items.length === 0 && !shareToken)}
          leftIcon={shareToken ? <Link2Off size={14} /> : <Link2 size={14} />}
          onClick={() => void toggleShare()}
        >
          {shareToken ? "Stop sharing" : effective === ALL ? "Share my wishlist" : "Share this list"}
        </Button>
        {activeCollection ? (
          <>
            <Button size="sm" variant="ghost" leftIcon={<Pencil size={14} />} onClick={() => void rename()} disabled={busy}>
              Rename
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} onClick={() => void removeList()} disabled={busy}>
              Delete list
            </Button>
          </>
        ) : null}
      </div>

      {shareUrl ? (
        <div className={styles.shareBox}>
          <input readOnly value={shareUrl} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="primary" leftIcon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyLink()}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <p className={styles.shareHint}>Anyone with this link can see these items, but not your name or details.</p>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className={styles.muted}>Nothing in this list yet. Move items here with the “Move to” menu.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.row}>
              <Link href={productHref({ slug: item.slug })} className={styles.link}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedImage(item.thumbnailUrl || FALLBACK_PRODUCT_IMAGE, 160)}
                  alt=""
                  className={styles.thumb}
                  loading="lazy"
                />
                <span className={styles.info}>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.shop}>{item.shopName}</span>
                </span>
              </Link>
              <span className={styles.price}>{formatInr(priceWithGst(item.price, item.gstPercent))}</span>
              <label className={styles.move}>
                <span className="sr-only">Move {item.title} to a list</span>
                <select
                  value={item.collectionId ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    void run(() => moveWishlistItem(item.productId, e.target.value || null))
                  }
                >
                  <option value="">No list</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={styles.remove} onClick={() => void remove(item.productId)}>
                <Trash2 size={13} aria-hidden="true" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
