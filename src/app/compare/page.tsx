"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Columns2, Star } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import { ButtonLink } from "@/components/ui/Button/Button";
import { asSpecLines, productHref } from "@/utils/catalog";
import { formatInr, priceWithGst } from "@/utils/gst";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import {
  MAX_COMPARE,
  clearCompare,
  fetchCompare,
  removeFromCompare,
  useCompareIds,
  type CompareProduct,
} from "@/utils/compare";
import styles from "@/components/compare/Compare.module.css";

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <CompareContent />
    </Suspense>
  );
}

function shipsIn(product: CompareProduct) {
  if (product.productType === "digital") return "Instant download";
  const min = product.processingDays;
  const max = product.processingDaysMax;
  if (max <= min) return min === 0 ? "Ships today" : `${min} day${min === 1 ? "" : "s"}`;
  return `${min}–${max} days`;
}

function CompareContent() {
  const router = useRouter();
  const params = useSearchParams();
  const stored = useCompareIds();
  // A shared link carries its own ids; otherwise use what this browser picked.
  const urlIds = useMemo(
    () =>
      (params?.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, MAX_COMPARE),
    [params]
  );
  const ids = urlIds.length > 0 ? urlIds : [...stored];
  const key = ids.join(",");

  const [products, setProducts] = useState<CompareProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void fetchCompare(key.split(",")).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setError(result.error ?? "Could not load the comparison.");
        setProducts([]);
        return;
      }
      setError(null);
      setProducts(result.data.products);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const rows = products ?? [];
  const finals = rows.map((p) => priceWithGst(p.price, p.gstPercent));
  const lowest = finals.length > 1 ? Math.min(...finals) : null;
  const bestRated = rows.length > 1 ? Math.max(...rows.map((p) => (p.reviewCount > 0 ? p.avgRating : 0))) : 0;
  const lines = rows.map((p) => asSpecLines(p.specs));

  if (!key || (products && products.length === 0)) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon={<Columns2 size={24} />}
          title={error ? "We couldn’t load the comparison" : "Nothing to compare yet"}
          description={error ?? "Tap the compare icon on two to four products, then come back here."}
          action={<ButtonLink href="/shop">Browse the shop</ButtonLink>}
        />
      </div>
    );
  }

  const unchanged = (value: (p: CompareProduct) => string) => new Set(rows.map(value)).size === 1;

  return (
    <div className={styles.page}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Compare</Breadcrumbs.Item>
      </Breadcrumbs>
      <header className={styles.head}>
        <h1>Compare products</h1>
        <p className={styles.muted}>
          Side by side, so you can choose.{" "}
          <button type="button" className={styles.remove} onClick={() => { clearCompare(); router.replace("/compare"); }}>
            Clear all
          </button>
        </p>
      </header>

      {products === null ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className="sr-only">Comparison of {rows.length} products</caption>
            <thead>
              <tr>
                <th scope="row">Product</th>
                {rows.map((p) => (
                  <th key={p.id} scope="col">
                    <div className={styles.productCell}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={optimizedImage(p.thumbnailUrl || FALLBACK_PRODUCT_IMAGE, 360)} alt="" loading="lazy" />
                      <Link href={productHref(p)} className={styles.productTitle}>
                        {p.title}
                      </Link>
                      <button
                        type="button"
                        className={styles.remove}
                        onClick={() => {
                          removeFromCompare(p.id);
                          if (urlIds.length > 0) router.replace(`/compare?ids=${urlIds.filter((id) => id !== p.id).join(",")}`);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Price</th>
                {rows.map((p, i) => (
                  <td key={p.id}>
                    <span className={styles.price}>{formatInr(finals[i])}</span>
                    {p.compareAtPrice && p.compareAtPrice > p.price ? (
                      <span className={styles.was}>{formatInr(priceWithGst(p.compareAtPrice, p.gstPercent))}</span>
                    ) : null}
                    {lowest !== null && finals[i] === lowest && finals.filter((f) => f === lowest).length === 1 ? (
                      <span className={styles.best}>Lowest</span>
                    ) : null}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Rating</th>
                {rows.map((p) => (
                  <td key={p.id}>
                    {p.reviewCount > 0 ? (
                      <>
                        <Star size={13} fill="currentColor" strokeWidth={0} aria-hidden="true" style={{ color: "var(--color-star)" }} />{" "}
                        {p.avgRating.toFixed(1)} ({p.reviewCount.toLocaleString("en-IN")})
                        {bestRated > 0 && p.avgRating === bestRated ? <span className={styles.best}>Top rated</span> : null}
                      </>
                    ) : (
                      "New, no reviews yet"
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Made by</th>
                {rows.map((p) => (
                  <td key={p.id}>
                    <Link href={`/shops/${p.shopSlug}`} className={styles.productTitle}>
                      {p.maker.name}
                    </Link>
                    {p.maker.place ? <div className={styles.muted}>{p.maker.place}</div> : null}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Category</th>
                {rows.map((p) => (
                  <td key={p.id}>{p.categoryName ?? "—"}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Availability</th>
                {rows.map((p) => (
                  <td key={p.id} className={p.inStock ? styles.good : styles.bad}>
                    {p.inStock ? "In stock" : "Out of stock"}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Ships in</th>
                {rows.map((p) => (
                  <td key={p.id}>{shipsIn(p)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Returns</th>
                {rows.map((p) => (
                  <td key={p.id} className={p.isReturnable ? undefined : styles.bad}>
                    {p.productType === "digital"
                      ? "Not for downloads"
                      : p.isReturnable
                        ? `${p.returnWindowDays}-day returns`
                        : "No returns"}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Customisable</th>
                {rows.map((p) => (
                  <td key={p.id}>{p.isCustomizable ? "Yes" : "No"}</td>
                ))}
              </tr>
              {lines.some((l) => l.length > 0) ? (
                <tr>
                  <th scope="row">Highlights</th>
                  {rows.map((p, i) => (
                    <td key={p.id}>
                      {lines[i].length > 0 ? (
                        <ul className={styles.bullets}>
                          {lines[i].slice(0, 8).map((line, n) => (
                            <li key={n}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              ) : null}
              {!unchanged((p) => p.tags.join("|")) && rows.some((p) => p.tags.length > 0) ? (
                <tr>
                  <th scope="row">Tags</th>
                  {rows.map((p) => (
                    <td key={p.id}>{p.tags.slice(0, 6).join(", ") || "—"}</td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
