"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Notice from "@/components/ui/Notice/Notice";
import { apiRequest } from "@/utils/api-client";
import ui from "@/components/console/console.module.css";

type Insights = {
  days: number;
  totals: { searches: number; searchers: number; zeroResultRate: number; correctedRate: number };
  topSearches: Array<{ term: string; searches: number; searchers: number; avgResults: number }>;
  zeroResultSearches: Array<{ term: string; searches: number; lastSearchedAt: string }>;
};

const WINDOWS = [7, 30, 90] as const;

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

/**
 * What buyers search for. Zero-result searches are the useful part: each one
 * is demand the catalogue doesn't meet yet (a missing product, a word sellers
 * don't use in titles or tags, or a misspelling worth a synonym).
 */
export default function AdminSearchInsightsPage() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (window: number) => {
    setLoading(true);
    const result = await apiRequest<Insights>("GET", `/api/admin/search-insights?days=${window}`);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not load search insights.");
    } else {
      setError(null);
      setData(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const metrics = data
    ? [
        { label: "Searches", value: data.totals.searches.toLocaleString("en-IN"), hint: `Last ${data.days} days` },
        { label: "Searchers", value: data.totals.searchers.toLocaleString("en-IN"), hint: "Distinct visitors" },
        { label: "No results", value: `${data.totals.zeroResultRate}%`, hint: "Of all searches" },
        { label: "Auto-corrected", value: `${data.totals.correctedRate}%`, hint: "Typos fixed for the buyer" },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Search insights"
        description="What buyers look for, and which searches find nothing: products to add, or words to use in titles and tags."
      />

      <div className={ui.toolbar} role="group" aria-label="Time window">
        {WINDOWS.map((window) => (
          <button
            key={window}
            type="button"
            className={ui.cardLink}
            aria-pressed={days === window}
            style={days === window ? { fontWeight: 800, textDecoration: "underline" } : undefined}
            onClick={() => setDays(window)}
          >
            Last {window} days
          </button>
        ))}
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {metrics.length > 0 ? (
        <div className={ui.metrics}>
          {metrics.map((metric) => (
            <div key={metric.label} className={ui.metric}>
              <div className={ui.metricTop}>
                <span className={ui.metricLabel}>{metric.label}</span>
              </div>
              <span className={ui.metricValue}>{metric.value}</span>
              <span className={ui.metricHint}>{metric.hint}</span>
            </div>
          ))}
        </div>
      ) : null}

      <section className={`${ui.card} ${ui.cardFlush}`} aria-labelledby="zero-title">
        <div className={ui.cardHead}>
          <div>
            <h2 id="zero-title" className={ui.cardTitle}>
              Searches with no results
            </h2>
            <p className={ui.cardSub}>Demand the catalogue doesn&apos;t meet yet. Most-searched first.</p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Search</th>
                <th className={ui.num}>Times searched</th>
                <th className={ui.num}>Last searched</th>
              </tr>
            </thead>
            <tbody>
              {(data?.zeroResultSearches ?? []).map((row) => (
                <tr key={row.term}>
                  <td className={ui.cellPrimary}>{row.term}</td>
                  <td className={ui.num}>{row.searches}</td>
                  <td className={ui.num}>{dateFormat.format(new Date(row.lastSearchedAt))}</td>
                </tr>
              ))}
              {!loading && data && data.zeroResultSearches.length === 0 ? (
                <tr>
                  <td colSpan={3} className={ui.emptyCell}>
                    Every search found something in this period.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={3} className={ui.emptyCell}>
                    Loading…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${ui.card} ${ui.cardFlush}`} aria-labelledby="top-title">
        <div className={ui.cardHead}>
          <div>
            <h2 id="top-title" className={ui.cardTitle}>
              Top searches
            </h2>
            <p className={ui.cardSub}>The words buyers use most. Open one to see what they find.</p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Search</th>
                <th className={ui.num}>Searches</th>
                <th className={ui.num}>Visitors</th>
                <th className={ui.num}>Avg. results</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topSearches ?? []).map((row) => (
                <tr key={row.term}>
                  <td>
                    <Link className={ui.cellPrimary} href={`/shop?search=${encodeURIComponent(row.term)}`}>
                      {row.term}
                    </Link>
                  </td>
                  <td className={ui.num}>{row.searches}</td>
                  <td className={ui.num}>{row.searchers}</td>
                  <td className={ui.num}>{row.avgResults}</td>
                </tr>
              ))}
              {!loading && data && data.topSearches.length === 0 ? (
                <tr>
                  <td colSpan={4} className={ui.emptyCell}>
                    No searches recorded in this period yet.
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
