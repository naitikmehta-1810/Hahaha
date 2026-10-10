"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Heart } from "lucide-react";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import { ButtonLink } from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import { productHref } from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";
import { fetchSharedWishlist, type SharedWishlist } from "@/utils/wishlist";
import styles from "./shared.module.css";

/** What a wishlist share link opens: the saved pieces, nothing about the owner but a display name. */
export default function SharedWishlistPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [data, setData] = useState<SharedWishlist | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetchSharedWishlist(token).then((result) => {
      if (cancelled) return;
      if (result.data) setData(result.data);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (missing) {
    return (
      <div className={styles.container}>
        <EmptyState
          icon={<Heart size={24} />}
          title="This list isn’t available"
          description="The link may have been turned off by its owner."
          action={<ButtonLink href="/shop">Browse the shop</ButtonLink>}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.container} aria-busy="true">
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  const heading = data.title === "Wishlist" ? `${data.owner}’s wishlist` : `${data.owner}’s list: ${data.title}`;
  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Shared list</Breadcrumbs.Item>
      </Breadcrumbs>
      <header className={styles.head}>
        <h1>{heading}</h1>
        <p className={styles.muted}>
          {data.items.length} piece{data.items.length === 1 ? "" : "s"} saved on Stuffsy
        </p>
      </header>
      {data.items.length === 0 ? (
        <p className={styles.muted}>Nothing available in this list right now.</p>
      ) : (
        <div className={styles.grid}>
          {data.items.map((item) => (
            <ProductCard key={item.id} href={productHref({ slug: item.slug })} productId={item.productId}>
              <ProductCard.Image
                src={item.thumbnailUrl || FALLBACK_PRODUCT_IMAGE}
                alt={item.title}
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
                }}
              />
              <ProductCard.Body>
                <ProductCard.Title>{item.title}</ProductCard.Title>
                <ProductCard.Subtitle>{item.shopName}</ProductCard.Subtitle>
                <ProductCard.Price amount={item.price} gstPercent={item.gstPercent} />
              </ProductCard.Body>
            </ProductCard>
          ))}
        </div>
      )}
    </div>
  );
}
