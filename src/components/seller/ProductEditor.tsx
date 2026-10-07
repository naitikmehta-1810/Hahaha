"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Lightbulb, Star, X } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { fetchCategories, type CategoryNode } from "@/utils/catalog";
import { parseOptionalNumber, validatePhysicalShippingFields } from "@/utils/productForm";
import { fetchMySeller } from "@/utils/seller";
import ui from "@/components/console/console.module.css";
import styles from "@/app/seller/seller.module.css";
import { optimizedImage } from "@/utils/media";
import {
  DigitalFilesField,
  VideoField,
  digitalFilesPayload,
  existingFileEntries,
  videoPayload,
  type DigitalFileEntry,
  type VideoState,
} from "./ProductMediaFields";

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
  useVolumetric?: boolean;
  isReturnable?: boolean;
  status: "active" | "draft" | string;
  tags: string[];
  imageUrls: string[];
  collectionIds: string[];
  isCustomizable: boolean;
  customizationLabel: string | null;
  processingDays?: number;
  processingDaysMax?: number | null;
  video?: { url: string; posterUrl: string } | null;
  digitalFiles?: Array<{ id: string; fileName: string; bytes: number }>;
};

const MAX_IMAGES = 8;
/** Mirrors the API's product schema limits. */
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;

/** Comma- or newline-separated tags, trimmed and de-duplicated (case-insensitive). */
function parseTags(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter((t) => {
      const key = t.toLowerCase();
      if (!t || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const EMPTY_FORM = {
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
  useVolumetric: false,
  isReturnable: true,
  processingDays: "2",
  processingDaysMax: "3",
  isCustomizable: false,
  customizationLabel: "",
  tags: "",
  imageUrl: "",
  imageUrls: [] as string[],
};

type FormState = typeof EMPTY_FORM;

async function uploadFile(file: File) {
  // Base64 inflates ~33%; keep under the API's 12mb JSON body limit.
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      `"${file.name}" is too large (${Math.round(file.size / 1024 / 1024)}MB). Use an image under 8MB.`
    );
  }
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
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
}

/** Add / edit product form shared by /seller/products/new and /seller/products/[id]/edit. */
export default function ProductEditor({ productId }: { productId?: string }) {
  const isEdit = Boolean(productId);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, status: authStatus } = useAuth();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shopWarning, setShopWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [video, setVideo] = useState<VideoState>({ kind: "none" });
  const [hadVideo, setHadVideo] = useState(false);
  const [files, setFiles] = useState<DigitalFileEntry[]>([]);
  const [videoBusy, setVideoBusy] = useState(false);
  const [filesBusy, setFilesBusy] = useState(false);
  const mediaBusy = videoBusy || filesBusy;
  const isDigital = form.productType === "digital";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (authStatus === "loading") return;
    const here = isEdit ? `/seller/products/${productId}/edit` : "/seller/products/new";
    if (!isAuthenticated) {
      redirectToLogin(here);
      return;
    }
    void (async () => {
      const seller = await fetchMySeller();
      if (!seller) {
        router.push("/sell");
        return;
      }
      if (seller.status !== "active") {
        setShopWarning(
          "Your shop isn’t active yet. You can prepare listings now; publishing opens once an admin approves the shop."
        );
      }
      const [tree, collectionResult] = await Promise.all([
        fetchCategories(),
        apiRequest<{ collections: Collection[] }>("GET", "/api/seller/collections"),
      ]);
      setCategories(tree);
      if (collectionResult.data?.collections) setCollections(collectionResult.data.collections);
      if (!productId) return;

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
      setCurrentStatus(p.status);
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
        useVolumetric: Boolean(p.useVolumetric),
        isReturnable: p.isReturnable !== false,
        processingDays: String(p.processingDays ?? 2),
        processingDaysMax: String(p.processingDaysMax ?? (p.processingDays ?? 2) + 1),
        isCustomizable: Boolean(p.isCustomizable),
        customizationLabel: p.customizationLabel ?? "",
        tags: (p.tags ?? []).join(", "),
        imageUrl: "",
        imageUrls: p.imageUrls ?? [],
      });
      setSelectedCollections(p.collectionIds ?? []);
      setVideo(p.video ? { kind: "existing", url: p.video.url, posterUrl: p.video.posterUrl } : { kind: "none" });
      setHadVideo(Boolean(p.video));
      setFiles(existingFileEntries(p.digitalFiles));
      setLoading(false);
    })();
  }, [authStatus, isAuthenticated, isEdit, productId, router]);

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

  const addFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of images.slice(0, MAX_IMAGES - form.imageUrls.length)) {
        uploaded.push(await uploadFile(file));
      }
      setForm((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, ...uploaded].slice(0, MAX_IMAGES),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const makeThumbnail = (index: number) =>
    setForm((current) => {
      const next = [...current.imageUrls];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return { ...current, imageUrls: next };
    });

  const removeImage = (url: string) =>
    setForm((current) => ({
      ...current,
      imageUrls: current.imageUrls.filter((item) => item !== url),
    }));

  const submit = async (status: "draft" | "active") => {
    setError(null);
    if (!form.title.trim()) {
      setError("Add a product title.");
      return;
    }
    if (!form.shortDescription.trim()) {
      setError("Add a short description.");
      return;
    }
    if (!form.categoryId) {
      setError("Choose a category.");
      return;
    }
    if (!(Number(form.price) > 0)) {
      setError("Enter a price greater than ₹0.");
      return;
    }
    const compareAt = parseOptionalNumber(form.compareAtPrice);
    if (compareAt != null && compareAt <= Number(form.price)) {
      setError("Compare-at price is the original price, so it must be higher than the price. Leave it blank if there's no discount.");
      return;
    }
    const tags = parseTags(form.tags);
    if (tags.length > MAX_TAGS) {
      setError(`Add up to ${MAX_TAGS} tags. Separate tags with commas.`);
      return;
    }
    const longTag = tags.find((t) => t.length > MAX_TAG_LENGTH);
    if (longTag) {
      setError(
        `Each tag can be at most ${MAX_TAG_LENGTH} characters. Separate tags with commas, e.g. "wall art, canvas, gold foil".`
      );
      return;
    }
    const shipMin = Number(form.processingDays);
    const shipMax = Number(form.processingDaysMax);
    if (!isDigital && (!Number.isInteger(shipMin) || shipMin < 0 || shipMin > 60)) {
      setError("Earliest shipping day must be a whole number from 0 to 60.");
      return;
    }
    if (!isDigital && (!Number.isInteger(shipMax) || shipMax < shipMin || shipMax > 90)) {
      setError("Latest shipping day must be a whole number, no earlier than the earliest.");
      return;
    }
    if (mediaBusy) {
      setError("Wait for uploads to finish before saving.");
      return;
    }
    if (isDigital) {
      if (files.some((entry) => entry.kind === "failed")) {
        setError("Some files didn't upload. Retry or remove them before saving.");
        return;
      }
      if (status === "active" && digitalFilesPayload(files).length === 0) {
        setError("Add at least one file buyers will download before publishing.");
        return;
      }
    }
    setBusy(true);

    let weight: number | null = null;
    // Left undefined (omitted from the request) unless volumetric shipping is on.
    let lengthCm: number | undefined;
    let widthCm: number | undefined;
    let heightCm: number | undefined;
    const useVolumetric = form.productType === "physical" && form.useVolumetric;
    if (form.productType === "physical") {
      const dims = validatePhysicalShippingFields(form);
      if (!dims.ok) {
        setError(dims.message);
        setBusy(false);
        return;
      }
      weight = dims.weight;
      lengthCm = dims.lengthCm ?? undefined;
      widthCm = dims.widthCm ?? undefined;
      heightCm = dims.heightCm ?? undefined;
    }

    const urls = [...form.imageUrls];
    if (form.imageUrl.trim()) urls.unshift(form.imageUrl.trim());
    const imageUrls = [...new Set(urls)].slice(0, MAX_IMAGES);
    const body = {
      title: form.title.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim() || null,
      processingDays: Number(form.processingDays),
      processingDaysMax: Number(form.processingDaysMax),
      categoryId: form.categoryId,
      subcategoryId: form.subcategoryId || null,
      productType: form.productType,
      price: Number(form.price),
      compareAtPrice: compareAt,
      costPrice: parseOptionalNumber(form.costPrice),
      sku: form.sku.trim() || null,
      stockQuantity: Number(form.stockQuantity) || 0,
      lowStockAlert: Number(form.lowStockAlert) || 5,
      continueSellingWhenOutOfStock: form.continueSelling,
      weight,
      lengthCm,
      widthCm,
      heightCm,
      useVolumetric,
      // Downloads are never returnable; the API enforces this too.
      isReturnable: isDigital ? false : form.isReturnable,
      status,
      isCustomizable: form.isCustomizable,
      customizationLabel: form.isCustomizable ? form.customizationLabel.trim() || null : null,
      tags,
      imageUrls,
      collectionIds: selectedCollections,
      video: videoPayload(video, hadVideo),
      digitalFiles: isDigital ? digitalFilesPayload(files) : undefined,
    };

    const result = await apiRequest<{ product: { id: string; slug?: string } }>(
      isEdit ? "PATCH" : "POST",
      isEdit ? `/api/seller/products/${productId}` : "/api/seller/products",
      { body }
    );
    setBusy(false);
    if (result.error || !result.data?.product) {
      setError(result.error ?? "Could not save product.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const slug = result.data.product.slug;
    router.push(isEdit || !slug ? "/seller/products" : `/products/${slug}`);
  };

  if (loading) {
    return <p className={ui.muted}>Loading product…</p>;
  }

  const imageCount = form.imageUrls.length;

  return (
    <>
      <PageHeader
        back={{ href: "/seller/products", label: "Products" }}
        title={
          isEdit ? (
            <span className={styles.titleWithPill}>
              Edit product
              {currentStatus ? <StatusPill status={currentStatus} /> : null}
            </span>
          ) : (
            "Add a new product"
          )
        }
        description={
          isEdit
            ? "Update details, stock, images and collections."
            : "Fill in the details below. Drafts stay private until you publish."
        }
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy || uploading || mediaBusy}
              onClick={() => void submit("draft")}
            >
              Save as draft
            </Button>
            <Button
              variant="primary"
              disabled={busy || uploading || mediaBusy}
              onClick={() => void submit("active")}
            >
              {busy ? "Saving…" : mediaBusy ? "Uploading…" : isEdit ? "Save & publish" : "Publish product"}
            </Button>
          </>
        }
      />

      {shopWarning ? <Notice tone="warning">{shopWarning}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className={styles.productColumns}>
        <div className={ui.stack}>
          <section className={ui.card}>
            <h2 className={styles.sectionTitle}>Product information</h2>
            <div className={ui.stack}>
              <div className={ui.field}>
                <div className={styles.labelRow}>
                  <label htmlFor="product-title" className={ui.fieldLabel}>
                    Title <span className={styles.req}>*</span>
                  </label>
                  <span className={ui.fieldHint}>{form.title.length}/150</span>
                </div>
                <input
                  id="product-title"
                  value={form.title}
                  maxLength={150}
                  placeholder="e.g. Hand-poured lavender soy candle"
                  onChange={(e) => update("title", e.target.value)}
                />
              </div>
              <div className={ui.field}>
                <div className={styles.labelRow}>
                  <label htmlFor="product-short" className={ui.fieldLabel}>
                    Short description <span className={styles.req}>*</span>
                  </label>
                  <span className={ui.fieldHint}>{form.shortDescription.length}/250</span>
                </div>
                <textarea
                  id="product-short"
                  value={form.shortDescription}
                  maxLength={250}
                  rows={2}
                  placeholder="One or two lines buyers see first."
                  onChange={(e) => update("shortDescription", e.target.value)}
                />
              </div>
              <div className={ui.field}>
                <label htmlFor="product-description">
                  Full description <span className={ui.fieldHint}>(optional)</span>
                </label>
                <textarea
                  id="product-description"
                  value={form.description}
                  rows={6}
                  placeholder="Materials, size, care instructions, what makes it special…"
                  onChange={(e) => update("description", e.target.value)}
                />
                <span className={ui.fieldHint}>Leave blank to use the short description.</span>
              </div>
              <div className={ui.formGrid3}>
                <div className={ui.field}>
                  <label htmlFor="product-category">
                    Category <span className={styles.req}>*</span>
                  </label>
                  <select
                    id="product-category"
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryId: e.target.value, subcategoryId: "" }))
                    }
                  >
                    <option value="">Select a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={ui.field}>
                  <label htmlFor="product-subcategory">Subcategory</label>
                  <select
                    id="product-subcategory"
                    value={form.subcategoryId}
                    disabled={subcats.length === 0}
                    onChange={(e) => update("subcategoryId", e.target.value)}
                  >
                    <option value="">{subcats.length ? "Select" : "None"}</option>
                    {subcats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className={ui.field}>
                  <legend className={ui.fieldLabel}>
                    Product type <span className={styles.req}>*</span>
                  </legend>
                  <div className={styles.segmented}>
                    {(["physical", "digital"] as const).map((type) => (
                      <label
                        key={type}
                        className={`${styles.segment} ${form.productType === type ? styles.segmentOn : ""}`}
                      >
                        <input
                          type="radio"
                          name="product-type"
                          checked={form.productType === type}
                          onChange={() => update("productType", type)}
                        />
                        {type === "physical" ? "Physical" : "Digital"}
                      </label>
                    ))}
                  </div>
                  {isDigital ? (
                    <span className={ui.fieldHint}>
                      Buyers download files you upload below. No shipping, and online payment only.
                    </span>
                  ) : null}
                </fieldset>
              </div>
            </div>
          </section>

          <section className={ui.card}>
            <h2 className={styles.sectionTitle}>Pricing &amp; inventory</h2>
            <div className={ui.stack}>
              <div className={ui.formGrid3}>
                <div className={ui.field}>
                  <label htmlFor="product-price">
                    Price before GST (₹) <span className={styles.req}>*</span>
                  </label>
                  <input
                    id="product-price"
                    inputMode="decimal"
                    value={form.price}
                    placeholder="0"
                    onChange={(e) => update("price", e.target.value)}
                  />
                  <span className={ui.fieldHint}>
                    Buyers see the price with the category&apos;s GST added (18% unless the category sets another rate).
                  </span>
                </div>
                <div className={ui.field}>
                  <label htmlFor="product-compare">Compare-at price (₹)</label>
                  <input
                    id="product-compare"
                    inputMode="decimal"
                    value={form.compareAtPrice}
                    placeholder="Original price, optional"
                    onChange={(e) => update("compareAtPrice", e.target.value)}
                  />
                </div>
                <div className={ui.field}>
                  <label htmlFor="product-cost">Cost price (₹)</label>
                  <input
                    id="product-cost"
                    inputMode="decimal"
                    value={form.costPrice}
                    placeholder="Only you see this"
                    onChange={(e) => update("costPrice", e.target.value)}
                  />
                </div>
                <div className={ui.field}>
                  <label htmlFor="product-sku">SKU</label>
                  <input id="product-sku" value={form.sku} onChange={(e) => update("sku", e.target.value)} />
                </div>
                {isDigital ? null : (
                  <>
                <div className={ui.field}>
                  <label htmlFor="product-stock">
                    Stock quantity <span className={styles.req}>*</span>
                  </label>
                  <input
                    id="product-stock"
                    inputMode="numeric"
                    value={form.stockQuantity}
                    onChange={(e) => update("stockQuantity", e.target.value)}
                  />
                </div>
                <div className={ui.field}>
                  <label htmlFor="product-low">Low stock alert</label>
                  <input
                    id="product-low"
                    inputMode="numeric"
                    value={form.lowStockAlert}
                    onChange={(e) => update("lowStockAlert", e.target.value)}
                  />
                </div>
                  </>
                )}
              </div>
              {isDigital ? (
                <span className={ui.fieldHint}>Digital products never run out of stock.</span>
              ) : (
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={form.continueSelling}
                    onChange={(e) => update("continueSelling", e.target.checked)}
                  />
                  Keep selling when out of stock
                </label>
              )}
            </div>
          </section>

          {isDigital ? (
            <DigitalFilesField value={files} onChange={setFiles} onBusyChange={setFilesBusy} />
          ) : null}

          {form.productType === "physical" ? (
            <section className={ui.card}>
              <h2 className={styles.sectionTitle}>Shipping details</h2>
              <p className={styles.sectionHint}>
                Couriers bill by the packed parcel&apos;s weight. Weigh the product with its packaging.
              </p>
              <div className={styles.weightRow}>
                <div className={ui.field}>
                  <label htmlFor="product-weight">
                    Weight (kg) <span className={styles.req}>*</span>
                  </label>
                  <input
                    id="product-weight"
                    value={form.weight}
                    placeholder="0.2 or 200g"
                    inputMode="decimal"
                    onChange={(e) => update("weight", e.target.value)}
                  />
                </div>
              </div>

              <label className={`${styles.checkLabel} ${styles.volumetricToggle}`}>
                <input
                  type="checkbox"
                  checked={form.useVolumetric}
                  onChange={(e) => update("useVolumetric", e.target.checked)}
                />
                <span>
                  <strong>Bill this product by parcel size (volumetric)</strong>
                  <small>
                    Leave this off for most products. Turn it on only for bulky, light items such as
                    cushions or large frames, then enter the packed box size below.
                  </small>
                </span>
              </label>

              {form.useVolumetric ? (
                <div className={styles.dimsGrid}>
                  {(
                    [
                      ["lengthCm", "Length (cm)", "15"],
                      ["widthCm", "Width (cm)", "20"],
                      ["heightCm", "Height (cm)", "20"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <div key={key} className={ui.field}>
                      <label htmlFor={`product-${key}`}>
                        {label} <span className={styles.req}>*</span>
                      </label>
                      <input
                        id={`product-${key}`}
                        value={form[key]}
                        placeholder={placeholder}
                        inputMode="decimal"
                        onChange={(e) => update(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {isDigital ? null : (
          <section className={ui.card}>
            <h2 className={styles.sectionTitle}>Dispatch time</h2>
            <p className={styles.sectionHint}>
              Shown to buyers as “Ships in X–Y days”. Use the same number twice for an exact day.
            </p>
            <div className={ui.formGrid2}>
              <div className={ui.field}>
                <label htmlFor="product-ship-min">Earliest (days)</label>
                <input
                  id="product-ship-min"
                  type="number"
                  min={0}
                  max={60}
                  inputMode="numeric"
                  value={form.processingDays}
                  onChange={(e) => update("processingDays", e.target.value)}
                />
              </div>
              <div className={ui.field}>
                <label htmlFor="product-ship-max">Latest (days)</label>
                <input
                  id="product-ship-max"
                  type="number"
                  min={0}
                  max={90}
                  inputMode="numeric"
                  value={form.processingDaysMax}
                  onChange={(e) => update("processingDaysMax", e.target.value)}
                />
              </div>
            </div>
          </section>
          )}
        </div>

        <div className={ui.stack}>
          <section className={ui.card}>
            <div className={styles.labelRow}>
              <h2 className={styles.sectionTitle}>
                Images <span className={styles.req}>*</span>
              </h2>
              <span className={ui.fieldHint}>
                {imageCount}/{MAX_IMAGES}
              </span>
            </div>
            <p className={styles.sectionHint}>The first image is the thumbnail buyers see in search.</p>
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <ImagePlus size={24} aria-hidden="true" />
              <p>{uploading ? "Uploading…" : "Drag & drop images here"}</p>
              <span>PNG or JPG, up to 8MB each</span>
              <Button
                variant="outline"
                size="sm"
                disabled={uploading || imageCount >= MAX_IMAGES}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose images
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={uploading}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void addFiles(files);
                }}
              />
            </div>
            {imageCount > 0 ? (
              <ul className={styles.imageGrid}>
                {form.imageUrls.map((url, index) => (
                  <li key={url} className={styles.imageThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={optimizedImage(url, 300)} alt={`Product image ${index + 1}`} />
                    {index === 0 ? <span className={styles.coverTag}>Cover</span> : null}
                    <div className={styles.imageTools}>
                      {index > 0 ? (
                        <button
                          type="button"
                          aria-label={`Use image ${index + 1} as the cover`}
                          title="Use as cover"
                          onClick={() => makeThumbnail(index)}
                        >
                          <Star size={13} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove image ${index + 1}`}
                        title="Remove"
                        onClick={() => removeImage(url)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={`${ui.field} ${styles.fieldGap}`}>
              <label htmlFor="product-image-url">Or paste an image URL</label>
              <input
                id="product-image-url"
                value={form.imageUrl}
                placeholder="https://…"
                onChange={(e) => update("imageUrl", e.target.value)}
              />
            </div>
          </section>

          <VideoField value={video} onChange={setVideo} onBusyChange={setVideoBusy} />

          <section className={ui.card}>
            <h2 className={styles.sectionTitle}>Customization</h2>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={form.isCustomizable}
                onChange={(e) => update("isCustomizable", e.target.checked)}
              />
              Buyers can request a customization
            </label>
            {form.isCustomizable ? (
              <div className={`${ui.field} ${styles.fieldGap}`}>
                <label htmlFor="product-custom-label">Prompt shown to buyers</label>
                <input
                  id="product-custom-label"
                  value={form.customizationLabel}
                  maxLength={120}
                  placeholder="e.g. Name to engrave, colour mix, or size note"
                  onChange={(e) => update("customizationLabel", e.target.value)}
                />
              </div>
            ) : (
              <p className={styles.hintBelow}>Leave this off for products that ship exactly as listed.</p>
            )}
          </section>

          {isDigital ? null : (
            <section className={ui.card}>
              <h2 className={styles.sectionTitle}>Returns</h2>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={!form.isReturnable}
                  onChange={(e) => update("isReturnable", !e.target.checked)}
                />
                No returns on this product
              </label>
              <p className={styles.hintBelow}>
                {form.isReturnable
                  ? "Buyers can request a return within 7 days of delivery. Turn this on for personalised, perishable or hygiene items."
                  : "Buyers see “No returns” on the product page and at checkout, and can't request a return for it."}
              </p>
            </section>
          )}

          <section className={ui.card}>
            <h2 className={styles.sectionTitle}>Organisation</h2>
            <div className={ui.stack}>
              <div className={ui.field}>
                <label htmlFor="product-tags">Tags</label>
                <input
                  id="product-tags"
                  value={form.tags}
                  placeholder="candle, soy, gift"
                  onChange={(e) => update("tags", e.target.value)}
                />
                <span className={ui.fieldHint}>
                  Separate with commas. Up to {MAX_TAGS} tags, {MAX_TAG_LENGTH} characters each
                  {form.tags.trim() ? ` · ${parseTags(form.tags).length}/${MAX_TAGS}` : ""}.
                </span>
              </div>
              <div className={ui.field}>
                <span className={ui.fieldLabel}>Collections</span>
                {collections.length > 0 ? (
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
                ) : (
                  <span className={ui.fieldHint}>No collections yet. Create one below.</span>
                )}
                <div className={styles.inlineAdd}>
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createCollection();
                      }
                    }}
                    placeholder="New collection name"
                    aria-label="New collection name"
                    className={ui.input}
                  />
                  <Button
                    variant="secondary"
                    disabled={!newCollectionName.trim()}
                    onClick={() => void createCollection()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.tipsCard}>
            <h2 className={styles.sectionTitle}>
              <Lightbulb size={16} aria-hidden="true" /> Tips for better visibility
            </h2>
            <ul>
              <li>Use bright, well-lit photos on a plain background.</li>
              <li>Write a clear, detailed description.</li>
              <li>Price competitively against similar items.</li>
              <li>Pick the most specific category.</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
