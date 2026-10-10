"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import {
  cancelSale,
  createSellerCoupon,
  deleteSellerCoupon,
  fetchSales,
  fetchSellerCoupons,
  toLocalInput,
  updateSellerCoupon,
  type Sale,
  type SellerCoupon,
} from "@/utils/promotions";
import { formatDateTime, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";
import community from "@/components/community/Community.module.css";

type TabKey = "sales" | "coupons";

export default function SellerPromotionsPage() {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading…</p>}>
      <PromotionsContent />
    </Suspense>
  );
}

function PromotionsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: TabKey = params?.get("tab") === "coupons" ? "coupons" : "sales";
  return (
    <>
      <PageHeader title="Promotions" description="Run sales and offer your own coupon codes." />
      <div className={community.tabs} role="tablist" aria-label="Promotions">
        {(["sales", "coupons"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`${community.tab} ${tab === key ? community.tabActive : ""}`}
            onClick={() => router.replace(`/seller/promotions?tab=${key}`, { scroll: false })}
          >
            {key === "sales" ? "Sales" : "Coupons"}
          </button>
        ))}
      </div>
      {tab === "sales" ? <SalesPanel /> : <CouponsPanel />}
    </>
  );
}

const SALE_TONE: Record<Sale["status"], "warning" | "success" | "neutral"> = {
  scheduled: "warning",
  active: "success",
  ended: "neutral",
  cancelled: "neutral",
};

function SalesPanel() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchSales();
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load your sales.");
      setSales((current) => current ?? []);
      return;
    }
    setError(null);
    setSales(result.data.sales);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function stop(sale: Sale) {
    const text =
      sale.status === "active"
        ? `End the sale on “${sale.productTitle}” now? Its normal price returns immediately.`
        : `Cancel the scheduled sale on “${sale.productTitle}”?`;
    if (!window.confirm(text)) return;
    setBusyId(sale.id);
    const result = await cancelSale(sale.id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(sale.status === "active" ? "Sale ended. The normal price is back." : "Sale cancelled.");
    await load();
  }

  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Notice tone="info" title="How sales work">
        Pick products on the <Link href="/seller/products" className={ui.linkInline}>Products page</Link>, tick them
        and choose “Put on sale”. Prices drop at the start time and return on their own at the end.
      </Notice>
      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <h2 className={ui.cardTitle}>Your sales</h2>
          <ButtonLink href="/seller/products" size="sm" variant="outline">
            Choose products
          </ButtonLink>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Discount</th>
                <th>Runs</th>
                <th>Status</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(sales ?? []).map((sale) => (
                <tr key={sale.id}>
                  <td className={ui.cellPrimary}>{sale.productTitle}</td>
                  <td>
                    {sale.percentOff}% off
                    {sale.originalPrice != null ? <div className={ui.cellSub}>from {rupees(sale.originalPrice)}</div> : null}
                  </td>
                  <td className={ui.nowrap}>
                    {formatDateTime(sale.startsAt)}
                    <div className={ui.cellSub}>to {formatDateTime(sale.endsAt)}</div>
                  </td>
                  <td>
                    <StatusPill tone={SALE_TONE[sale.status]}>
                      {sale.status === "active" ? "Live" : sale.status === "scheduled" ? "Scheduled" : sale.status === "ended" ? "Ended" : "Cancelled"}
                    </StatusPill>
                  </td>
                  <td>
                    {sale.status === "scheduled" || sale.status === "active" ? (
                      <div className={ui.rowActions}>
                        <Button size="sm" variant="secondary" disabled={busyId === sale.id} onClick={() => void stop(sale)}>
                          {sale.status === "active" ? "End now" : "Cancel"}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {sales && sales.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    No sales yet.
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

function CouponsPanel() {
  const [coupons, setCoupons] = useState<SellerCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("10");
  const [minOrder, setMinOrder] = useState("");
  const [limit, setLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => toLocalInput(new Date(Date.now() + 14 * 86400e3)));
  // Read once per visit: a fresh Date.now() on every render is impure.
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const result = await fetchSellerCoupons();
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load your coupons.");
      setCoupons((current) => current ?? []);
      return;
    }
    setCoupons(result.data.coupons);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(value);
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(code.trim())) {
      setError("Codes use 3-30 letters, numbers, - or _.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a discount greater than 0.");
      return;
    }
    if (type === "percentage" && amount > 90) {
      setError("A shop coupon can give at most 90% off.");
      return;
    }
    if (new Date(expiresAt).getTime() <= Date.now()) {
      setError("The expiry must be in the future.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await createSellerCoupon({
      code: code.trim(),
      type,
      value: amount,
      minOrderValue: minOrder.trim() ? Number(minOrder) : null,
      usageLimitTotal: limit.trim() ? Number(limit) : null,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(`Coupon ${code.trim().toUpperCase()} is live for your shop.`);
    setCode("");
    setMinOrder("");
    setLimit("");
    await load();
  }

  async function toggle(coupon: SellerCoupon) {
    const result = await updateSellerCoupon(coupon.id, { isActive: !coupon.isActive });
    if (result.error) setError(result.error);
    else await load();
  }

  async function remove(coupon: SellerCoupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}? Buyers can no longer use it.`)) return;
    const result = await deleteSellerCoupon(coupon.id);
    if (result.error) setError(result.error);
    else await load();
  }

  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <form className={ui.card} onSubmit={(e) => void create(e)}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>New coupon</h2>
            <p className={ui.cardSub}>
              Works only on your shop&apos;s items, and the discount comes out of your earnings.
            </p>
          </div>
        </div>
        <div className={ui.formGrid3}>
          <label className={ui.field}>
            <span>Code</span>
            <input value={code} maxLength={30} placeholder="DIWALI15" onChange={(e) => setCode(e.target.value.toUpperCase())} required />
          </label>
          <label className={ui.field}>
            <span>Discount type</span>
            <select value={type} onChange={(e) => setType(e.target.value as "percentage" | "flat")}>
              <option value="percentage">Percentage off</option>
              <option value="flat">Flat amount (₹)</option>
            </select>
          </label>
          <label className={ui.field}>
            <span>{type === "flat" ? "Amount (₹)" : "Percent off"}</span>
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} required />
          </label>
          <label className={ui.field}>
            <span>Minimum order (₹, optional)</span>
            <input inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
          <label className={ui.field}>
            <span>Total uses (optional)</span>
            <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className={ui.field}>
            <span>Expires</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
          </label>
        </div>
        <div className={ui.formActions}>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create coupon"}
          </Button>
        </div>
      </form>

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <h2 className={ui.cardTitle}>Your coupons</h2>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Used</th>
                <th>Expires</th>
                <th>Status</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(coupons ?? []).map((coupon) => {
                const expired = new Date(coupon.expiresAt).getTime() < now;
                return (
                  <tr key={coupon.id}>
                    <td className={ui.mono}>{coupon.code}</td>
                    <td className={ui.cellPrimary}>
                      {coupon.type === "flat" ? rupees(coupon.value) : `${coupon.value}%`}
                      {coupon.minOrderValue ? <div className={ui.cellSub}>min {rupees(coupon.minOrderValue)}</div> : null}
                    </td>
                    <td>
                      {coupon.timesUsed}
                      {coupon.usageLimitTotal ? ` / ${coupon.usageLimitTotal}` : ""}
                    </td>
                    <td className={ui.nowrap}>{formatDateTime(coupon.expiresAt)}</td>
                    <td>
                      {expired ? (
                        <StatusPill tone="neutral">Expired</StatusPill>
                      ) : (
                        <StatusPill tone={coupon.isActive ? "success" : "neutral"}>{coupon.isActive ? "Active" : "Paused"}</StatusPill>
                      )}
                    </td>
                    <td>
                      <div className={ui.rowActions}>
                        {!expired ? (
                          <Button size="sm" variant="secondary" onClick={() => void toggle(coupon)}>
                            {coupon.isActive ? "Pause" : "Resume"}
                          </Button>
                        ) : null}
                        <Button size="sm" variant="danger" onClick={() => void remove(coupon)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {coupons && coupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    No coupons yet. Create one above.
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
