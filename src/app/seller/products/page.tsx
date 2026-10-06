"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Import, Package, Plus, Search } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { fetchMySeller } from "@/utils/seller";
import { formatDate, rupees } from "@/utils/format";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import ui from "@/components/console/console.module.css";
import styles from "../seller.module.css";

type SellerProduct = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  stockQuantity: number;
  productType?: string;
  thumbnailUrl: string | null;
  updatedAt: string;
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Drafts" },
] as const;

export default function SellerProductsPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const loadProducts = async () => {
    const result = await apiRequest<{ products: SellerProduct[] }>(
      "GET",
      "/api/seller/products"
    );
    if (result.error) {
      setError(result.error);
    } else {
      setProducts(result.data?.products ?? []);
      setError(null);
    }
    setLoading(false);
  };

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
      await loadProducts();
    })();
  }, [authStatus, isAuthenticated, router]);

  const setStatus = async (product: SellerProduct, status: "active" | "draft") => {
    setBusyId(product.id);
    setError(null);
    const result = await apiRequest("PATCH", `/api/seller/products/${product.id}`, {
      body: { status },
    });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadProducts();
  };

  const deleteProduct = async (product: SellerProduct) => {
    if (
      !window.confirm(
        `Delete “${product.title}”? It will leave the shop and stay on past orders.`
      )
    ) {
      return;
    }
    setBusyId(product.id);
    setError(null);
    const result = await apiRequest("DELETE", `/api/seller/products/${product.id}`);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadProducts();
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      if (filter === "active" && product.status !== "active") return false;
      if (filter === "draft" && product.status === "active") return false;
      return !term || product.title.toLowerCase().includes(term);
    });
  }, [products, query, filter]);

  const counts = {
    all: products.length,
    active: products.filter((p) => p.status === "active").length,
    draft: products.filter((p) => p.status !== "active").length,
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage listings, prices and stock."
        actions={
          <>
            <ButtonLink href="/seller/products/import" variant="outline" leftIcon={<Import size={16} />}>
              Import from Shopify
            </ButtonLink>
            <ButtonLink href="/seller/products/new" leftIcon={<Plus size={16} />}>
              Add product
            </ButtonLink>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {loading ? (
        <p className={ui.muted}>Loading products…</p>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package size={24} />}
          title="No products yet"
          description="Add your first product to start selling. Drafts stay private until you publish."
          action={
            <ButtonLink href="/seller/products/new" leftIcon={<Plus size={16} />}>
              Add your first product
            </ButtonLink>
          }
        />
      ) : (
        <section className={`${ui.card} ${ui.cardFlush}`}>
          <div className={`${ui.cardHead} ${styles.productsToolbar}`}>
            <div className={ui.toolbar} role="tablist" aria-label="Filter products">
              {FILTERS.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  role="tab"
                  aria-selected={filter === item.value}
                  variant={filter === item.value ? "primary" : "secondary"}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label} ({counts[item.value]})
                </Button>
              ))}
            </div>
            <label className={styles.searchBox}>
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your products"
                aria-label="Search your products"
              />
            </label>
          </div>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th className={ui.num}>Stock</th>
                  <th className={ui.num}>Price</th>
                  <th>Updated</th>
                  <th className={ui.num}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => {
                  const busy = busyId === product.id;
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className={ui.cellMedia}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={optimizedImage(product.thumbnailUrl || FALLBACK_PRODUCT_IMAGE, 120)}
                            alt=""
                            className={ui.thumb}
                          />
                          <span>
                            <Link
                              href={`/seller/products/${product.id}/edit`}
                              className={ui.cellPrimary}
                            >
                              {product.title}
                            </Link>
                            <Link
                              href={`/products/${product.slug}`}
                              className={`${ui.cellSub} ${styles.viewLink}`}
                            >
                              View in shop <ExternalLink size={11} aria-hidden="true" />
                            </Link>
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={product.status} />
                      </td>
                      <td className={ui.num}>
                        {product.productType === "digital" ? (
                          <StatusPill tone="info">Digital</StatusPill>
                        ) : product.stockQuantity <= 0 ? (
                          <StatusPill tone="danger">Out of stock</StatusPill>
                        ) : (
                          product.stockQuantity.toLocaleString("en-IN")
                        )}
                      </td>
                      <td className={`${ui.num} ${ui.cellPrimary}`}>{rupees(product.price)}</td>
                      <td className={ui.nowrap}>{formatDate(product.updatedAt)}</td>
                      <td>
                        <div className={ui.rowActions}>
                          <ButtonLink
                            size="sm"
                            variant="secondary"
                            href={`/seller/products/${product.id}/edit`}
                          >
                            Edit
                          </ButtonLink>
                          {product.status === "active" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void setStatus(product, "draft")}
                            >
                              Unpublish
                            </Button>
                          ) : product.status !== "archived" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void setStatus(product, "active")}
                            >
                              Publish
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => void deleteProduct(product)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={ui.emptyCell}>
                      No products match {query.trim() ? `“${query.trim()}”` : "this filter"}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
