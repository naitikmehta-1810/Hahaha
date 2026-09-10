"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { fetchMySeller } from "@/utils/seller";
import styles from "../seller.module.css";

type SellerProduct = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  stockQuantity: number;
  thumbnailUrl: string | null;
  updatedAt: string;
};

export default function SellerProductsPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/seller/products");
      return;
    }
    void (async () => {
      const seller = await fetchMySeller();
      if (!seller) {
        router.push("/sell");
        return;
      }
      const result = await apiRequest<{ products: SellerProduct[] }>(
        "GET",
        "/api/seller/products"
      );
      if (result.error) {
        setError(result.error);
      } else {
        setProducts(result.data?.products ?? []);
      }
      setLoading(false);
    })();
  }, [authStatus, isAuthenticated, router]);

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/seller">Seller</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Products</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Your Products</Heading>
          <Text size="sm" color="muted">
            Manage listings, stock, and images.
          </Text>
        </div>
        <Button variant="primary" onClick={() => router.push("/seller/products/new")}>
          Add Product
        </Button>
      </div>

      {loading ? <Text color="muted">Loading…</Text> : null}
      {error ? (
        <Text size="sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </Text>
      ) : null}

      {!loading && products.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No products yet.</p>
          <Button variant="primary" onClick={() => router.push("/seller/products/new")}>
            Add your first product
          </Button>
        </div>
      ) : null}

      {products.map((product) => (
        <div key={product.id} className={styles.card} style={{ marginBottom: 12 }}>
          <div className={styles.row}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {product.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.thumbnailUrl}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: "var(--color-border)",
                  }}
                />
              )}
              <div>
                <div>{product.title}</div>
                <div className={styles.muted}>
                  {product.status} · stock {product.stockQuantity} · ₹
                  {product.price.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href={`/products/${product.slug}`} style={{ fontSize: "0.85rem" }}>
                View
              </Link>
              <Button
                variant="outline"
                onClick={() => router.push(`/seller/products/${product.id}/edit`)}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
