"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { apiRequest } from "@/utils/api-client";
import ui from "@/components/console/console.module.css";

type Setting = {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  integer: boolean;
  value: number;
  default: number;
  overridden: boolean;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (list: Setting[]) => {
    setSettings(list);
    setDrafts(Object.fromEntries(list.map((s) => [s.key, String(s.value)])));
  };

  const load = useCallback(async () => {
    const result = await apiRequest<{ settings: Setting[] }>("GET", "/api/admin/settings");
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load settings.");
      return;
    }
    setError(null);
    apply(result.data.settings);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(setting: Setting, value: number | null) {
    setBusyKey(setting.key);
    const result = await apiRequest<{ settings: Setting[] }>("PUT", `/api/admin/settings/${setting.key}`, {
      body: { value },
    });
    setBusyKey(null);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not save.");
      return;
    }
    setError(null);
    setNotice(value === null ? `${setting.label} reset to its default.` : `${setting.label} saved.`);
    apply(result.data.settings);
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform-wide values. Changes apply within about 30 seconds, no redeploy needed."
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className={ui.card}>
        {loading ? <p className={ui.cardSub}>Loading…</p> : null}
        {settings.map((setting) => {
          const draft = drafts[setting.key] ?? "";
          const parsed = draft.trim() === "" ? NaN : Number(draft);
          const dirty = parsed !== setting.value;
          return (
            <div key={setting.key} style={{ padding: "14px 0", borderBottom: "1px solid var(--border, #2a2a2a)" }}>
              <label htmlFor={setting.key} style={{ fontWeight: 600 }}>
                {setting.label}
              </label>
              <p className={ui.cardSub}>
                {setting.hint} Default: {setting.default}
                {setting.overridden ? " · currently overridden" : ""}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <input
                  id={setting.key}
                  type="number"
                  inputMode="decimal"
                  min={setting.min}
                  max={setting.max}
                  step={setting.integer ? 1 : "any"}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [setting.key]: e.target.value }))}
                  style={{ width: 160, padding: "8px 10px" }}
                />
                <Button
                  size="sm"
                  disabled={busyKey === setting.key || !dirty || Number.isNaN(parsed)}
                  onClick={() => void save(setting, parsed)}
                >
                  Save
                </Button>
                {setting.overridden ? (
                  <Button size="sm" variant="outline" disabled={busyKey === setting.key} onClick={() => void save(setting, null)}>
                    Reset to default
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
