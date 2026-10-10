"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { formatDateTime, rupees } from "@/utils/format";
import ui from "@/components/console/console.module.css";

type Payout = {
  id: string;
  amount: number;
  status: "requested" | "paid" | "rejected";
  reference: string | null;
  note: string | null;
  requestedAt: string;
  processedAt: string | null;
  destination: { method?: string; upiId?: string; ifsc?: string; bankAccountLast4?: string; accountHolderName?: string | null };
  shopName: string;
  sellerId: string;
  contactEmail: string | null;
  ledgerBalance: number;
};

type Overview = {
  availableToSellers: number;
  pendingToSellers: number;
  awaitingPayout: number;
  paidOut: number;
  commissionEarned: number;
};

const money = (value: number) => rupees(value, { decimals: true });

function destinationText(d: Payout["destination"]) {
  if (d.method === "upi") return `UPI: ${d.upiId}`;
  if (d.method === "bank") return `Bank: ••••${d.bankAccountLast4} · IFSC ${d.ifsc}`;
  return "—";
}

export default function AdminPayoutsPage() {
  const [status, setStatus] = useState<Payout["status"]>("requested");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const result = await apiRequest<{ payouts: Payout[]; total: number; pageSize: number; overview: Overview }>(
      "GET",
      `/api/admin/payouts?status=${status}&page=${page}`
    );
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load payouts.");
      return;
    }
    setError(null);
    setPayouts(result.data.payouts);
    setTotal(result.data.total);
    setPageSize(result.data.pageSize);
    setOverview(result.data.overview);
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(payout: Payout) {
    const reference = (refs[payout.id] ?? "").trim();
    if (reference.length < 3) {
      setError("Enter the bank or UPI reference for the transfer you made.");
      return;
    }
    if (!window.confirm(`Mark ${money(payout.amount)} to ${payout.shopName} as paid (ref ${reference})?`)) return;
    setBusyId(payout.id);
    const result = await apiRequest("POST", `/api/admin/payouts/${payout.id}/pay`, { body: { reference } });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice(`Marked as paid. ${payout.shopName} has been notified.`);
    await load();
  }

  async function reject(payout: Payout) {
    const note = window.prompt(`Why can't this payout be sent? ${payout.shopName} will see this.`)?.trim();
    if (!note) return;
    setBusyId(payout.id);
    const result = await apiRequest("POST", `/api/admin/payouts/${payout.id}/reject`, { body: { note } });
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice("Payout returned to the seller's balance.");
    await load();
  }

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Seller withdrawal requests. Send the money from your bank, then record the reference here."
      />

      {overview ? (
        <div className={ui.metrics}>
          <div className={ui.metric}>
            <span className={ui.metricLabel}>Owed and withdrawable</span>
            <span className={ui.metricValue}>{money(overview.availableToSellers)}</span>
            <span className={ui.metricHint}>Past return window</span>
          </div>
          <div className={ui.metric}>
            <span className={ui.metricLabel}>Owed, still pending</span>
            <span className={ui.metricValue}>{money(overview.pendingToSellers)}</span>
            <span className={ui.metricHint}>Inside return window</span>
          </div>
          <div className={ui.metric}>
            <span className={ui.metricLabel}>Awaiting transfer</span>
            <span className={ui.metricValue}>{money(overview.awaitingPayout)}</span>
            <span className={ui.metricHint}>Requested by sellers</span>
          </div>
          <div className={ui.metric}>
            <span className={ui.metricLabel}>Commission earned</span>
            <span className={ui.metricValue}>{money(overview.commissionEarned)}</span>
            <span className={ui.metricHint}>Paid out so far: {money(overview.paidOut)}</span>
          </div>
        </div>
      ) : null}

      <div className={ui.toolbar}>
        {(["requested", "paid", "rejected"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "primary" : "outline"}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {value === "requested" ? "To send" : value === "paid" ? "Paid" : "Returned"}
          </Button>
        ))}
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <p className={ui.cardSub}>{loading ? "Loading…" : `${total} payout${total === 1 ? "" : "s"}`}</p>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Send to</th>
                <th>Requested</th>
                <th>Status</th>
                <th className={ui.num}>Amount</th>
                <th className={ui.num}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td>
                    <span className={ui.cellPrimary}>{payout.shopName}</span>
                    <div className={ui.cellSub}>{payout.contactEmail ?? "—"}</div>
                  </td>
                  <td>
                    {destinationText(payout.destination)}
                    {payout.destination.accountHolderName ? (
                      <div className={ui.cellSub}>{payout.destination.accountHolderName}</div>
                    ) : null}
                  </td>
                  <td className={ui.nowrap}>{formatDateTime(payout.requestedAt)}</td>
                  <td>
                    <StatusPill
                      tone={payout.status === "paid" ? "success" : payout.status === "rejected" ? "danger" : "warning"}
                    >
                      {payout.status === "paid" ? "Paid" : payout.status === "rejected" ? "Returned" : "To send"}
                    </StatusPill>
                    {payout.reference ? <div className={ui.cellSub}>Ref {payout.reference}</div> : null}
                    {payout.note ? <div className={ui.cellSub}>{payout.note}</div> : null}
                  </td>
                  <td className={ui.num}>{money(payout.amount)}</td>
                  <td>
                    {payout.status === "requested" ? (
                      <div className={ui.rowActions}>
                        <input
                          className={ui.input}
                          style={{ width: 150 }}
                          placeholder="UTR / reference"
                          maxLength={120}
                          aria-label={`Reference for ${payout.shopName}`}
                          value={refs[payout.id] ?? ""}
                          onChange={(e) => setRefs((current) => ({ ...current, [payout.id]: e.target.value }))}
                        />
                        <Button size="sm" disabled={busyId === payout.id} onClick={() => void markPaid(payout)}>
                          Mark paid
                        </Button>
                        <Button size="sm" variant="danger" disabled={busyId === payout.id} onClick={() => void reject(payout)}>
                          Return
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className={ui.emptyCell}>
                    {status === "requested" ? "No payouts waiting. All caught up." : "Nothing here yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {lastPage > 1 ? (
          <div className={ui.toolbar} style={{ padding: 16 }}>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className={ui.muted}>
              Page {page} of {lastPage}
            </span>
            <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
