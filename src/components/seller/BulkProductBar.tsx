"use client";

import { useState } from "react";
import { Boxes, Eye, EyeOff, IndianRupee, Percent, X } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Dialog from "@/components/ui/Dialog/Dialog";
import Notice from "@/components/ui/Notice/Notice";
import { bulkEditProducts, createSale, toLocalInput, type BulkAction } from "@/utils/promotions";
import ui from "@/components/console/console.module.css";

type Result = { updated: number; skipped: Array<{ id: string; title: string; reason: string }> };

/**
 * Appears above the product table when rows are selected: publish or unpublish,
 * change prices, set stock, or put the selection on a scheduled sale.
 */
export default function BulkProductBar({
  ids,
  onClear,
  onDone,
}: {
  ids: string[];
  onClear: () => void;
  /** Called after any change, with a message to show. */
  onDone: (message: { tone: "success" | "warning" | "danger"; text: string }) => void;
}) {
  const [dialog, setDialog] = useState<"price" | "stock" | "sale" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Price dialog
  const [mode, setMode] = useState<"percent" | "flat">("percent");
  const [direction, setDirection] = useState<"up" | "down">("down");
  const [amount, setAmount] = useState("");
  // Stock dialog
  const [stock, setStock] = useState("");
  // Sale dialog
  const [percentOff, setPercentOff] = useState("20");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86400e3)));

  const close = () => {
    setDialog(null);
    setError(null);
  };

  const summarize = (result: Result, verb: string) => {
    const skipped = result.skipped.length;
    onDone({
      tone: skipped > 0 ? "warning" : "success",
      text:
        `${verb} ${result.updated} product${result.updated === 1 ? "" : "s"}.` +
        (skipped > 0
          ? ` Skipped ${skipped}: ${result.skipped
              .slice(0, 3)
              .map((s) => `${s.title} (${s.reason})`)
              .join("; ")}${skipped > 3 ? "…" : ""}`
          : ""),
    });
  };

  const run = async (action: BulkAction, verb: string) => {
    setBusy(true);
    setError(null);
    const result = await bulkEditProducts(ids, action);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not update those products.");
      return false;
    }
    summarize(result.data, verb);
    return true;
  };

  const submitPrice = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (mode === "percent" && direction === "down" && value >= 100) {
      setError("A price can't drop by 100% or more.");
      return;
    }
    if (await run({ type: "price", mode, amount: direction === "down" ? -value : value }, "Updated prices on")) close();
  };

  const submitStock = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(stock);
    if (!Number.isInteger(value) || value < 0) {
      setError("Enter a whole number, 0 or more.");
      return;
    }
    if (await run({ type: "stock", quantity: value }, "Set stock on")) close();
  };

  const submitSale = async (event: React.FormEvent) => {
    event.preventDefault();
    const pct = Number(percentOff);
    if (!Number.isFinite(pct) || pct < 1 || pct > 90) {
      setError("Choose a discount between 1% and 90%.");
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime()) || end <= new Date()) {
      setError("The sale must end in the future.");
      return;
    }
    if (end <= start) {
      setError("The sale must end after it starts.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createSale({
      productIds: ids,
      percentOff: pct,
      startsAt: start <= new Date() ? undefined : start.toISOString(),
      endsAt: end.toISOString(),
    });
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not schedule the sale.");
      return;
    }
    onDone({ tone: "success", text: `Sale scheduled on ${result.data.created} product${result.data.created === 1 ? "" : "s"}.` });
    close();
  };

  return (
    <>
      <div
        className={ui.toolbar}
        role="region"
        aria-label="Bulk actions"
        style={{ padding: "10px 16px", background: "var(--color-primary-light)", borderBottom: "1px solid var(--color-primary-border)" }}
      >
        <strong>{ids.length} selected</strong>
        <Button size="sm" variant="secondary" leftIcon={<Eye size={14} />} disabled={busy} onClick={() => void run({ type: "status", status: "active" }, "Published").then((ok) => ok && onClear())}>
          Publish
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<EyeOff size={14} />} disabled={busy} onClick={() => void run({ type: "status", status: "draft" }, "Unpublished").then((ok) => ok && onClear())}>
          Unpublish
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<IndianRupee size={14} />} onClick={() => setDialog("price")}>
          Change price
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<Boxes size={14} />} onClick={() => setDialog("stock")}>
          Set stock
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<Percent size={14} />} onClick={() => setDialog("sale")}>
          Put on sale
        </Button>
        <Button size="sm" variant="ghost" leftIcon={<X size={14} />} onClick={onClear}>
          Clear
        </Button>
      </div>

      {error && !dialog ? <Notice tone="danger">{error}</Notice> : null}

      {dialog === "price" ? (
        <Dialog title={`Change price on ${ids.length} product${ids.length === 1 ? "" : "s"}`} icon={<IndianRupee size={18} />} onClose={close}>
          <form className={ui.stack} onSubmit={(e) => void submitPrice(e)}>
            <div className={ui.formGrid2}>
              <label className={ui.field}>
                <span>Change</span>
                <select value={direction} onChange={(e) => setDirection(e.target.value as "up" | "down")}>
                  <option value="down">Lower by</option>
                  <option value="up">Raise by</option>
                </select>
              </label>
              <label className={ui.field}>
                <span>Unit</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as "percent" | "flat")}>
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Amount (₹)</option>
                </select>
              </label>
            </div>
            <label className={ui.field}>
              <span>{mode === "percent" ? "Percent" : "Amount in ₹"}</span>
              <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
              <span className={ui.fieldHint}>Products on a running sale are skipped.</span>
            </label>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className={ui.formActions}>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Updating…" : "Update prices"}</Button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialog === "stock" ? (
        <Dialog title={`Set stock on ${ids.length} product${ids.length === 1 ? "" : "s"}`} icon={<Boxes size={18} />} onClose={close}>
          <form className={ui.stack} onSubmit={(e) => void submitStock(e)}>
            <label className={ui.field}>
              <span>Quantity in stock</span>
              <input inputMode="numeric" autoFocus value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))} />
              <span className={ui.fieldHint}>Digital products are skipped. Stock never goes below what open orders have reserved.</span>
            </label>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className={ui.formActions}>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Updating…" : "Set stock"}</Button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {dialog === "sale" ? (
        <Dialog title={`Put ${ids.length} product${ids.length === 1 ? "" : "s"} on sale`} icon={<Percent size={18} />} onClose={close}>
          <form className={ui.stack} onSubmit={(e) => void submitSale(e)}>
            <label className={ui.field}>
              <span>Discount (%)</span>
              <input inputMode="decimal" autoFocus value={percentOff} onChange={(e) => setPercentOff(e.target.value.replace(/[^0-9.]/g, ""))} />
            </label>
            <div className={ui.formGrid2}>
              <label className={ui.field}>
                <span>Starts</span>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </label>
              <label className={ui.field}>
                <span>Ends</span>
                <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </label>
            </div>
            <p className={ui.fieldHint}>
              Prices drop at the start time and return to normal at the end. Buyers see the old price crossed out.
            </p>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className={ui.formActions}>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Scheduling…" : "Schedule sale"}</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
