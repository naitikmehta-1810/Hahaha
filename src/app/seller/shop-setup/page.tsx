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
import { pickupNicknameFromShop } from "@/utils/pickup";
import { FALLBACK_SHOP_LOGO } from "@/utils/media";
import { fetchMySeller, updateMyShop, type SellerProfile } from "@/utils/seller";
import { shopHref } from "@/utils/catalog";
import { apiRequest } from "@/utils/api-client";
import {
  CreditCard,
  FileText,
  Image as ImageIcon,
  Palmtree,
  Search,
  Store,
  Truck,
} from "lucide-react";
import styles from "../seller.module.css";

type TabKey =
  | "information"
  | "branding"
  | "policies"
  | "shipping"
  | "payment"
  | "seo"
  | "vacation";

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Store }> = [
  { key: "information", label: "Shop Information", Icon: Store },
  { key: "branding", label: "Branding", Icon: ImageIcon },
  { key: "policies", label: "Shop Policies", Icon: FileText },
  { key: "shipping", label: "Shipping & Return", Icon: Truck },
  { key: "payment", label: "Payment & Billing", Icon: CreditCard },
  { key: "seo", label: "SEO & Discoverability", Icon: Search },
  { key: "vacation", label: "Vacation Mode", Icon: Palmtree },
];

export default function ShopSetupPage() {
  const router = useRouter();
  const { isAuthenticated, status: authStatus } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [tab, setTab] = useState<TabKey>("information");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [gstNote, setGstNote] = useState<string | null>(null);
  const [gstVerified, setGstVerified] = useState<string | null>(null);
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
    pickupName: "",
    pickupEmail: "",
    pickupPhone: "",
    pickupAddress1: "",
    pickupAddress2: "",
    pickupCity: "",
    pickupState: "",
    pickupPincode: "",
    pickupLocationName: "",
    gstin: "",
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
        pickupName: profile.pickupAddress?.name || "",
        pickupPhone: profile.pickupAddress?.phone || profile.contactPhone || "",
        pickupAddress1: profile.pickupAddress?.address1 || "",
        pickupAddress2: profile.pickupAddress?.address2 || "",
        pickupCity: profile.pickupAddress?.city || "",
        pickupState: profile.pickupAddress?.state || "",
        pickupPincode: profile.pickupAddress?.pincode || "",
        pickupLocationName:
          profile.pickupAddress?.pickupLocationName || pickupNicknameFromShop(profile.shopName),
        pickupEmail: profile.pickupAddress?.email || profile.contactEmail || "",
        gstin: profile.gstin || "",
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

  useEffect(() => {
    const value = form.gstin.trim().toUpperCase();
    const alreadySaved =
      seller?.gstin &&
      seller.gstin.toUpperCase() === value &&
      seller.sellingScope === "pan_india";
    if (alreadySaved) {
      setGstVerified(value);
      setGstNote(null);
      return;
    }
    if (value.length !== 15) {
      setGstVerified(null);
      setGstNote(null);
      return;
    }
    let cancelled = false;
    setGstNote("Checking GSTIN…");
    setGstVerified(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await apiRequest<{ legalName: string; state: string }>(
          "POST",
          "/api/seller/gstin/verify",
          { body: { gstin: value }, skipRefresh: true }
        );
        if (cancelled) return;
        if (result.error || !result.data) {
          setGstVerified(null);
          setGstNote(result.error ?? "Could not verify this GSTIN.");
          return;
        }
        setGstVerified(value);
        setGstNote(`${result.data.legalName} · ${result.data.state}. This shop can sell across India after you save.`);
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.gstin, seller?.gstin, seller?.sellingScope]);

  const save = async () => {
    const typedGstin = form.gstin.trim().toUpperCase();
    const gstChanged = Boolean(typedGstin) && typedGstin !== (seller?.gstin ?? "").toUpperCase();
    if (gstChanged && gstVerified !== typedGstin) {
      setSaving(false);
      setMessage(gstNote && gstNote !== "Checking GSTIN…" ? gstNote : "Enter a GSTIN and wait until it is verified.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const pickupStarted = Boolean(
      form.pickupLocationName.trim() ||
        form.pickupName.trim() ||
        form.pickupEmail.trim() ||
        form.pickupPhone.trim() ||
        form.pickupAddress1.trim() ||
        form.pickupCity.trim() ||
        form.pickupState.trim() ||
        form.pickupPincode.trim()
    );
    const pickupPhone = form.pickupPhone.replace(/\D/g, "").slice(-10);
    const pickupComplete =
      form.pickupLocationName.trim().length >= 2 &&
      form.pickupName.trim().length >= 2 &&
      form.pickupEmail.includes("@") &&
      pickupPhone.length === 10 &&
      form.pickupAddress1.trim().length >= 5 &&
      form.pickupCity.trim().length >= 2 &&
      form.pickupState.trim().length >= 2 &&
      /^\d{6}$/.test(form.pickupPincode.trim());
    if (pickupStarted && !pickupComplete) {
      setSaving(false);
      setMessage(
        "Pickup address is incomplete. Required: nickname, contact name, email, 10-digit phone, address, city, state, and 6-digit pincode."
      );
      return;
    }
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
      ...(pickupComplete
        ? {
            pickupAddress: {
              pickupLocationName: form.pickupLocationName.trim(),
              name: form.pickupName.trim(),
              email: form.pickupEmail.trim(),
              phone: pickupPhone,
              address1: form.pickupAddress1.trim(),
              address2: form.pickupAddress2.trim() || null,
              city: form.pickupCity.trim(),
              state: form.pickupState.trim(),
              pincode: form.pickupPincode.trim(),
              country: "India",
            },
          }
        : {}),
      ...((!seller?.gstin || seller.sellingScope !== "pan_india") && form.gstin.trim()
        ? { gstin: form.gstin.trim() }
        : {}),
    });
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    const sync = (result.data as { pickupSync?: { synced?: boolean; alreadyExists?: boolean; pickupLocation?: string; mode?: string } } | null)
      ?.pickupSync;
    if (sync?.synced && sync.pickupLocation) {
      setMessage(
        sync.alreadyExists
          ? `Saved. Pickup “${sync.pickupLocation}” is already on Shiprocket.`
          : `Saved. Pickup “${sync.pickupLocation}” was created on Shiprocket.`
      );
    } else {
      setMessage("Saved.");
    }
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

  const previewPlace = [seller.sellingCity, seller.sellingState].filter(Boolean).join(", ");

  return (
    <div className={styles.setupPage}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/seller">Shop Settings</Breadcrumbs.Item>
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

      <div className={styles.setupBoard}>
        <nav className={styles.settingsNav} aria-label="Shop settings">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.settingsItem} ${tab === item.key ? styles.settingsItemActive : ""}`}
              aria-current={tab === item.key ? "true" : undefined}
              onClick={() => setTab(item.key)}
            >
              <item.Icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.setupMain}>
          {tab === "information" ? (
            <>
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Shop Information</h3>
                  <p className={styles.muted}>Basic information about your shop.</p>
                  <div className={styles.labelRow}>
                    <label className={styles.fieldLabel} htmlFor="shop-name">
                      Shop Name *
                    </label>
                    <span className={styles.counter}>{form.shopName.length}/50</span>
                  </div>
                  <input
                    id="shop-name"
                    value={form.shopName}
                    maxLength={50}
                    placeholder="Your shop name"
                    onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                    className={styles.control}
                  />
                  <div className={styles.labelRow}>
                    <label className={styles.fieldLabel} htmlFor="shop-tagline">
                      Shop Tagline
                    </label>
                    <span className={styles.counter}>{form.tagline.length}/80</span>
                  </div>
                  <input
                    id="shop-tagline"
                    value={form.tagline}
                    maxLength={80}
                    placeholder="A short line customers will remember"
                    onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                    className={styles.control}
                  />
                  <div className={styles.labelRow}>
                    <label className={styles.fieldLabel} htmlFor="shop-description">
                      Shop Description *
                    </label>
                    <span className={styles.counter}>{form.description.length}/500</span>
                  </div>
                  <textarea
                    id="shop-description"
                    value={form.description}
                    maxLength={500}
                    placeholder="What you make, and who it is for."
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className={`${styles.control} ${styles.controlTall}`}
                  />
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Shop Contact Information</h3>
                  <p className={styles.muted}>This information will be visible to your customers.</p>
                  <div className={styles.fieldGrid2}>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="shop-email">
                        Shop Email *
                      </label>
                      <input
                        id="shop-email"
                        type="email"
                        value={form.contactEmail}
                        placeholder="hello@yourshop.com"
                        onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                        className={styles.control}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="shop-phone">
                        Phone Number
                      </label>
                      <input
                        id="shop-phone"
                        value={form.contactPhone}
                        placeholder="+91"
                        onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                        className={styles.control}
                      />
                    </div>
                  </div>
                  <label className={styles.fieldLabel} htmlFor="shop-address">
                    Business Address *
                  </label>
                  <textarea
                    id="shop-address"
                    value={form.businessAddress}
                    placeholder="Street, city, state, PIN"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, businessAddress: e.target.value }))
                    }
                    className={`${styles.control} ${styles.controlShort}`}
                  />
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Social Links</h3>
                  <p className={styles.muted}>Add social media links to connect with your customers.</p>
                  <div className={styles.fieldGrid3}>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="shop-instagram">
                        Instagram
                      </label>
                      <input
                        id="shop-instagram"
                        value={form.instagram}
                        placeholder="@yourshop"
                        onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                        className={styles.control}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="shop-facebook">
                        Facebook
                      </label>
                      <input
                        id="shop-facebook"
                        value={form.facebook}
                        placeholder="/yourshop"
                        onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))}
                        className={styles.control}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel} htmlFor="shop-pinterest">
                        Pinterest
                      </label>
                      <input
                        id="shop-pinterest"
                        value={form.pinterest}
                        placeholder="/yourshop"
                        onChange={(e) => setForm((f) => ({ ...f, pinterest: e.target.value }))}
                        className={styles.control}
                      />
                    </div>
                  </div>
                </div>
            </>
          ) : null}

          {tab === "branding" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Branding</h3>
              <p className={styles.muted}>
                Upload images to Cloudinary, or paste an existing image URL.
              </p>
              <label className={styles.fieldLabel}>Logo (512×512 recommended)</label>
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
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Banner</label>
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
                className={styles.control}
              />
              {uploading ? (
                <p className={styles.muted}>Uploading {uploading}…</p>
              ) : null}
            </div>
          ) : null}

          {tab === "seo" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>SEO &amp; Discoverability</h3>
              <label className={styles.fieldLabel}>SEO Title</label>
              <input
                value={form.seoTitle}
                maxLength={70}
                onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>SEO Description</label>
              <textarea
                value={form.seoDescription}
                maxLength={160}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seoDescription: e.target.value }))
                }
                className={`${styles.control} ${styles.controlTall}`}
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
              <label className={styles.fieldLabel}>Returns &amp; exchanges</label>
              <textarea
                value={form.policyReturns}
                maxLength={2000}
                onChange={(e) => setForm((f) => ({ ...f, policyReturns: e.target.value }))}
                className={`${styles.control} ${styles.controlTall}`}
                placeholder="e.g. Easy returns within 7 days of delivery on unused items."
              />
            </div>
          ) : null}

          {tab === "shipping" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Where you can sell</h3>
              {seller?.sellingScope === "pan_india" && seller.gstin ? (
                <p className={styles.muted}>
                  GSTIN {seller.gstin} is verified. This shop can sell across India.
                </p>
              ) : (
                <>
                  <p className={styles.muted}>
                    {seller?.sellingScope === "pan_india"
                      ? "An admin allowed this shop to sell across India without a GSTIN. You can still add a GSTIN below."
                      : `Without a verified GSTIN, this shop can sell only in ${seller?.sellingState || "its home state"}. Add a GSTIN below and save to sell across India.`}
                  </p>
                  <label className={styles.fieldLabel}>GSTIN</label>
                  <input
                    value={form.gstin}
                    maxLength={15}
                    placeholder="15-character GSTIN"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))
                    }
                    className={styles.control}
                  />
                  {gstNote ? <p className={styles.muted}>{gstNote}</p> : null}
                </>
              )}
              <h3 className={styles.cardTitle}>Pickup address (courier)</h3>
              <p className={styles.muted}>
                These fields match Shiprocket’s pickup location. Saving registers this
                address on Shiprocket automatically — you don’t add it in their panel.
                The nickname must stay unique for this seller (letters, numbers, spaces).
              </p>
              <label className={styles.fieldLabel}>Pickup nickname*</label>
              <input
                value={form.pickupLocationName}
                maxLength={36}
                required
                placeholder="e.g. NaitikHome"
                onChange={(e) =>
                  setForm((f) => ({ ...f, pickupLocationName: e.target.value }))
                }
                className={styles.control}
              />
              <p className={styles.muted}>
                Starts as your shop name. This is the pickup name shown in Shiprocket.
              </p>
              <label className={styles.fieldLabel}>Contact name*</label>
              <input
                value={form.pickupName}
                required
                onChange={(e) => setForm((f) => ({ ...f, pickupName: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Email*</label>
              <input
                type="email"
                required
                value={form.pickupEmail}
                onChange={(e) => setForm((f) => ({ ...f, pickupEmail: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Phone* (10 digits)</label>
              <input
                value={form.pickupPhone}
                required
                inputMode="numeric"
                onChange={(e) => setForm((f) => ({ ...f, pickupPhone: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Address*</label>
              <input
                value={form.pickupAddress1}
                required
                onChange={(e) => setForm((f) => ({ ...f, pickupAddress1: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Address line 2</label>
              <input
                value={form.pickupAddress2}
                onChange={(e) => setForm((f) => ({ ...f, pickupAddress2: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>City*</label>
              <input
                value={form.pickupCity}
                required
                onChange={(e) => setForm((f) => ({ ...f, pickupCity: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>State* (full name, e.g. Gujarat)</label>
              <input
                value={form.pickupState}
                required
                onChange={(e) => setForm((f) => ({ ...f, pickupState: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Pincode* (6 digits)</label>
              <input
                value={form.pickupPincode}
                required
                maxLength={6}
                onChange={(e) => setForm((f) => ({ ...f, pickupPincode: e.target.value }))}
                className={styles.control}
              />
              <label className={styles.fieldLabel}>Country</label>
              <input value="India" readOnly className={styles.control} />

              <h3 className={`${styles.cardTitle} ${styles.cardTitleSpaced}`}>
                Shipping policy (buyer-facing)
              </h3>
              <textarea
                value={form.policyShipping}
                maxLength={2000}
                onChange={(e) =>
                  setForm((f) => ({ ...f, policyShipping: e.target.value }))
                }
                className={`${styles.control} ${styles.controlTall}`}
                placeholder="Processing time, carriers, regions you ship to…"
              />
            </div>
          ) : null}

          {tab === "payment" ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Payment &amp; Billing</h3>
              <label className={styles.fieldLabel}>Payment notes for buyers</label>
              <textarea
                value={form.policyPayment}
                maxLength={2000}
                onChange={(e) =>
                  setForm((f) => ({ ...f, policyPayment: e.target.value }))
                }
                className={`${styles.control} ${styles.controlTall}`}
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
              <label className={styles.checkLabel}>
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

        </div>

        <aside className={styles.setupSide}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Shop Preview</h3>
            <p className={styles.muted}>This is how your shop will appear to customers.</p>
            <div className={styles.previewStage}>
              {form.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.bannerUrl} alt="" className={styles.previewBanner} />
              ) : (
                <div className={styles.previewBanner} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logoUrl || FALLBACK_SHOP_LOGO}
                alt=""
                className={styles.previewLogo}
              />
            </div>
            <p className={styles.previewName}>
              <strong>{form.shopName || seller.shopName}</strong>
              {seller.badge ? <span className={styles.previewBadge}>{seller.badge}</span> : null}
            </p>
            <p className={styles.muted}>{form.tagline || "Your tagline appears here."}</p>
            {previewPlace || form.isVacationMode || seller.memberSince ? (
              <p className={styles.previewFacts}>
                {previewPlace ? <span>{previewPlace}</span> : null}
                {form.isVacationMode ? <span>On vacation</span> : null}
                {seller.memberSince ? <span>On Stuffsy since {seller.memberSince}</span> : null}
              </p>
            ) : null}
            <Link href={shopHref(seller.shopSlug)} className={styles.previewLink}>
              View Shop Preview
            </Link>
          </div>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Shop Logo</h3>
            <p className={styles.muted}>Upload a logo that represents your brand.</p>
            <div className={styles.logoRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logoUrl || FALLBACK_SHOP_LOGO} alt="" className={styles.logoPreview} />
              <div>
                <label className={styles.uploadLogoBtn}>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadBranding("logo", file);
                      e.target.value = "";
                    }}
                  />
                  {uploading === "logo" ? "Uploading…" : "Upload Logo"}
                </label>
                <p className={styles.muted}>Recommended size: 512×512px (JPG, PNG)</p>
              </div>
            </div>
          </div>
          <div className={styles.tips}>
            <h3 className={styles.cardTitle}>Tips for a great shop</h3>
            <ul>
              <li>Use a clear and memorable shop name.</li>
              <li>Upload a professional logo and banner.</li>
              <li>Write a description about what you make.</li>
              <li>Add social links so buyers can reach you.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
