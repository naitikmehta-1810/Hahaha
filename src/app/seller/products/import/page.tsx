"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Globe, Import, Loader2, RotateCcw, Upload } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { fetchCategories, type CategoryNode } from "@/utils/catalog";
import { rupees } from "@/utils/format";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_CSV_BYTES,
  importShopifyBatch,
  previewShopifyCsv,
  previewShopifyStore,
  type ImportOutcome,
  type ImportPreview,
  type ImportProduct,
} from "@/utils/shopifyImport";
import ui from "@/components/console/console.module.css";
import styles from "./import.module.css";

type Method = "url" | "csv";
type Phase = "source" | "review" | "importing" | "done";

const OUTCOME_TONE = { imported: "success", skipped: "neutral", failed: "danger" } as const;
const OUTCOME_LABEL = { imported: "Imported", skipped: "Already imported", failed: "Failed" } as const;

function canImport(product: ImportProduct, already: Set<string>) {
  return product.price > 0 && !already.has(product.externalId);
}

export default function ShopifyImportPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [method, setMethod] = useState<Method>("url");
  const [phase, setPhase] = useState<Phase>("source");
  const [storeUrl, setStoreUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [publish, setPublish] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const cancelled = useRef(false);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) redirectToLogin("/seller/products/import");
  }, [authStatus, isAuthenticated]);

  useEffect(() => {
    void fetchCategories().then(setCategories);
    return () => {
      cancelled.current = true;
    };
  }, []);

  const already = useMemo(() => new Set(preview?.alreadyImported ?? []), [preview]);
  const products = preview?.products ?? [];
  const importable = products.filter((p) => canImport(p, already));
  const chosen = importable.filter((p) => selected.has(p.externalId));

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_CSV_BYTES) {
      setError("That file is over 8 MB. Export fewer products and try again.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setFileName(file.name);
    };
    reader.onerror = () => setError("We couldn't read that file.");
    reader.readAsText(file);
  };

  const runPreview = async () => {
    setError(null);
    setBusy(true);
    const result =
      method === "url" ? await previewShopifyStore(storeUrl) : await previewShopifyCsv(csvText ?? "");
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? "We couldn't read that store.");
      return;
    }
    const data = result.data;
    const done = new Set(data.alreadyImported);
    setPreview(data);
    setSelected(new Set(data.products.filter((p) => canImport(p, done)).map((p) => p.externalId)));
    setPhase("review");
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = importable.length > 0 && chosen.length === importable.length;

  const runImport = async () => {
    if (!categoryId || chosen.length === 0) return;
    cancelled.current = false;
    setError(null);
    setOutcomes([]);
    setProgress({ done: 0, total: chosen.length });
    setPhase("importing");

    for (let i = 0; i < chosen.length; i += IMPORT_BATCH_SIZE) {
      if (cancelled.current) return;
      const batch = chosen.slice(i, i + IMPORT_BATCH_SIZE);
      const result = await importShopifyBatch({ categoryId, publish, products: batch });
      if (cancelled.current) return;
      if (result.error || !result.data) {
        const message = result.error ?? "This batch failed.";
        setOutcomes((current) => [
          ...current,
          ...batch.map<ImportOutcome>((p) => ({
            externalId: p.externalId,
            title: p.title,
            result: "failed",
            message,
            warnings: [],
          })),
        ]);
        setProgress((current) => ({ ...current, done: current.done + batch.length }));
        // Stop on problems that will repeat for every batch.
        if (/too many|seller account|not approved|sign in/i.test(message)) {
          setError(message);
          break;
        }
        continue;
      }
      const results = result.data.results;
      setOutcomes((current) => [...current, ...results]);
      setProgress((current) => ({ ...current, done: current.done + batch.length }));
    }
    setPhase("done");
  };

  const reset = () => {
    setPhase("source");
    setPreview(null);
    setSelected(new Set());
    setOutcomes([]);
    setError(null);
    setCsvText(null);
    setFileName(null);
  };

  const counts = {
    imported: outcomes.filter((o) => o.result === "imported").length,
    skipped: outcomes.filter((o) => o.result === "skipped").length,
    failed: outcomes.filter((o) => o.result === "failed").length,
    drafts: outcomes.filter((o) => o.result === "imported" && o.productStatus === "draft").length,
  };

  return (
    <div className={ui.stack}>
      <PageHeader
        back={{ href: "/seller/products", label: "Products" }}
        eyebrow="Catalog"
        title="Import from Shopify"
        description="Bring your listings over in a few steps. Imported products are saved for you to review."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {phase === "source" ? (
        <section className={`${ui.card} ${styles.sourceCard}`}>
          <div className={styles.methods} role="tablist" aria-label="Import method">
            <button
              type="button"
              role="tab"
              aria-selected={method === "url"}
              className={`${styles.method} ${method === "url" ? styles.methodActive : ""}`}
              onClick={() => setMethod("url")}
            >
              <Globe size={18} aria-hidden="true" />
              <span>
                <strong>Store link</strong>
                <small>Reads your public products</small>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === "csv"}
              className={`${styles.method} ${method === "csv" ? styles.methodActive : ""}`}
              onClick={() => setMethod("csv")}
            >
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>
                <strong>CSV export</strong>
                <small>Includes stock levels</small>
              </span>
            </button>
          </div>

          {method === "url" ? (
            <form
              className={styles.sourceForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (storeUrl.trim()) void runPreview();
              }}
            >
              <div className={ui.field}>
                <label htmlFor="store-url">Your Shopify store</label>
                <input
                  id="store-url"
                  value={storeUrl}
                  onChange={(event) => setStoreUrl(event.target.value)}
                  placeholder="yourstore.myshopify.com or yourstore.com"
                  autoComplete="url"
                  inputMode="url"
                />
                <span className={ui.fieldHint}>
                  Works for stores that are open to the public. Stock isn&apos;t shared this way, so
                  you&apos;ll set it after importing. Use a CSV export if you want stock levels included.
                </span>
              </div>
              <Button type="submit" disabled={busy || !storeUrl.trim()} leftIcon={busy ? <Loader2 size={16} className={styles.spin} /> : <Import size={16} />}>
                {busy ? "Reading store…" : "Find products"}
              </Button>
            </form>
          ) : (
            <div className={styles.sourceForm}>
              <ol className={styles.steps}>
                <li>In Shopify admin, open <strong>Products</strong> and click <strong>Export</strong>.</li>
                <li>Choose <strong>All products</strong> and <strong>CSV for Excel, Numbers, or other spreadsheet programs</strong>.</li>
                <li>Upload the file you receive by email or download.</li>
              </ol>
              <label className={styles.drop}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    onFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Upload size={20} aria-hidden="true" />
                <span>
                  <strong>{fileName ?? "Choose your products CSV"}</strong>
                  <small>{fileName ? "Choose a different file" : "Up to 8 MB"}</small>
                </span>
              </label>
              <Button
                disabled={busy || !csvText}
                onClick={() => void runPreview()}
                leftIcon={busy ? <Loader2 size={16} className={styles.spin} /> : <Import size={16} />}
              >
                {busy ? "Reading file…" : "Find products"}
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {phase === "review" && preview ? (
        <>
          <section className={`${ui.card} ${styles.optionsCard}`}>
            <div className={ui.formGrid2}>
              <div className={ui.field}>
                <label htmlFor="import-category">
                  Category for these products <span className={styles.req}>*</span>
                </label>
                <select
                  id="import-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <span className={ui.fieldHint}>You can change a product&apos;s category later.</span>
              </div>
              <label className={`${styles.check}`}>
                <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
                <span>
                  <strong>Publish products that are ready</strong>
                  <small>
                    Only products with a price, stock and a photo go live. Everything else is saved as a draft.
                  </small>
                </span>
              </label>
            </div>
            <Notice tone="info">
              Prices come over exactly as they appear in Shopify, so check they&apos;re in rupees. A product with
              several variants becomes one product at its lowest variant price.
            </Notice>
          </section>

          <section className={`${ui.card} ${ui.cardFlush}`}>
            <div className={ui.cardHead}>
              <div>
                <h2 className={ui.cardTitle}>
                  {products.length} product{products.length === 1 ? "" : "s"} found
                </h2>
                <p className={ui.cardSub}>
                  {chosen.length} selected
                  {already.size > 0 ? ` · ${already.size} already imported` : ""}
                  {preview.truncated ? " · showing the first 500" : ""}
                </p>
              </div>
              <div className={styles.headActions}>
                <Button variant="ghost" size="sm" onClick={reset} leftIcon={<RotateCcw size={14} />}>
                  Start over
                </Button>
              </div>
            </div>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th className={styles.checkCol}>
                      <input
                        type="checkbox"
                        aria-label="Select all products"
                        checked={allSelected}
                        disabled={importable.length === 0}
                        onChange={() =>
                          setSelected(allSelected ? new Set() : new Set(importable.map((p) => p.externalId)))
                        }
                      />
                    </th>
                    <th>Product</th>
                    <th className={ui.num}>Price</th>
                    <th className={ui.num}>Stock</th>
                    <th className={ui.num}>Photos</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const done = already.has(product.externalId);
                    const blocked = !canImport(product, already);
                    return (
                      <tr key={product.externalId} className={blocked ? styles.rowDisabled : undefined}>
                        <td className={styles.checkCol}>
                          <input
                            type="checkbox"
                            aria-label={`Import ${product.title}`}
                            checked={selected.has(product.externalId)}
                            disabled={blocked}
                            onChange={() => toggle(product.externalId)}
                          />
                        </td>
                        <td>
                          <div className={ui.cellMedia}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={optimizedImage(product.imageUrls[0] || FALLBACK_PRODUCT_IMAGE, 120)}
                              alt=""
                              className={ui.thumb}
                              loading="lazy"
                            />
                            <span>
                              <span className={ui.cellPrimary}>{product.title}</span>
                              {done ? (
                                <span className={ui.cellSub}>Already imported</span>
                              ) : product.price <= 0 ? (
                                <span className={`${ui.cellSub} ${styles.warn}`}>No price. Can&apos;t be imported.</span>
                              ) : product.warnings.length > 0 ? (
                                <span className={`${ui.cellSub} ${styles.warn}`}>{product.warnings[0]}</span>
                              ) : null}
                              {product.sourceStatus !== "active" ? (
                                <span className={ui.cellSub}>
                                  {product.sourceStatus === "draft" ? "Draft in Shopify" : "Archived in Shopify"}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className={`${ui.num} ${ui.cellPrimary}`}>
                          {product.price > 0 ? rupees(product.price) : "—"}
                        </td>
                        <td className={ui.num}>{product.stockQuantity == null ? "Set later" : product.stockQuantity}</td>
                        <td className={ui.num}>{product.imageUrls.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className={styles.stickyBar}>
            <p>
              {chosen.length === 0
                ? "Select at least one product."
                : !categoryId
                  ? "Choose a category to continue."
                  : `Ready to import ${chosen.length} product${chosen.length === 1 ? "" : "s"}.`}
            </p>
            <Button disabled={!categoryId || chosen.length === 0} onClick={() => void runImport()}>
              Import {chosen.length || ""} product{chosen.length === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      ) : null}

      {phase === "importing" || phase === "done" ? (
        <section className={`${ui.card} ${styles.progressCard}`}>
          <div className={styles.progressHead}>
            {phase === "importing" ? (
              <Loader2 size={22} className={styles.spin} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={22} className={styles.doneIcon} aria-hidden="true" />
            )}
            <div>
              <h2 className={ui.cardTitle}>
                {phase === "importing" ? "Importing your products…" : "Import finished"}
              </h2>
              <p className={ui.cardSub}>
                {phase === "importing"
                  ? `${progress.done} of ${progress.total} done. Keep this page open.`
                  : `${counts.imported} imported${counts.drafts ? ` (${counts.drafts} saved as drafts)` : ""}${
                      counts.skipped ? ` · ${counts.skipped} skipped` : ""
                    }${counts.failed ? ` · ${counts.failed} failed` : ""}`}
              </p>
            </div>
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>

          {outcomes.length > 0 ? (
            <ul className={styles.results}>
              {outcomes.map((outcome) => (
                <li key={outcome.externalId} className={styles.result}>
                  <div>
                    <strong>{outcome.title}</strong>
                    {outcome.message ? <small>{outcome.message}</small> : null}
                    {outcome.warnings.map((warning) => (
                      <small key={warning} className={styles.warn}>
                        {warning}
                      </small>
                    ))}
                  </div>
                  <div className={styles.resultSide}>
                    <StatusPill tone={OUTCOME_TONE[outcome.result]}>{OUTCOME_LABEL[outcome.result]}</StatusPill>
                    {outcome.productId ? (
                      <Link href={`/seller/products/${outcome.productId}/edit`} className={ui.linkInline}>
                        Review
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {phase === "done" ? (
            <div className={styles.doneActions}>
              <ButtonLink href="/seller/products">View products</ButtonLink>
              <Button variant="outline" onClick={reset}>
                Import more
              </Button>
              {counts.drafts > 0 ? (
                <small className={ui.fieldHint}>
                  Open each draft to add stock, check the category and publish it.
                </small>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
