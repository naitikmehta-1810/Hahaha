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
import {
  parseOptionalNumber,
  validatePhysicalShippingFields,
} from "@/utils/productForm";
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
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(
        `"${file.name}" is too large (${Math.round(file.size / 1024 / 1024)}MB). Use an image under 8MB.`
      );
    }
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
      const msg = result.error ?? "Upload failed";
      if (/entity too large|payload too large|413/i.test(msg)) {
        throw new Error("Image is too large for upload. Use a smaller file (under 8MB).");
      }
      throw new Error(msg);
    }
    return result.data.url;
  };

  const submit = async (status: "draft" | "active") => {
    setBusy(true);
    setError(null);

    let weight: number | null = null;
    let lengthCm: number | null = null;
    let widthCm: number | null = null;
    let heightCm: number | null = null;
    if (form.productType === "physical") {
      const dims = validatePhysicalShippingFields(form);
      if (!dims.ok) {
        setError(dims.message);
        setBusy(false);
        return;
      }
      weight = dims.weight;
      lengthCm = dims.lengthCm;
      widthCm = dims.widthCm;
      heightCm = dims.heightCm;
    }

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
          compareAtPrice: parseOptionalNumber(form.compareAtPrice),
          costPrice: parseOptionalNumber(form.costPrice),
          sku: form.sku.trim() || null,
          stockQuantity: Number(form.stockQuantity) || 0,
          lowStockAlert: Number(form.lowStockAlert) || 5,
          continueSellingWhenOutOfStock: form.continueSelling,
          weight,
          lengthCm,
          widthCm,
          heightCm,
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
        <div className={styles.buttonRow}>
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
        <label className={styles.fieldLabel}>Product Title* ({form.title.length}/150)</label>
        <input
          value={form.title}
          maxLength={150}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className={styles.control}
        />
        <label className={styles.fieldLabel}>
          Short Description* ({form.shortDescription.length}/250)
        </label>
        <textarea
          value={form.shortDescription}
          maxLength={250}
          onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
          className={`${styles.control} ${styles.controlShort}`}
        />
        <label className={styles.fieldLabel}>Full Description*</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={`${styles.control} ${styles.controlTall}`}
        />

        <div className={styles.fieldGrid3}>
          <div>
            <label className={styles.fieldLabel}>Category*</label>
            <select
              value={form.categoryId}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryId: e.target.value, subcategoryId: "" }))
              }
              className={styles.control}
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
            <label className={styles.fieldLabel}>Subcategory</label>
            <select
              value={form.subcategoryId}
              onChange={(e) => setForm((f) => ({ ...f, subcategoryId: e.target.value }))}
              className={styles.control}
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
            <label className={styles.fieldLabel}>Product Type*</label>
            <div className={styles.choiceRow}>
              {(["physical", "digital"] as const).map((type) => (
                <label key={type} className={styles.choice}>
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

        <div className={styles.fieldGrid3}>
          <div>
            <label className={styles.fieldLabel}>Price* (₹)</label>
            <input
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className={styles.control}
            />
          </div>
          <div>
            <label className={styles.fieldLabel}>Compare at Price</label>
            <input
              value={form.compareAtPrice}
              onChange={(e) => setForm((f) => ({ ...f, compareAtPrice: e.target.value }))}
              className={styles.control}
            />
          </div>
          <div>
            <label className={styles.fieldLabel}>Cost Price (seller-only)</label>
            <input
              value={form.costPrice}
              onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              className={styles.control}
            />
          </div>
        </div>

        <div className={styles.fieldGrid3}>
          <div>
            <label className={styles.fieldLabel}>SKU</label>
            <input
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              className={styles.control}
            />
          </div>
          <div>
            <label className={styles.fieldLabel}>Stock Quantity*</label>
            <input
              value={form.stockQuantity}
              onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))}
              className={styles.control}
            />
          </div>
          <div>
            <label className={styles.fieldLabel}>Low Stock Alert</label>
            <input
              value={form.lowStockAlert}
              onChange={(e) => setForm((f) => ({ ...f, lowStockAlert: e.target.value }))}
              className={styles.control}
            />
          </div>
        </div>

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={form.continueSelling}
            onChange={(e) => setForm((f) => ({ ...f, continueSelling: e.target.checked }))}
          />
          Continue selling when out of stock
        </label>

        {form.productType === "physical" ? (
          <div className={styles.fieldGrid4}>
            <div>
              <label className={styles.fieldLabel}>Weight (kg)*</label>
              <input
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                placeholder="0.2 or 200g"
                inputMode="decimal"
                className={styles.control}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Length (cm)*</label>
              <input
                value={form.lengthCm}
                onChange={(e) => setForm((f) => ({ ...f, lengthCm: e.target.value }))}
                placeholder="15"
                inputMode="decimal"
                className={styles.control}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Width (cm)*</label>
              <input
                value={form.widthCm}
                onChange={(e) => setForm((f) => ({ ...f, widthCm: e.target.value }))}
                placeholder="20"
                inputMode="decimal"
                className={styles.control}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Height (cm)*</label>
              <input
                value={form.heightCm}
                onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))}
                placeholder="20"
                inputMode="decimal"
                className={styles.control}
              />
            </div>
          </div>
        ) : null}

        <label className={styles.fieldLabel}>Tags (comma-separated, max 10)</label>
        <input
          value={form.tags}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          className={styles.control}
        />

        <h3 className={styles.cardTitle}>Collections</h3>
        <div className={styles.chipList}>
          {collections.map((c) => {
            const checked = selectedCollections.includes(c.id);
            return (
              <label key={c.id} className={`${styles.chip} ${checked ? styles.chipOn : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelectedCollections((prev) =>
                      checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                    )
                  }
                />
                {c.name}
              </label>
            );
          })}
        </div>
        <div className={styles.buttonRow}>
          <input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="New collection name"
            className={styles.control}
          />
          <Button variant="outline" onClick={() => void createCollection()}>
            Add
          </Button>
        </div>

        <label className={styles.fieldLabel}>Image URL (optional)</label>
        <input
          value={form.imageUrl}
          onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          className={styles.control}
        />
        <label className={styles.fieldLabel}>Upload images via Cloudinary (max 8)</label>
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

        <div className={styles.choiceRow}>
          <label className={styles.choice}>
            <input
              type="radio"
              checked={form.status === "active"}
              onChange={() => setForm((f) => ({ ...f, status: "active" }))}
            />{" "}
            Active
          </label>
          <label className={styles.choice}>
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
