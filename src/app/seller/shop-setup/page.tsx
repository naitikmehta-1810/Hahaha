"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Upload } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice, { type NoticeTone } from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import { pickupNicknameFromShop } from "@/utils/pickup";
import { FALLBACK_SHOP_LOGO, optimizedImage } from "@/utils/media";
import { fetchMySeller, updateMyShop, type SellerProfile } from "@/utils/seller";
import { shopHref } from "@/utils/catalog";
import ui from "@/components/console/console.module.css";
import styles from "../seller.module.css";
import {
  SHOP_SETUP_STEPS,
  isShopSetupStep,
  shopSetupHref,
  type ShopSetupStep,
} from "@/components/seller/shopSetupSteps";

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={ui.fieldHint}>
      {value.length}/{max}
    </span>
  );
}

/** The step lives in the URL (?tab=…) so the sidebar dropdown can link to it. */
export default function ShopSetupPage() {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading shop setup…</p>}>
      <ShopSetupContent />
    </Suspense>
  );
}

function ShopSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams?.get("tab");
  const tab: ShopSetupStep = isShopSetupStep(requested) ? requested : "information";
  const setTab = (next: ShopSetupStep) => router.replace(shopSetupHref(next), { scroll: false });
  const { isAuthenticated, status: authStatus } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [gstNote, setGstNote] = useState<string | null>(null);
  const [gstVerified, setGstVerified] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  // Read on the client so the shown link always matches the domain the app is served from.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
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

  type FormKey = keyof typeof form;
  const set = (key: FormKey) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: event.target.value }));

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
        setMessage({ tone: "danger", text: result.error ?? "Upload failed" });
        return;
      }
      setForm((f) =>
        kind === "logo"
          ? { ...f, logoUrl: result.data!.url }
          : { ...f, bannerUrl: result.data!.url }
      );
      setMessage({
        tone: "success",
        text: `${kind === "logo" ? "Logo" : "Banner"} uploaded. Save changes to publish it.`,
      });
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Upload failed" });
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
      setTab("shipping");
      setMessage({
        tone: "danger",
        text:
          gstNote && gstNote !== "Checking GSTIN…"
            ? gstNote
            : "Enter a GSTIN and wait until it is verified.",
      });
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
      setTab("shipping");
      setMessage({
        tone: "danger",
        text:
          "Pickup address is incomplete. Required: nickname, contact name, email, 10-digit phone, address, city, state, and 6-digit pincode.",
      });
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
      setMessage({ tone: "danger", text: result.error });
      return;
    }
    const sync = (result.data as { pickupSync?: { synced?: boolean; alreadyExists?: boolean; pickupLocation?: string; mode?: string } } | null)
      ?.pickupSync;
    if (sync?.synced && sync.pickupLocation) {
      setMessage({
        tone: "success",
        text: sync.alreadyExists
          ? `Saved. Pickup “${sync.pickupLocation}” is already on Shiprocket.`
          : `Saved. Pickup “${sync.pickupLocation}” was created on Shiprocket.`,
      });
    } else {
      setMessage({ tone: "success", text: "Changes saved." });
    }
    const refreshed = await fetchMySeller();
    if (refreshed) setSeller(refreshed);
  };

  if (!seller) {
    return <p className={ui.muted}>Loading shop setup…</p>;
  }

  const stepIndex = Math.max(0, SHOP_SETUP_STEPS.findIndex((step) => step.key === tab));
  const previewPlace = [seller.sellingCity, seller.sellingState].filter(Boolean).join(", ");

  const uploadTile = (kind: "logo" | "banner") => (
    <label className={styles.uploadTile}>
      <input
        type="file"
        accept="image/*"
        disabled={uploading !== null}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadBranding(kind, file);
          e.target.value = "";
        }}
      />
      <Upload size={16} aria-hidden="true" />
      {uploading === kind ? "Uploading…" : kind === "logo" ? "Upload logo" : "Upload banner"}
    </label>
  );

  return (
    <div className={styles.setupPage}>
      <PageHeader
        eyebrow={`Shop setup · Step ${stepIndex + 1} of ${SHOP_SETUP_STEPS.length}`}
        title={SHOP_SETUP_STEPS[stepIndex].label}
        description="Pick a step from the Shop setup menu. Changes apply when you save."
        actions={
          <Button variant="primary" disabled={saving || uploading !== null} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <label className={styles.stepPicker}>
        <span className={ui.fieldLabel}>Step</span>
        <select value={tab} onChange={(e) => setTab(e.target.value as ShopSetupStep)}>
          {SHOP_SETUP_STEPS.map((step, index) => (
            <option key={step.key} value={step.key}>
              {index + 1}. {step.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.setupBoard}>

        <div className={ui.stack}>
          {tab === "information" ? (
            <>
              <section className={ui.card}>
                <div className={ui.cardHead}>
                  <div>
                    <h2 className={ui.cardTitle}>Shop information</h2>
                    <p className={ui.cardSub}>The basics buyers see on your shop page.</p>
                  </div>
                </div>
                <div className={ui.stack}>
                  <div className={ui.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="shop-name">
                        Shop name <span className={styles.req}>*</span>
                      </label>
                      <Counter value={form.shopName} max={50} />
                    </div>
                    <input
                      id="shop-name"
                      value={form.shopName}
                      maxLength={50}
                      placeholder="Your shop name"
                      onChange={set("shopName")}
                    />
                    <span className={ui.fieldHint}>
                      Shop link: <span className={styles.shopUrl}>{origin}/shops/{seller.shopSlug}</span>.
                      Renaming the shop updates the link; old links keep working.
                    </span>
                  </div>
                  <div className={ui.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="shop-tagline">Tagline</label>
                      <Counter value={form.tagline} max={80} />
                    </div>
                    <input
                      id="shop-tagline"
                      value={form.tagline}
                      maxLength={80}
                      placeholder="A short line customers will remember"
                      onChange={set("tagline")}
                    />
                  </div>
                  <div className={ui.field}>
                    <div className={styles.labelRow}>
                      <label htmlFor="shop-description">
                        Description <span className={styles.req}>*</span>
                      </label>
                      <Counter value={form.description} max={500} />
                    </div>
                    <textarea
                      id="shop-description"
                      value={form.description}
                      maxLength={500}
                      rows={5}
                      placeholder="What you make, and who it is for."
                      onChange={set("description")}
                    />
                  </div>
                </div>
              </section>

              <section className={ui.card}>
                <div className={ui.cardHead}>
                  <div>
                    <h2 className={ui.cardTitle}>Contact details</h2>
                    <p className={ui.cardSub}>Visible to your customers.</p>
                  </div>
                </div>
                <div className={ui.formGrid2}>
                  <div className={ui.field}>
                    <label htmlFor="shop-email">
                      Shop email <span className={styles.req}>*</span>
                    </label>
                    <input
                      id="shop-email"
                      type="email"
                      value={form.contactEmail}
                      placeholder="hello@yourshop.com"
                      onChange={set("contactEmail")}
                    />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="shop-phone">Phone number</label>
                    <input
                      id="shop-phone"
                      inputMode="tel"
                      value={form.contactPhone}
                      placeholder="+91"
                      onChange={set("contactPhone")}
                    />
                  </div>
                  <div className={`${ui.field} ${ui.fieldWide}`}>
                    <label htmlFor="shop-address">
                      Business address <span className={styles.req}>*</span>
                    </label>
                    <textarea
                      id="shop-address"
                      value={form.businessAddress}
                      rows={3}
                      placeholder="Street, city, state, PIN"
                      onChange={set("businessAddress")}
                    />
                  </div>
                </div>
              </section>

              <section className={ui.card}>
                <div className={ui.cardHead}>
                  <div>
                    <h2 className={ui.cardTitle}>Social links</h2>
                    <p className={ui.cardSub}>Help customers find and follow you.</p>
                  </div>
                </div>
                <div className={ui.formGrid3}>
                  <div className={ui.field}>
                    <label htmlFor="shop-instagram">Instagram</label>
                    <input id="shop-instagram" value={form.instagram} placeholder="@yourshop" onChange={set("instagram")} />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="shop-facebook">Facebook</label>
                    <input id="shop-facebook" value={form.facebook} placeholder="/yourshop" onChange={set("facebook")} />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="shop-pinterest">Pinterest</label>
                    <input id="shop-pinterest" value={form.pinterest} placeholder="/yourshop" onChange={set("pinterest")} />
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {tab === "branding" ? (
            <section className={ui.card}>
              <div className={ui.cardHead}>
                <div>
                  <h2 className={ui.cardTitle}>Branding</h2>
                  <p className={ui.cardSub}>Upload images, or paste a link to one you already host.</p>
                </div>
              </div>
              <div className={ui.stack}>
                <div className={styles.brandingRow}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizedImage(form.logoUrl || FALLBACK_SHOP_LOGO, 200)} alt="" className={styles.logoPreview} />
                  <div className={ui.field}>
                    <span className={ui.fieldLabel}>Logo</span>
                    <span className={ui.fieldHint}>Square, 512×512px recommended (JPG or PNG).</span>
                    <div className={styles.brandingControls}>
                      {uploadTile("logo")}
                      <input
                        value={form.logoUrl}
                        onChange={set("logoUrl")}
                        placeholder="or paste a logo URL"
                        aria-label="Logo URL"
                        className={ui.input}
                      />
                    </div>
                  </div>
                </div>
                <div className={ui.field}>
                  <span className={ui.fieldLabel}>Banner</span>
                  <span className={ui.fieldHint}>Wide image shown across the top of your shop, 1600×400px works well.</span>
                  {form.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedImage(form.bannerUrl, 1200)} alt="" className={styles.bannerPreview} />
                  ) : (
                    <div className={`${styles.bannerPreview} ${styles.bannerEmpty}`}>No banner yet</div>
                  )}
                  <div className={styles.brandingControls}>
                    {uploadTile("banner")}
                    <input
                      value={form.bannerUrl}
                      onChange={set("bannerUrl")}
                      placeholder="or paste a banner URL"
                      aria-label="Banner URL"
                      className={ui.input}
                    />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "seo" ? (
            <section className={ui.card}>
              <div className={ui.cardHead}>
                <div>
                  <h2 className={ui.cardTitle}>SEO &amp; discoverability</h2>
                  <p className={ui.cardSub}>How your shop appears in search engine results.</p>
                </div>
              </div>
              <div className={ui.stack}>
                <div className={ui.field}>
                  <div className={styles.labelRow}>
                    <label htmlFor="seo-title">SEO title</label>
                    <Counter value={form.seoTitle} max={70} />
                  </div>
                  <input id="seo-title" value={form.seoTitle} maxLength={70} onChange={set("seoTitle")} />
                </div>
                <div className={ui.field}>
                  <div className={styles.labelRow}>
                    <label htmlFor="seo-description">SEO description</label>
                    <Counter value={form.seoDescription} max={160} />
                  </div>
                  <textarea
                    id="seo-description"
                    value={form.seoDescription}
                    maxLength={160}
                    rows={3}
                    onChange={set("seoDescription")}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {tab === "policies" ? (
            <section className={ui.card}>
              <div className={ui.cardHead}>
                <div>
                  <h2 className={ui.cardTitle}>Shop policies</h2>
                  <p className={ui.cardSub}>
                    Shown on your shop’s Policies tab. Leave blank to use the Stuffsy defaults.
                  </p>
                </div>
              </div>
              <div className={ui.field}>
                <label htmlFor="policy-returns">Returns &amp; exchanges</label>
                <textarea
                  id="policy-returns"
                  value={form.policyReturns}
                  maxLength={2000}
                  rows={6}
                  onChange={set("policyReturns")}
                  placeholder="e.g. Easy returns within 7 days of delivery on unused items."
                />
              </div>
            </section>
          ) : null}

          {tab === "shipping" ? (
            <>
              <section className={ui.card}>
                <div className={ui.cardHead}>
                  <div>
                    <h2 className={ui.cardTitle}>Where you can sell</h2>
                    <p className={ui.cardSub}>A verified GSTIN lets your shop sell across India.</p>
                  </div>
                  <StatusPill tone={seller.sellingScope === "pan_india" ? "success" : "neutral"}>
                    {seller.sellingScope === "pan_india"
                      ? "All India"
                      : `${seller.sellingState || "Home state"} only`}
                  </StatusPill>
                </div>
                {seller.sellingScope === "pan_india" && seller.gstin ? (
                  <Notice tone="success">GSTIN {seller.gstin} is verified. This shop can sell across India.</Notice>
                ) : (
                  <div className={ui.stack}>
                    <p className={ui.muted}>
                      {seller.sellingScope === "pan_india"
                        ? "An admin allowed this shop to sell across India without a GSTIN. You can still add one below."
                        : `Without a verified GSTIN, this shop can sell only in ${seller.sellingState || "its home state"}. Add a GSTIN and save to sell across India.`}
                    </p>
                    <div className={ui.field}>
                      <label htmlFor="shop-gstin">GSTIN</label>
                      <input
                        id="shop-gstin"
                        value={form.gstin}
                        maxLength={15}
                        placeholder="15-character GSTIN"
                        onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                      />
                      {gstNote ? (
                        <span className={gstVerified ? styles.gstOk : ui.fieldHint}>{gstNote}</span>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>

              <section className={ui.card}>
                <div className={ui.cardHead}>
                  <div>
                    <h2 className={ui.cardTitle}>Pickup address</h2>
                    <p className={ui.cardSub}>
                      Where couriers collect your parcels. Saving registers it on Shiprocket for you.
                    </p>
                  </div>
                </div>
                <div className={ui.formGrid2}>
                  <div className={`${ui.field} ${ui.fieldWide}`}>
                    <label htmlFor="pickup-nickname">
                      Pickup nickname <span className={styles.req}>*</span>
                    </label>
                    <input
                      id="pickup-nickname"
                      value={form.pickupLocationName}
                      maxLength={36}
                      placeholder="e.g. NaitikHome"
                      onChange={set("pickupLocationName")}
                    />
                    <span className={ui.fieldHint}>
                      Letters, numbers and spaces. Must be unique for your shop.
                    </span>
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="pickup-name">
                      Contact name <span className={styles.req}>*</span>
                    </label>
                    <input id="pickup-name" value={form.pickupName} onChange={set("pickupName")} />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="pickup-phone">
                      Phone (10 digits) <span className={styles.req}>*</span>
                    </label>
                    <input
                      id="pickup-phone"
                      value={form.pickupPhone}
                      inputMode="numeric"
                      onChange={set("pickupPhone")}
                    />
                  </div>
                  <div className={`${ui.field} ${ui.fieldWide}`}>
                    <label htmlFor="pickup-email">
                      Email <span className={styles.req}>*</span>
                    </label>
                    <input id="pickup-email" type="email" value={form.pickupEmail} onChange={set("pickupEmail")} />
                  </div>
                  <div className={`${ui.field} ${ui.fieldWide}`}>
                    <label htmlFor="pickup-address1">
                      Address <span className={styles.req}>*</span>
                    </label>
                    <input id="pickup-address1" value={form.pickupAddress1} onChange={set("pickupAddress1")} />
                  </div>
                  <div className={`${ui.field} ${ui.fieldWide}`}>
                    <label htmlFor="pickup-address2">Address line 2</label>
                    <input id="pickup-address2" value={form.pickupAddress2} onChange={set("pickupAddress2")} />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="pickup-city">
                      City <span className={styles.req}>*</span>
                    </label>
                    <input id="pickup-city" value={form.pickupCity} onChange={set("pickupCity")} />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="pickup-state">
                      State <span className={styles.req}>*</span>
                    </label>
                    <input
                      id="pickup-state"
                      value={form.pickupState}
                      placeholder="Full name, e.g. Gujarat"
                      onChange={set("pickupState")}
                    />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="pickup-pincode">
                      Pincode <span className={styles.req}>*</span>
                    </label>
                    <input
                      id="pickup-pincode"
                      value={form.pickupPincode}
                      maxLength={6}
                      inputMode="numeric"
                      onChange={set("pickupPincode")}
                    />
                  </div>
                  <div className={ui.field}>
                    <label htmlFor="pickup-country">Country</label>
                    <input id="pickup-country" value="India" readOnly />
                  </div>
                </div>
              </section>

              <section className={ui.card}>
                <div className={ui.cardHead}>
                  <div>
                    <h2 className={ui.cardTitle}>Shipping policy</h2>
                    <p className={ui.cardSub}>Shown to buyers on your shop page.</p>
                  </div>
                </div>
                <div className={ui.field}>
                  <label htmlFor="policy-shipping" className="sr-only">
                    Shipping policy
                  </label>
                  <textarea
                    id="policy-shipping"
                    value={form.policyShipping}
                    maxLength={2000}
                    rows={5}
                    onChange={set("policyShipping")}
                    placeholder="Processing time, carriers, regions you ship to…"
                  />
                </div>
              </section>
            </>
          ) : null}

          {tab === "payment" ? (
            <section className={ui.card}>
              <div className={ui.cardHead}>
                <div>
                  <h2 className={ui.cardTitle}>Payment &amp; billing</h2>
                  <p className={ui.cardSub}>Notes shown to buyers about payments and invoices.</p>
                </div>
              </div>
              <div className={ui.field}>
                <label htmlFor="policy-payment">Payment notes for buyers</label>
                <textarea
                  id="policy-payment"
                  value={form.policyPayment}
                  maxLength={2000}
                  rows={5}
                  onChange={set("policyPayment")}
                  placeholder="Accepted methods, invoice notes, GST info…"
                />
              </div>
            </section>
          ) : null}

          {tab === "vacation" ? (
            <section className={ui.card}>
              <div className={ui.cardHead}>
                <div>
                  <h2 className={ui.cardTitle}>Vacation mode</h2>
                  <p className={ui.cardSub}>
                    Your shop stays visible with a vacation banner. Products are hidden from browse
                    and cart lines from your shop become unavailable.
                  </p>
                </div>
                <StatusPill tone={form.isVacationMode ? "warning" : "neutral"}>
                  {form.isVacationMode ? "On" : "Off"}
                </StatusPill>
              </div>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={form.isVacationMode}
                  onChange={(e) => setForm((f) => ({ ...f, isVacationMode: e.target.checked }))}
                />
                <span>
                  <strong>I’m on vacation, pause new orders</strong>
                  <small>Remember to save changes after switching this.</small>
                </span>
              </label>
            </section>
          ) : null}
        </div>

        <aside className={styles.setupSide}>
          <section className={ui.card}>
            <div className={ui.cardHead}>
              <div>
                <h2 className={ui.cardTitle}>Shop preview</h2>
                <p className={ui.cardSub}>How buyers see your shop.</p>
              </div>
            </div>
            <div className={styles.previewStage}>
              {form.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedImage(form.bannerUrl, 1200)} alt="" className={styles.previewBanner} />
              ) : (
                <div className={styles.previewBanner} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={optimizedImage(form.logoUrl || FALLBACK_SHOP_LOGO, 200)} alt="" className={styles.previewLogo} />
            </div>
            <p className={styles.previewName}>
              <strong>{form.shopName || seller.shopName}</strong>
              {seller.badge ? <span className={styles.previewBadge}>{seller.badge}</span> : null}
            </p>
            <p className={ui.muted}>{form.tagline || "Your tagline appears here."}</p>
            {previewPlace || form.isVacationMode || seller.memberSince ? (
              <p className={styles.previewFacts}>
                {previewPlace ? <span>{previewPlace}</span> : null}
                {form.isVacationMode ? <span>On vacation</span> : null}
                {seller.memberSince ? <span>On Stuffsy since {seller.memberSince}</span> : null}
              </p>
            ) : null}
            <Link href={shopHref(seller.shopSlug)} className={`${ui.linkInline} ${styles.previewLink}`}>
              View live shop <ExternalLink size={14} aria-hidden="true" />
            </Link>
          </section>
          <section className={styles.tipsCard}>
            <h2 className={styles.sectionTitle}>Tips for a great shop</h2>
            <ul>
              <li>Use a clear and memorable shop name.</li>
              <li>Upload a professional logo and banner.</li>
              <li>Describe what you make and who it is for.</li>
              <li>Add social links so buyers can reach you.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
