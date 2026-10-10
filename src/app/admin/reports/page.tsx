"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import { apiRequest } from "@/utils/api-client";
import { REPORT_REASONS, type ReportTargetType } from "@/utils/community";
import { formatDateTime } from "@/utils/format";
import { optimizedImage } from "@/utils/media";
import ui from "@/components/console/console.module.css";

type Report = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  status: "open" | "actioned" | "dismissed";
  resolutionNote: string | null;
  reporter: string | null;
  reportCount: number;
  createdAt: string;
  resolvedAt: string | null;
  target: { exists: boolean; title: string; detail: string | null; href: string | null; image: string | null };
};

const REMOVE_LABEL: Record<ReportTargetType, string> = {
  product: "Take down listing",
  review: "Remove review",
  shop: "Suspend shop",
  question: "Remove question",
  message: "Remove message",
};

const TYPE_LABEL: Record<ReportTargetType, string> = {
  product: "Listing",
  review: "Review",
  shop: "Shop",
  question: "Question",
  message: "Message",
};

const reasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value;

export default function AdminReportsPage() {
  const [status, setStatus] = useState<Report["status"]>("open");
  const [type, setType] = useState<"" | ReportTargetType>("");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (type) params.set("type", type);
    const result = await apiRequest<{ reports: Report[]; total: number; pageSize: number }>(
      "GET",
      `/api/admin/reports?${params.toString()}`
    );
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load reports.");
      return;
    }
    setError(null);
    setReports(result.data.reports);
    setTotal(result.data.total);
    setPageSize(result.data.pageSize);
  }, [status, type, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(report: Report, action: "dismiss" | "remove") {
    if (
      action === "remove" &&
      !window.confirm(`${REMOVE_LABEL[report.targetType]}? This also closes the ${report.reportCount} report(s) about it.`)
    ) {
      return;
    }
    setBusyId(report.id);
    setNotice(null);
    const result = await apiRequest<{ status: string; removed: boolean; closedReports: number }>(
      "POST",
      `/api/admin/reports/${report.id}/resolve`,
      { body: { action, note: notes[report.id]?.trim() || null } }
    );
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setNotice(
      action === "dismiss"
        ? "Report dismissed."
        : result.data?.removed
          ? `Done. ${result.data.closedReports} report(s) closed.`
          : "That content was already gone; the report was closed."
    );
    await load();
  }

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Listings, reviews, shops, questions and messages that buyers have flagged."
      />

      <div className={ui.toolbar}>
        {(["open", "actioned", "dismissed"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "primary" : "outline"}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {value === "open" ? "Open" : value === "actioned" ? "Actioned" : "Dismissed"}
          </Button>
        ))}
        <label className={ui.field} style={{ marginLeft: "auto", minWidth: 160 }}>
          <span className="sr-only">Type</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as "" | ReportTargetType);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as ReportTargetType[]).map((key) => (
              <option key={key} value={key}>
                {TYPE_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <section className={`${ui.card} ${ui.cardFlush}`}>
        <div className={ui.cardHead}>
          <div>
            <h2 className={ui.cardTitle}>{status === "open" ? "Waiting for review" : status === "actioned" ? "Actioned" : "Dismissed"}</h2>
            <p className={ui.cardSub}>{loading ? "Loading…" : `${total} report${total === 1 ? "" : "s"}`}</p>
          </div>
        </div>
        <ul className={ui.list}>
          {reports.map((report) => (
            <li key={report.id} className={ui.listRow} style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              {report.target.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedImage(report.target.image, 120)} alt="" className={ui.thumb} />
              ) : null}
              <div className={ui.listMain} style={{ minWidth: 220 }}>
                <p className={ui.listTitle}>
                  <StatusPill tone="neutral">{TYPE_LABEL[report.targetType]}</StatusPill>{" "}
                  {report.target.href ? (
                    <Link href={report.target.href} className={ui.linkInline} target="_blank">
                      {report.target.title}
                    </Link>
                  ) : (
                    report.target.title
                  )}
                </p>
                {report.target.detail ? <p className={ui.cellSub}>{report.target.detail}</p> : null}
                <p className={ui.cellSub}>
                  <strong>{reasonLabel(report.reason)}</strong>
                  {report.details ? ` — “${report.details}”` : ""}
                </p>
                <p className={ui.cellSub}>
                  Reported by {report.reporter ?? "a deleted account"} · {formatDateTime(report.createdAt)}
                  {report.reportCount > 1 ? ` · ${report.reportCount} reports on this item` : ""}
                </p>
                {report.status !== "open" ? (
                  <p className={ui.cellSub}>
                    {report.status === "actioned" ? "Actioned" : "Dismissed"} {formatDateTime(report.resolvedAt)}
                    {report.resolutionNote ? ` — ${report.resolutionNote}` : ""}
                  </p>
                ) : null}
              </div>
              {report.status === "open" ? (
                <div className={ui.stack} style={{ minWidth: 240, flex: "0 1 300px" }}>
                  <input
                    className={ui.input}
                    placeholder="Note (optional)"
                    maxLength={500}
                    value={notes[report.id] ?? ""}
                    aria-label="Note for this decision"
                    onChange={(e) => setNotes((current) => ({ ...current, [report.id]: e.target.value }))}
                  />
                  <div className={ui.rowActions}>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === report.id || !report.target.exists}
                      onClick={() => void resolve(report, "remove")}
                    >
                      {REMOVE_LABEL[report.targetType]}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === report.id}
                      onClick={() => void resolve(report, "dismiss")}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
          {!loading && reports.length === 0 ? (
            <li className={ui.emptyCell} style={{ padding: 24 }}>
              {status === "open" ? "No open reports. Nothing needs attention." : "Nothing here yet."}
            </li>
          ) : null}
        </ul>
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
