"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { fetchCategories, type CategoryNode } from "@/utils/catalog";
import { fetchMySeller } from "@/utils/seller";
import styles from "../../../seller.module.css";

type Collection = { id: string; name: string; slug: string };

type SellerProductDetail = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  subcategoryId: string | null;
  productType: "physical" | "digital";
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  sku: string | null;
  stockQuantity: number;
  lowStockAlert: number;
  continueSellingWhenOutOfStock: boolean;
  weight: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  status: "active" | "draft" | string;
  tags: string[];
  imageUrls: string[];
  collectionIds: string[];
};

export default function EditProductPage() {
  const params = useParams();
  const productId = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    shortDescription: "",
    description: "",
    categoryId: "",
    subcategoryId: "",
    productType: "physical" as "physical" | "digital",
    price: "",
    compareAtPrice: "",
    costPrice: "",
    sku: "",
    stockQuantity: "0",
    lowStockAlert: "5",
    continueSelling: false,
    weight: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    status: "active" as "active" | "draft",
    tags: "",
    imageUrl: "",
    imageUrls: [] as string[],
  });

  const loadCollections = async () => {
    const result = await apiRequest<{ collections: Collection[] }>(
      "GET",
      "/api/seller/collections"
    );
    if (result.data?.collections) setCollections(result.data.collections);
  };

  useEffect(() => {
    if (authStatus === "loading" || !productId) return;
    if (!isAuthenticated) {
      redirectToLogin(`/seller/products/${productId}/edit`);
      return;
    }
    void (async () => {
      const seller = await fetchMySeller();
      if (!seller) {
        router.push("/sell");
        return;
      }
      await Promise.all([fetchCategories().then(setCategories), loadCollections()]);
      const result = await apiRequest<{ product: SellerProductDetail }>(
        "GET",
        `/api/seller/products/${productId}`
      );
      if (result.error || !result.data?.product) {
        setError(result.error ?? "Product not found");
        setLoading(false);
        return;
      }
      const p = result.data.product;
      setForm({
        title: p.title,
        shortDescription: p.shortDescription,
        description: p.description,
        categoryId: p.categoryId,
        subcategoryId: p.subcategoryId ?? "",
        productType: p.productType === "digital" ? "digital" : "physical",
        price: String(p.price),
        compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : "",
        costPrice: p.costPrice != null ? String(p.costPrice) : "",
        sku: p.sku ?? "",
        stockQuantity: String(p.stockQuantity),
        lowStockAlert: String(p.lowStockAlert),
        continueSelling: p.continueSellingWhenOutOfStock,
        weight: p.weight != null ? String(p.weight) : "",
        lengthCm: p.lengthCm != null ? String(p.lengthCm) : "",
        widthCm: p.widthCm != null ? String(p.widthCm) : "",
        heightCm: p.heightCm != null ? String(p.heightCm) : "",
        status: p.status === "draft" ? "draft" : "active",
        tags: (p.tags ?? []).join(", "),
        imageUrl: "",
        imageUrls: p.imageUrls ?? [],
      });
      setSelectedCollections(p.collectionIds ?? []);
      setLoading(false);
    })();
  }, [authStatus, isAuthenticated, productId, router]);

  const selectedParent = categories.find((c) => c.id === form.categoryId);
  const subcats = selectedParent?.children ?? [];

  const createCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    const result = await apiRequest<{ collection: Collection }>(
      "POST",
      "/api/seller/collections",
      { body: { name } }
    );
    if (result.error || !result.data?.collection) {
      setError(result.error ?? "Could not create collection.");
      return;
    }
    setCollections((prev) => [...prev, result.data!.collection]);
    setSelectedCollections((prev) => [...prev, result.data!.collection.id]);
    setNewCollectionName("");
  };

  const uploadFile = async (file: File) => {
    const reader = new FileReader();
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
    const result = await apiRequest<{ url: string }>("POST", "/api/seller/uploads", {
      body: { fileName: file.name, dataBase64, folder: "products" },
    });
    if (result.error || !result.data?.url) {
      throw new Error(result.error ?? "Upload failed");
    }
    return result.data.url;
  };

  const submit = async (status: "draft" | "active") => {
    setBusy(true);
    setError(null);
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    const urls = [...form.imageUrls];
    if (form.imageUrl.trim()) urls.unshift(form.imageUrl.trim());
    const imageUrls = [...new Set(urls)].slice(0, 8);
    const result = await apiRequest<{ product: { id: string } }>(
      "PATCH",
      `/api/seller/products/${productId}`,
      {
        body: {
          title: form.title.trim(),
          shortDescription: form.shortDescription.trim(),
          description: form.description.trim(),
          categoryId: form.categoryId,
          subcategoryId: form.subcategoryId || null,
          productType: form.productType,
          price: Number(form.price),
          compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
          costPrice: form.costPrice ? Number(form.costPrice) : null,
          sku: form.sku.trim() || null,
          stockQuantity: Number(form.stockQuantity) || 0,
          lowStockAlert: Number(form.lowStockAlert) || 5,
          continueSellingWhenOutOfStock: form.continueSelling,
          weight: form.weight ? Number(form.weight) : null,
          lengthCm: form.lengthCm ? Number(form.lengthCm) : null,
          widthCm: form.widthCm ? Number(form.widthCm) : null,
          heightCm: form.heightCm ? Number(form.heightCm) : null,
          status,
          tags,
          imageUrls,
          collectionIds: selectedCollections,
        },
      }
    );
    setBusy(false);
    if (result.error) {
      setError(result.error ?? "Could not save product.");
      return;
    }
    router.push("/seller/products");
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Text color="muted">Loading product…</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/seller/products">Products</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Edit Product</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Edit Product</Heading>
          <Text size="sm" color="muted">
            Update details, stock, images, and collections.
          </Text>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void submit("draft")}
          >
            Save as Draft
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void submit("active")}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {error ? (
        <Text size="sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </Text>
      ) : null}

      <div className={styles.card}>
        <label className={styles.muted}>Product Title* ({form.title.length}/150)</label>
        <input
          value={form.title}
          maxLength={150}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={inputStyle}
        />
        <label className={styles.muted}>
          Short Description* ({form.shortDescription.length}/250)
        </label>
        <textarea
          value={form.shortDescription}
          maxLength={250}
          onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
          style={{ ...inputStyle, minHeight: 70 }}
        />
        <label className={styles.muted}>Full Description*</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          style={{ ...inputStyle, minHeight: 120 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label className={styles.muted}>Category*</label>
            <select
              value={form.categoryId}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryId: e.target.value, subcategoryId: "" }))
              }
              style={inputStyle}
            >
              <option value="">Select</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.muted}>Subcategory</label>
            <select
              value={form.subcategoryId}
              onChange={(e) => setForm((f) => ({ ...f, subcategoryId: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Select</option>
              {subcats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.muted}>Product Type*</label>
            <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
              {(["physical", "digital"] as const).map((type) => (
                <label key={type} style={{ fontSize: "0.875rem" }}>
                  <input
                    type="radio"
                    checked={form.productType === type}
                    onChange={() => setForm((f) => ({ ...f, productType: type }))}
                  />{" "}
                  {type[0].toUpperCase() + type.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label className={styles.muted}>Price* (₹)</label>
            <input
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={styles.muted}>Compare at Price</label>
            <input
              value={form.compareAtPrice}
              onChange={(e) => setForm((f) => ({ ...f, compareAtPrice: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={styles.muted}>Cost Price (seller-only)</label>
            <input
              value={form.costPrice}
              onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label className={styles.muted}>SKU</label>
            <input
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={styles.muted}>Stock Quantity*</label>
            <input
              value={form.stockQuantity}
              onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={styles.muted}>Low Stock Alert</label>
            <input
              value={form.lowStockAlert}
              onChange={(e) => setForm((f) => ({ ...f, lowStockAlert: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>

        <label style={{ fontSize: "0.875rem", display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={form.continueSelling}
            onChange={(e) => setForm((f) => ({ ...f, continueSelling: e.target.checked }))}
          />
          Continue selling when out of stock
        </label>

        {form.productType === "physical" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className={styles.muted}>Weight (kg)*</label>
              <input
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={styles.muted}>Length (cm)*</label>
              <input
                value={form.lengthCm}
                onChange={(e) => setForm((f) => ({ ...f, lengthCm: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={styles.muted}>Width (cm)*</label>
              <input
                value={form.widthCm}
                onChange={(e) => setForm((f) => ({ ...f, widthCm: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={styles.muted}>Height (cm)*</label>
              <input
                value={form.heightCm}
                onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
        ) : null}

        <label className={styles.muted}>Tags (comma-separated, max 10)</label>
        <input
          value={form.tags}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          style={inputStyle}
        />

        <h3 className={styles.cardTitle}>Collections</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {collections.map((c) => {
            const checked = selectedCollections.includes(c.id);
            return (
              <label
                key={c.id}
                style={{
                  fontSize: "0.85rem",
                  border: "1px solid var(--color-border-dark)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  background: checked ? "var(--color-primary-soft, #f5f3ff)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelectedCollections((prev) =>
                      checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                    )
                  }
                  style={{ marginRight: 6 }}
                />
                {c.name}
              </label>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="New collection name"
            style={{ ...inputStyle, margin: 0 }}
          />
          <Button variant="outline" onClick={() => void createCollection()}>
            Add
          </Button>
        </div>

        <label className={styles.muted}>Image URL (optional)</label>
        <input
          value={form.imageUrl}
          onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          style={inputStyle}
        />
        <label className={styles.muted}>Upload images via Cloudinary (max 8)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                const uploaded: string[] = [];
                for (const file of files.slice(0, 8 - form.imageUrls.length)) {
                  uploaded.push(await uploadFile(file));
                }
                setForm((f) => ({
                  ...f,
                  imageUrls: [...f.imageUrls, ...uploaded].slice(0, 8),
                }));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed");
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            })();
          }}
          style={{ marginBottom: 12 }}
        />
        {form.imageUrls.length > 0 ? (
          <ul style={{ fontSize: "0.8rem", marginBottom: 12 }}>
            {form.imageUrls.map((url, idx) => (
              <li key={url}>
                {idx === 0 ? "(thumbnail) " : ""}
                {url}{" "}
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      imageUrls: f.imageUrls.filter((u) => u !== url),
                    }))
                  }
                >
                  remove
                </button>
                {idx > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => {
                        const next = [...f.imageUrls];
                        const [item] = next.splice(idx, 1);
                        next.unshift(item);
                        return { ...f, imageUrls: next };
                      })
                    }
                  >
                    make thumbnail
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <label style={{ fontSize: "0.875rem" }}>
            <input
              type="radio"
              checked={form.status === "active"}
              onChange={() => setForm((f) => ({ ...f, status: "active" }))}
            />{" "}
            Active
          </label>
          <label style={{ fontSize: "0.875rem" }}>
            <input
              type="radio"
              checked={form.status === "draft"}
              onChange={() => setForm((f) => ({ ...f, status: "draft" }))}
            />{" "}
            Draft
          </label>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--color-border-dark)",
  borderRadius: 8,
  margin: "6px 0 14px",
  fontSize: "0.875rem",
};
