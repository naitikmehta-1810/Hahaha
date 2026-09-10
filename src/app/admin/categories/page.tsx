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
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
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
    setEditingId(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      name,
      slug: slug.trim() || undefined,
      parentId: parentId || null,
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
    if (!window.confirm("Soft-delete this category?")) return;
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
            Create, edit, and soft-delete categories
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
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(c.id);
                        setName(c.name);
                        setSlug(c.slug);
                        setParentId(c.parent_id ?? "");
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
