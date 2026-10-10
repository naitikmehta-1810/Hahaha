"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import ReportButton from "@/components/community/ReportButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  askQuestion,
  fetchQuestions,
  withdrawQuestion,
  type PendingQuestion,
  type ProductQuestion,
} from "@/utils/community";
import { formatDate } from "@/utils/format";
import styles from "./Community.module.css";

const MAX_CHARS = 300;

/** Public Q&A under a product: buyers ask, the maker answers. */
export default function ProductQuestions({
  productId,
  productSlug,
  shopName,
}: {
  productId: string;
  productSlug: string;
  shopName: string;
}) {
  const { isAuthenticated, status } = useAuth();
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const [pending, setPending] = useState<PendingQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(
    async (nextPage: number) => {
      const result = await fetchQuestions(productId, nextPage);
      if (!result.data) return;
      const data = result.data;
      setTotal(data.total);
      setPage(nextPage);
      setQuestions((current) => (nextPage === 1 ? data.questions : [...current, ...data.questions]));
      if (nextPage === 1) setPending(data.pending);
    },
    [productId]
  );

  // Refetch once the session is known so the viewer's own pending questions show up.
  useEffect(() => {
    if (status === "loading") return;
    void load(1).finally(() => setLoading(false));
  }, [load, status, isAuthenticated]);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (question.length < 5) {
      setMessage({ tone: "danger", text: "Ask a bit more, at least 5 characters." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await askQuestion(productId, question);
    setBusy(false);
    if (result.error || !result.data) {
      setMessage({ tone: "danger", text: result.error ?? "Could not send your question." });
      return;
    }
    setDraft("");
    setPending((current) => [result.data!.question, ...current]);
    setMessage({ tone: "success", text: `Sent. ${shopName} will answer here soon.` });
  };

  const withdraw = async (id: string) => {
    const result = await withdrawQuestion(id);
    if (result.error) {
      setMessage({ tone: "danger", text: result.error });
      return;
    }
    setPending((current) => current.filter((item) => item.id !== id));
  };

  const hasMore = questions.length < total;

  return (
    <section className={styles.qa} id="questions" aria-labelledby="questions-title">
      <div className={styles.qaHead}>
        <h2 id="questions-title" className={styles.qaTitle}>
          Questions &amp; answers
        </h2>
        {total > 0 ? (
          <span className={styles.qaCount}>
            {total} answered question{total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {status === "loading" ? null : isAuthenticated ? (
        <form className={styles.ask} onSubmit={(e) => void ask(e)}>
          <label className={styles.field}>
            <span>Ask the maker</span>
            <div className={styles.askRow}>
              <textarea
                rows={2}
                value={draft}
                maxLength={MAX_CHARS}
                placeholder="Size, colours, materials, custom orders…"
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" disabled={busy || draft.trim().length < 5}>
                {busy ? "Sending…" : "Ask"}
              </Button>
            </div>
            <span className={styles.hint}>
              <span>Public once {shopName} answers. For private chats, message the shop.</span>
              <span>
                {draft.length}/{MAX_CHARS}
              </span>
            </span>
          </label>
        </form>
      ) : (
        <div className={styles.ask}>
          <p className={styles.lead}>Have a question about this piece? Ask the maker.</p>
          <div>
            <Button variant="outline" onClick={() => redirectToLogin(`/products/${productSlug}#questions`)}>
              Sign in to ask
            </Button>
          </div>
        </div>
      )}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {pending.length > 0 ? (
        <div className={styles.stack}>
          {pending.map((item) => (
            <div key={item.id} className={styles.pending}>
              <p>
                <strong>Your question:</strong> {item.question}
              </p>
              <div className={styles.byline}>
                <span>Waiting for {shopName} to answer · {formatDate(item.askedAt)}</span>
                <button
                  type="button"
                  className={styles.reportLink}
                  onClick={() => void withdraw(item.id)}
                >
                  Withdraw
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className={styles.lead}>Loading questions…</p>
      ) : questions.length === 0 ? (
        <div className={styles.empty}>
          <MessageCircleQuestion size={22} aria-hidden="true" />
          <p>No answered questions yet. Be the first to ask.</p>
        </div>
      ) : (
        <>
          <ul className={styles.qaList}>
            {questions.map((item) => (
              <li key={item.id} className={styles.qaItem}>
                <div className={styles.qRow}>
                  <span className={styles.badge} aria-hidden="true">
                    Q
                  </span>
                  <div>
                    <p className={styles.qText}>{item.question}</p>
                    <div className={styles.byline}>
                      <span>
                        {item.askedBy} · {formatDate(item.askedAt)}
                      </span>
                      <ReportButton targetType="question" targetId={item.id} />
                    </div>
                  </div>
                </div>
                <div className={styles.aRow}>
                  <span className={`${styles.badge} ${styles.badgeAnswer}`} aria-hidden="true">
                    A
                  </span>
                  <div>
                    <p className={styles.aText}>{item.answer}</p>
                    <div className={styles.byline}>
                      <span>
                        {item.shopName ?? "The maker"} · {formatDate(item.answeredAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {hasMore ? (
            <div>
              <Button
                variant="secondary"
                disabled={loadingMore}
                onClick={() => {
                  setLoadingMore(true);
                  void load(page + 1).finally(() => setLoadingMore(false));
                }}
              >
                {loadingMore ? "Loading…" : `Show more questions (${total - questions.length})`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
