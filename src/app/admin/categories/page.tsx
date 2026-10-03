"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import { apiRequest } from "@/utils/api-client";
import ui from "@/components/console/console.module.css";
import styles from "../admin.module.css";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  gst_rate: string | number | null;
};

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
        description="Organise the catalog. Leave GST blank to charge the default 18% at checkout."
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
                  <td colSpan={4} className={ui.emptyCell}>
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
