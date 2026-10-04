"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import { ImageIcon, Upload } from "lucide-react";
import { apiRequest } from "@/utils/api-client";
import { optimizedImage } from "@/utils/media";
import ui from "@/components/console/console.module.css";
import styles from "../admin.module.css";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  gst_rate: string | number | null;
  image_url: string | null;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageBusyId, setImageBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiRequest<{ categories: CategoryRow[] }>(
      "GET",
      "/api/admin/categories"
    );
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load categories.");
    } else {
      setError(null);
      setCategories(result.data.categories);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setName("");
    setSlug("");
    setParentId("");
    setGstRate("");
    setEditingId(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    const parsedGst = gstRate.trim() === "" ? null : Number(gstRate);
    if (parsedGst !== null && (!Number.isFinite(parsedGst) || parsedGst < 0 || parsedGst > 100)) {
      setSaving(false);
      setError("GST must be a percent from 0 to 100. Leave it blank to use 18%.");
      return;
    }
    const body: Record<string, unknown> = {
      name,
      slug: slug.trim() || undefined,
      parentId: parentId || null,
      gstRate: parsedGst,
    };
    const result = editingId
      ? await apiRequest("PATCH", `/api/admin/categories/${editingId}`, { body })
      : await apiRequest("POST", "/api/admin/categories", { body });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice(editingId ? `Category “${name}” updated.` : `Category “${name}” created.`);
    resetForm();
    await load();
  }

  async function onDelete(category: CategoryRow) {
    if (
      !window.confirm(
        `Delete “${category.name}”? It will be hidden from the shop. Products already in it stay put.`
      )
    ) {
      return;
    }
    const result = await apiRequest("DELETE", `/api/admin/categories/${category.id}`);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (editingId === category.id) resetForm();
    await load();
  }

  async function uploadImage(category: CategoryRow, file: File) {
    setNotice(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG, PNG or WebP).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 8 MB. Export a smaller version and try again.");
      return;
    }
    setImageBusyId(category.id);
    try {
      const dataBase64 = await readAsDataUrl(file);
      const result = await apiRequest<{ imageUrl: string }>(
        "PUT",
        `/api/admin/categories/${category.id}/image`,
        { body: { fileName: file.name, dataBase64 } }
      );
      if (result.error || !result.data) {
        setError(result.error ?? "Upload failed.");
        return;
      }
      const imageUrl = result.data.imageUrl;
      setCategories((rows) => rows.map((row) => (row.id === category.id ? { ...row, image_url: imageUrl } : row)));
      setError(null);
      setNotice(`Photo for “${category.name}” updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setImageBusyId(null);
    }
  }

  async function removeImage(category: CategoryRow) {
    setNotice(null);
    setImageBusyId(category.id);
    const result = await apiRequest("DELETE", `/api/admin/categories/${category.id}/image`);
    setImageBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCategories((rows) => rows.map((row) => (row.id === category.id ? { ...row, image_url: null } : row)));
    setError(null);
    setNotice(`Photo for “${category.name}” removed.`);
  }

  function startEdit(category: CategoryRow) {
    setEditingId(category.id);
    setName(category.name);
    setSlug(category.slug);
    setParentId(category.parent_id ?? "");
    setGstRate(category.gst_rate == null ? "" : String(category.gst_rate));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise the catalog and set the photos shown in the homepage “Shop by category” row. Leave GST blank to charge the default 18% at checkout."
      />

      <form className={ui.card} onSubmit={(e) => void onSubmit(e)}>
        <h2 className={styles.formTitle}>
          {editingId ? "Edit category" : "New category"}
          {editingId ? <span className={styles.editingTag}>Editing {name}</span> : null}
        </h2>
        <div className={ui.formGrid}>
          <label className={ui.field}>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={ui.field}>
            <span>Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Generated from the name"
            />
          </label>
          <label className={ui.field}>
            <span>Parent category</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">None (top level)</option>
              {categories
                .filter((c) => c.id !== editingId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className={ui.field}>
            <span>GST %</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={gstRate}
              placeholder="18"
              onChange={(e) => setGstRate(e.target.value)}
            />
          </label>
        </div>
        <div className={ui.formActions}>
          {editingId ? (
            <Button variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Create category"}
          </Button>
        </div>
      </form>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>All categories</h2>
            <p className={ui.cardSub}>{loading ? "Loading…" : `${categories.length} categories`}</p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Parent</th>
                <th>GST</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className={styles.catPhotoCell}>
                      <span className={styles.catPhoto}>
                        {c.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={optimizedImage(c.image_url, 120)} alt="" />
                        ) : (
                          <ImageIcon size={18} aria-hidden="true" />
                        )}
                      </span>
                      <label className={styles.catUpload}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={imageBusyId !== null}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void uploadImage(c, file);
                          }}
                        />
                        <Upload size={14} aria-hidden="true" />
                        {imageBusyId === c.id ? "Uploading…" : c.image_url ? "Replace" : "Upload"}
                      </label>
                      {c.image_url ? (
                        <button
                          type="button"
                          className={styles.catRemove}
                          disabled={imageBusyId !== null}
                          onClick={() => void removeImage(c)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <span className={ui.cellPrimary}>{c.name}</span>
                    <span className={ui.cellSub}>/{c.slug}</span>
                  </td>
                  <td>{(c.parent_id && nameById.get(c.parent_id)) ?? "—"}</td>
                  <td className={ui.nowrap}>
                    {c.gst_rate == null || c.gst_rate === "" ? (
                      <span className={ui.muted}>18% (default)</span>
                    ) : (
                      `${Number(c.gst_rate)}%`
                    )}
                  </td>
                  <td>
                    <div className={ui.rowActions}>
                      <Button size="sm" variant="secondary" onClick={() => startEdit(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void onDelete(c)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    No categories yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
