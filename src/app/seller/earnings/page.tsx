"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Clock, Hourglass, Landmark, Percent } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import {
  LEDGER_LABELS,
  fetchEarnings,
  fetchLedger,
  requestPayout,
  type EarningsSummary,
  type LedgerEntry,
  type SellerPayout,
} from "@/utils/earnings";
import { formatDate, formatDateTime, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";

const money = (value: number) => rupees(value, { decimals: true });
const signed = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;

export default function SellerEarningsPage() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");

  const load = useCallback(async (nextPage: number) => {
    const [earnings, ledger] = await Promise.all([fetchEarnings(), fetchLedger(nextPage)]);
    setLoading(false);
    if (earnings.error || !earnings.data) {
      setError(earnings.error ?? "Could not load your earnings.");
      return;
    }
    setError(null);
    setSummary(earnings.data.summary);
    setPayouts(earnings.data.payouts);
    if (ledger.data) {
      setEntries(ledger.data.entries);
      setTotal(ledger.data.total);
      setPage(nextPage);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function onRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!summary) return;
    const value = amount.trim() ? Number(amount) : undefined;
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await requestPayout(value);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not request the payout.");
      return;
    }
    setAmount("");
    setNotice(`Payout of ${money(result.data.payout.amount)} requested. We'll send it and update this page.`);
    await load(1);
  }

  const pageSize = 15;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const canRequest = Boolean(summary && !summary.openPayout && summary.available >= summary.minPayout);

  const cards = summary
    ? [
        { label: "Available to withdraw", value: money(summary.available), hint: "Past the return window", Icon: Banknote, tone: ui.toneGreen },
        {
          label: "Pending",
          value: money(summary.pending),
          hint: summary.nextAvailableAt ? `Next unlocks ${formatDate(summary.nextAvailableAt)}` : "Orders still in their return window",
          Icon: Hourglass,
          tone: ui.toneAmber,
        },
        { label: "Awaiting payout", value: money(summary.awaitingPayout), hint: "Requested, being sent", Icon: Clock, tone: ui.toneBlue },
        { label: "Paid out", value: money(summary.paidOut), hint: "Sent to you so far", Icon: Landmark, tone: ui.toneViolet },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Earnings"
        description="What you've earned, what's on its way, and your payouts."
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className={ui.metrics}>
        {cards.map((card) => (
          <div key={card.label} className={ui.metric}>
            <div className={ui.metricTop}>
              <span className={ui.metricLabel}>{card.label}</span>
              <span className={`${ui.metricIcon} ${card.tone}`} aria-hidden="true">
                <card.Icon size={18} />
              </span>
            </div>
            <span className={ui.metricValue}>{card.value}</span>
            <span className={ui.metricHint}>{card.hint}</span>
          </div>
        ))}
      </div>

      {summary ? (
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <h2 className={ui.cardTitle}>Withdraw</h2>
              <p className={ui.cardSub}>
                Minimum {money(summary.minPayout)}. Payouts go to the UPI ID or bank account in{" "}
                <Link href="/seller/shop-setup?tab=payment" className={ui.linkInline}>
                  Payment &amp; billing
                </Link>
                .
              </p>
            </div>
          </div>
          {summary.openPayout ? (
            <Notice tone="info">
              A payout of {money(summary.openPayout.amount)} was requested on {formatDateTime(summary.openPayout.requestedAt)}.
              It will show as paid here once it&apos;s sent.
            </Notice>
          ) : (
            <form className={ui.formGrid2} onSubmit={(e) => void onRequest(e)}>
              <label className={ui.field}>
                <span>Amount (₹)</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  placeholder={summary.available > 0 ? `All available: ${summary.available}` : "0"}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className={ui.fieldHint}>Leave empty to withdraw everything available.</span>
              </label>
              <div className={ui.field} style={{ justifyContent: "flex-end" }}>
                <Button type="submit" disabled={busy || !canRequest}>
                  {busy ? "Requesting…" : "Request payout"}
                </Button>
                {!canRequest && summary.available < summary.minPayout ? (
                  <span className={ui.fieldHint}>You can withdraw once {money(summary.minPayout)} is available.</span>
                ) : null}
              </div>
            </form>
          )}
          <p className={ui.muted} style={{ marginTop: 12 }}>
            <Percent size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Stuffsy keeps{" "}
            {summary.commissionPercent}% of each item&apos;s price. GST and delivery charges aren&apos;t part of your
            earnings. Lifetime sales {money(summary.lifetimeSales)}, commission {money(summary.lifetimeCommission)}.
          </p>
        </section>
      ) : null}

      {payouts.length > 0 ? (
        <section className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.cardHead}>
            <h2 className={ui.cardTitle}>Payouts</h2>
          </div>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th className={ui.num}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className={ui.nowrap}>{formatDateTime(payout.requestedAt)}</td>
                    <td>{payout.destination ?? "—"}</td>
                    <td>
                      <StatusPill
                        tone={payout.status === "paid" ? "success" : payout.status === "rejected" ? "danger" : "warning"}
                      >
                        {payout.status === "paid" ? "Paid" : payout.status === "rejected" ? "Returned" : "Requested"}
                      </StatusPill>
                      {payout.note ? <div className={ui.cellSub}>{payout.note}</div> : null}
                    </td>
                    <td className={ui.mono}>{payout.reference ?? "—"}</td>
                    <td className={ui.num}>{money(payout.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>Ledger</h2>
            <p className={ui.cardSub}>{loading ? "Loading…" : `${total} entries, newest first`}</p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Order</th>
                <th>Status</th>
                <th className={ui.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className={ui.nowrap}>{formatDate(entry.createdAt)}</td>
                  <td>
                    <span className={ui.cellPrimary}>{LEDGER_LABELS[entry.type] ?? entry.type}</span>
                    {entry.description ? <div className={ui.cellSub}>{entry.description}</div> : null}
                  </td>
                  <td className={ui.mono}>
                    {entry.orderId ? (
                      <Link href={`/seller/orders/${entry.orderId}`} className={ui.linkInline}>
                        {entry.orderNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {entry.isAvailable ? (
                      <StatusPill tone="success">Available</StatusPill>
                    ) : (
                      <StatusPill tone="warning">Until {formatDate(entry.availableAt)}</StatusPill>
                    )}
                  </td>
                  <td className={ui.num} style={{ color: entry.amount < 0 ? "var(--color-danger-ink)" : undefined }}>
                    {signed(entry.amount)}
                  </td>
                </tr>
              ))}
              {!loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ui.emptyCell}>
                    No earnings yet. They appear here when an order is delivered.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {lastPage > 1 ? (
          <div className={ui.toolbar} style={{ padding: 16 }}>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => void load(page - 1)}>
              Previous
            </Button>
            <span className={ui.muted}>
              Page {page} of {lastPage}
            </span>
            <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => void load(page + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
