"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Lightbulb } from "lucide-react";
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
import styles from "../../seller.module.css";

type Collection = { id: string; name: string; slug: string };

export default function AddProductPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, status: authStatus } = useAuth();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    isCustomizable: false,
    customizationLabel: "",
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
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/seller/products/new");
      return;
    }
    void fetchMySeller().then((seller) => {
      if (!seller) router.push("/sell");
      else if (seller.status !== "active") {
        setError(
          "Shop must be active before publishing products. You can still save drafts after activation."
        );
      }
    });
    void fetchCategories().then(setCategories);
    void loadCollections();
  }, [authStatus, isAuthenticated, router]);

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
    // Base64 inflates ~33%; keep under the API's 12mb JSON body limit.
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

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of files.slice(0, 8 - form.imageUrls.length)) {
        uploaded.push(await uploadFile(file));
      }
      setForm((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, ...uploaded].slice(0, 8),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
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
    const result = await apiRequest<{ product: { id: string; slug: string } }>(
      "POST",
      "/api/seller/products",
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
          isCustomizable: form.isCustomizable,
          customizationLabel: form.isCustomizable ? form.customizationLabel.trim() || null : null,
          tags,
          imageUrls,
          collectionIds: selectedCollections,
        },
      }
    );
    setBusy(false);
    if (result.error || !result.data?.product) {
      setError(result.error ?? "Could not save product.");
      return;
    }
    router.push(`/products/${result.data.product.slug}`);
  };

  return (
    <div className={styles.productPage}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/seller">Products</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Add New Product</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Add New Product</Heading>
          <Text size="sm" color="muted">
            Fill in the details below to add a new product to your shop.
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
            Publish Product
          </Button>
        </div>
      </div>

      {error ? (
        <Text size="sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </Text>
      ) : null}

      <div className={styles.productColumns}>
        <div className={styles.productMain}>
          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Product Information</h2>
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel}>Product Title*</label>
              <span className={styles.charCount}>{form.title.length}/150</span>
            </div>
            <input
              value={form.title}
              maxLength={150}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={styles.control}
            />
            <div className={styles.labelRow}>
              <label className={styles.fieldLabel}>Short Description*</label>
              <span className={styles.charCount}>{form.shortDescription.length}/250</span>
            </div>
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
                <div className={styles.radioLine}>
                  {(["physical", "digital"] as const).map((type) => (
                    <label key={type} className={styles.choice}>
                      <input
                        type="radio"
                        checked={form.productType === type}
                        onChange={() => setForm((f) => ({ ...f, productType: type }))}
                      />
                      {type[0].toUpperCase() + type.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Pricing &amp; Inventory</h2>
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
          </section>

          {form.productType === "physical" ? (
            <section className={styles.sectionCard}>
              <h2 className={styles.sectionTitle}>Shipping Details</h2>
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
            </section>
          ) : null}
        </div>

        <div className={styles.productSide}>
          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Product Images*</h2>
            <p className={styles.sectionHint}>
              Add up to 8 images. First image will be your product thumbnail.
            </p>
            <div
              className={styles.dropZone}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <ImagePlus size={22} />
              <p>Drag &amp; drop images here</p>
              <span>or</span>
              <Button
                variant="outline"
                disabled={busy || form.imageUrls.length >= 8}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Images
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void addFiles(files);
                }}
              />
            </div>
            <p className={styles.sectionHint}>{form.imageUrls.length} / 8 images added</p>
            {form.imageUrls.length > 0 ? (
              <div className={styles.imageGrid}>
                {form.imageUrls.map((url) => (
                  <figure key={url} className={styles.imageThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          imageUrls: f.imageUrls.filter((item) => item !== url),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}
            <label className={styles.fieldLabel}>Image URL (optional)</label>
            <input
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              className={styles.control}
            />
          </section>

          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Customization</h2>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={form.isCustomizable}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isCustomizable: e.target.checked }))
                }
              />
              Buyers can request a customization
            </label>
            {form.isCustomizable ? (
              <>
                <label className={styles.fieldLabel}>Prompt shown to buyers</label>
                <input
                  value={form.customizationLabel}
                  maxLength={120}
                  placeholder="Example: Name to engrave, colour mix, or size note"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customizationLabel: e.target.value }))
                  }
                  className={styles.control}
                />
              </>
            ) : (
              <p style={{ margin: "8px 0 0", color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
                Leave this off for products that ship exactly as listed.
              </p>
            )}
          </section>

          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Product Status</h2>
            <label className={styles.statusOption}>
              <input
                type="radio"
                checked={form.status === "active"}
                onChange={() => setForm((f) => ({ ...f, status: "active" }))}
              />
              <span>
                <strong>Active</strong>
                <small>Visible to everyone</small>
              </span>
            </label>
            <label className={styles.statusOption}>
              <input
                type="radio"
                checked={form.status === "draft"}
                onChange={() => setForm((f) => ({ ...f, status: "draft" }))}
              />
              <span>
                <strong>Draft</strong>
                <small>Only visible to you</small>
              </span>
            </label>
          </section>

          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Product Tags</h2>
            <input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className={styles.control}
            />
            <p className={styles.sectionHint}>Comma-separated, max 10.</p>
          </section>

          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Collections</h2>
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
            <label className={styles.fieldLabel}>New collection name</label>
            <div className={styles.inlineAdd}>
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
          </section>

          <section className={styles.tipsCard}>
            <h2 className={styles.sectionTitle}>
              <Lightbulb size={16} /> Tips for better visibility
            </h2>
            <ul>
              <li>Use high quality images</li>
              <li>Write a clear and detailed description</li>
              <li>Set competitive pricing</li>
              <li>Choose the right category</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
