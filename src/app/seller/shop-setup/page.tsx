"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import { fetchMySeller, updateMyShop, type SellerProfile } from "@/utils/seller";
import { shopHref } from "@/utils/catalog";
import { apiRequest } from "@/utils/api-client";
import styles from "../seller.module.css";

type TabKey =
  | "information"
  | "branding"
  | "policies"
  | "shipping"
  | "payment"
  | "seo"
  | "vacation";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "information", label: "Shop Information" },
  { key: "branding", label: "Branding" },
  { key: "policies", label: "Shop Policies" },
  { key: "shipping", label: "Shipping & Return" },
  { key: "payment", label: "Payment & Billing" },
  { key: "seo", label: "SEO & Discoverability" },
  { key: "vacation", label: "Vacation Mode" },
];

export default function ShopSetupPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [tab, setTab] = useState<TabKey>("information");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [form, setForm] = useState({
    shopName: "",
    tagline: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
    businessAddress: "",
    instagram: "",
    facebook: "",
    pinterest: "",
    logoUrl: "",
    bannerUrl: "",
    seoTitle: "",
    seoDescription: "",
    isVacationMode: false,
    policyReturns: "",
    policyShipping: "",
    policyPayment: "",
  });

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      redirectToLogin("/seller/shop-setup");
      return;
    }
    void fetchMySeller().then((profile) => {
      if (!profile) {
        router.push("/sell");
        return;
      }
      setSeller(profile);
      setForm({
        shopName: profile.shopName || "",
        tagline: profile.tagline || "",
        description: profile.description || "",
        contactEmail: profile.contactEmail || "",
        contactPhone: profile.contactPhone || "",
        businessAddress: profile.businessAddress || "",
        instagram: profile.socialLinks?.instagram || "",
        facebook: profile.socialLinks?.facebook || "",
        pinterest: profile.socialLinks?.pinterest || "",
        logoUrl: profile.logoUrl || "",
        bannerUrl: profile.bannerUrl || "",
        seoTitle: profile.seoTitle || "",
        seoDescription: profile.seoDescription || "",
        isVacationMode: Boolean(profile.isVacationMode),
        policyReturns: profile.shopPolicies?.returns || "",
        policyShipping: profile.shopPolicies?.shipping || "",
        policyPayment: profile.shopPolicies?.payment || "",
      });
    });
  }, [authStatus, isAuthenticated, router]);

  const uploadBranding = async (kind: "logo" | "banner", file: File) => {
    setUploading(kind);
    setMessage(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const result = await apiRequest<{ url: string }>("POST", "/api/seller/uploads", {
        body: {
          fileName: file.name,
          dataBase64,
          folder: "shops",
        },
      });
      if (result.error || !result.data?.url) {
        setMessage(result.error ?? "Upload failed");
        return;
      }
      setForm((f) =>
        kind === "logo"
          ? { ...f, logoUrl: result.data!.url }
          : { ...f, bannerUrl: result.data!.url }
      );
      setMessage(`${kind === "logo" ? "Logo" : "Banner"} uploaded.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const result = await updateMyShop({
      shopName: form.shopName.trim(),
      tagline: form.tagline.trim() || null,
      description: form.description.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      contactPhone: form.contactPhone.trim(),
      businessAddress: form.businessAddress.trim() || null,
      socialLinks: {
        instagram: form.instagram.trim(),
        facebook: form.facebook.trim(),
        pinterest: form.pinterest.trim(),
      },
      logoUrl: form.logoUrl.trim() || null,
      bannerUrl: form.bannerUrl.trim() || null,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      isVacationMode: form.isVacationMode,
      shopPolicies: {
        returns: form.policyReturns.trim(),
        shipping: form.policyShipping.trim(),
        payment: form.policyPayment.trim(),
      },
    });
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage("Saved.");
    const refreshed = await fetchMySeller();
    if (refreshed) setSeller(refreshed);
  };

  if (!seller) {
    return (
      <div className={styles.container}>
        <Text color="muted">Loading shop setup…</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/seller">Seller</Breadcrumbs.Item>
        <Breadcrumbs.Item active>Shop Setup</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.headerRow}>
        <div>
          <Heading level={2}>Shop Setup</Heading>
          <Text size="sm" color="muted">
            Set up your shop profile and preferences to start selling.
          </Text>
        </div>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {message ? <Text size="sm">{message}</Text> : null}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <nav className={styles.navList}>
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${styles.navItem} ${
                  tab === item.key ? styles.navItemActive : ""
                }`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className={styles.main}>
          {tab === "information" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Shop Information</h3>
              <label className={styles.muted}>
                Shop Name ({form.shopName.length}/50)
              </label>
              <input
                value={form.shopName}
                maxLength={50}
                onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>
                Shop Tagline ({form.tagline.length}/80)
              </label>
              <input
                value={form.tagline}
                maxLength={80}
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>
                Shop Description ({form.description.length}/500)
              </label>
              <textarea
                value={form.description}
                maxLength={500}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ ...inputStyle, minHeight: 120 }}
              />
              <h3 className={styles.cardTitle}>Shop Contact Information</h3>
              <label className={styles.muted}>Shop Email</label>
              <input
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>Phone Number</label>
              <input
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>Business Address</label>
              <textarea
                value={form.businessAddress}
                onChange={(e) =>
                  setForm((f) => ({ ...f, businessAddress: e.target.value }))
                }
                style={{ ...inputStyle, minHeight: 80 }}
              />
              <h3 className={styles.cardTitle}>Social Links</h3>
              <label className={styles.muted}>Instagram</label>
              <input
                value={form.instagram}
                onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>Facebook</label>
              <input
                value={form.facebook}
                onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>Pinterest</label>
              <input
                value={form.pinterest}
                onChange={(e) => setForm((f) => ({ ...f, pinterest: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ) : null}

          {tab === "branding" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Branding</h3>
              <p className={styles.muted}>
                Upload images to Cloudinary, or paste an existing image URL.
              </p>
              <label className={styles.muted}>Logo (512×512 recommended)</label>
              <input
                type="file"
                accept="image/*"
                disabled={uploading !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadBranding("logo", file);
                  e.target.value = "";
                }}
                style={{ marginBottom: 8 }}
              />
              <input
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="Logo URL"
                style={inputStyle}
              />
              <label className={styles.muted}>Banner</label>
              <input
                type="file"
                accept="image/*"
                disabled={uploading !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadBranding("banner", file);
                  e.target.value = "";
                }}
                style={{ marginBottom: 8 }}
              />
              <input
                value={form.bannerUrl}
                onChange={(e) => setForm((f) => ({ ...f, bannerUrl: e.target.value }))}
                placeholder="Banner URL"
                style={inputStyle}
              />
              {uploading ? (
                <p className={styles.muted}>Uploading {uploading}…</p>
              ) : null}
            </div>
          ) : null}

          {tab === "seo" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>SEO &amp; Discoverability</h3>
              <label className={styles.muted}>SEO Title</label>
              <input
                value={form.seoTitle}
                maxLength={70}
                onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                style={inputStyle}
              />
              <label className={styles.muted}>SEO Description</label>
              <textarea
                value={form.seoDescription}
                maxLength={160}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seoDescription: e.target.value }))
                }
                style={{ ...inputStyle, minHeight: 100 }}
              />
            </div>
          ) : null}

          {tab === "policies" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Shop Policies</h3>
              <p className={styles.muted}>
                Shown on your public shop Policies tab. Leave blank to fall back to
                Stuffsy defaults.
              </p>
              <label className={styles.muted}>Returns &amp; exchanges</label>
              <textarea
                value={form.policyReturns}
                maxLength={2000}
                onChange={(e) => setForm((f) => ({ ...f, policyReturns: e.target.value }))}
                style={{ ...inputStyle, minHeight: 100 }}
                placeholder="e.g. Easy returns within 7 days of delivery on unused items."
              />
            </div>
          ) : null}

          {tab === "shipping" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Shipping &amp; Return</h3>
              <label className={styles.muted}>Shipping policy</label>
              <textarea
                value={form.policyShipping}
                maxLength={2000}
                onChange={(e) =>
                  setForm((f) => ({ ...f, policyShipping: e.target.value }))
                }
                style={{ ...inputStyle, minHeight: 120 }}
                placeholder="Processing time, carriers, regions you ship to…"
              />
            </div>
          ) : null}

          {tab === "payment" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Payment &amp; Billing</h3>
              <label className={styles.muted}>Payment notes for buyers</label>
              <textarea
                value={form.policyPayment}
                maxLength={2000}
                onChange={(e) =>
                  setForm((f) => ({ ...f, policyPayment: e.target.value }))
                }
                style={{ ...inputStyle, minHeight: 120 }}
                placeholder="Accepted methods, invoice notes, GST info…"
              />
            </div>
          ) : null}

          {tab === "vacation" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Vacation Mode</h3>
              <p className={styles.muted}>
                When on, your shop stays visible with a vacation banner, products are
                hidden from browse, and cart lines from your shop become unavailable.
              </p>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 12,
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.isVacationMode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isVacationMode: e.target.checked }))
                  }
                />
                I&apos;m currently on vacation — pause new orders
              </label>
            </div>
          ) : null}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Shop Preview</h3>
            <p>
              <strong>{form.shopName || seller.shopName}</strong>
              {form.isVacationMode ? (
                <span className={styles.muted}> · On vacation</span>
              ) : null}
            </p>
            <p className={styles.muted}>{form.tagline || "Your tagline appears here."}</p>
            <Link href={shopHref(seller.shopSlug)}>
              <Button variant="outline">View Shop Preview</Button>
            </Link>
          </div>
        </main>
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
