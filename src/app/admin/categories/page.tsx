"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import { apiRequest } from "@/utils/api-client";
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
    resetForm();
    await load();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this category? It will be hidden from the shop. Products already in it stay put.")) return;
    const result = await apiRequest("DELETE", `/api/admin/categories/${id}`);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Categories</Heading>
          <Text size="sm" color="muted">
            Create, edit, and delete categories. Leave GST blank to charge 18% at checkout.
          </Text>
        </div>
      </div>

      <form className={styles.formRow} onSubmit={(e) => void onSubmit(e)}>
        <label className={styles.field}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={styles.field}>
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label className={styles.field}>
          Parent
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None</option>
            {categories
              .filter((c) => c.id !== editingId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className={styles.field}>
          GST %
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
        <Button type="submit" size="sm" variant="primary" disabled={saving}>
          {editingId ? "Update" : "Create"}
        </Button>
        {editingId ? (
          <Button type="button" size="sm" variant="outline" onClick={resetForm}>
            Cancel
          </Button>
        ) : null}
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? (
        <Text color="muted">Loading…</Text>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Parent</th>
                <th>GST</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.slug}</td>
                  <td>
                    {categories.find((p) => p.id === c.parent_id)?.name ?? "—"}
                  </td>
                  <td>{c.gst_rate == null || c.gst_rate === "" ? "18% default" : `${c.gst_rate}%`}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(c.id);
                        setName(c.name);
                        setSlug(c.slug);
                        setParentId(c.parent_id ?? "");
                        setGstRate(c.gst_rate == null ? "" : String(c.gst_rate));
                      }}
                    >
                      Edit
                    </Button>{" "}
                    <Button size="sm" variant="outline" onClick={() => void onDelete(c.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.muted}>
                    No categories yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
