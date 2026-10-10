"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import { Stars } from "@/components/reviews/ProductReviews";
import {
  answerQuestion,
  deleteReviewReply,
  fetchSellerQuestions,
  fetchSellerReviews,
  removeQuestion,
  replyToReview,
  type InboxPage,
  type SellerQuestion,
  type SellerReview,
} from "@/utils/community";
import { formatDate } from "@/utils/format";
import { optimizedImage } from "@/utils/media";
import ui from "@/components/console/console.module.css";
import styles from "./Community.module.css";

type Filter = "pending" | "all";

function FilterTabs({
  filter,
  onChange,
  pending,
  total,
}: {
  filter: Filter;
  onChange: (next: Filter) => void;
  pending: number;
  total: number;
}) {
  return (
    <div className={styles.filterRow} role="tablist" aria-label="Filter">
      <button
        type="button"
        role="tab"
        aria-selected={filter === "pending"}
        className={`${styles.tab} ${filter === "pending" ? styles.tabActive : ""}`}
        onClick={() => onChange("pending")}
      >
        Needs a reply
        {pending > 0 ? <span className={styles.tabCount}>{pending}</span> : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={filter === "all"}
        className={`${styles.tab} ${filter === "all" ? styles.tabActive : ""}`}
        onClick={() => onChange("all")}
      >
        All ({total})
      </button>
    </div>
  );
}

/** One text box with Save / Cancel, used for review replies and question answers. */
function ReplyEditor({
  initial,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setBusy(true);
          setError(null);
          const problem = await onSubmit(body.trim());
          setBusy(false);
          if (problem) setError(problem);
        })();
      }}
    >
      <label className={styles.field}>
        <textarea
          rows={3}
          value={body}
          maxLength={1000}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setBody(e.target.value)}
        />
        <span className={styles.hint}>
          <span />
          <span>{body.length}/1000</span>
        </span>
      </label>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className={styles.actions}>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function usePagedInbox<T>(
  fetcher: (filter: Filter, page: number) => Promise<{ data: InboxPage<T> | null; error: string | null }>,
  pick: (data: InboxPage<T>) => unknown[]
) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [data, setData] = useState<InboxPage<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (nextFilter: Filter, nextPage: number) => {
      setLoading(true);
      const result = await fetcher(nextFilter, nextPage);
      setLoading(false);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not load this list.");
        return;
      }
      setError(null);
      setData(result.data);
      setPage(nextPage);
    },
    [fetcher]
  );

  useEffect(() => {
    void load(filter, 1);
  }, [load, filter]);

  const count = data ? pick(data).length : 0;
  const hasPrev = page > 1;
  const hasNext = data ? count >= data.pageSize : false;
  return { filter, setFilter, data, error, loading, page, reload: () => load(filter, page), load, hasPrev, hasNext };
}

export function ReviewsPanel({ onChanged }: { onChanged?: () => void }) {
  const fetcher = useCallback((filter: Filter, page: number) => fetchSellerReviews(filter, page), []);
  const inbox = usePagedInbox<{ reviews: SellerReview[] }>(fetcher, (d) => d.reviews);
  const [editing, setEditing] = useState<string | null>(null);

  const save = async (id: string, body: string) => {
    const result = await replyToReview(id, body);
    if (result.error) return result.error;
    setEditing(null);
    await inbox.reload();
    onChanged?.();
    return null;
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete your reply? The buyer's review stays.")) return;
    const result = await deleteReviewReply(id);
    if (!result.error) {
      await inbox.reload();
      onChanged?.();
    }
  };

  return (
    <div className={styles.stack}>
      <FilterTabs
        filter={inbox.filter}
        onChange={inbox.setFilter}
        pending={inbox.data?.counts.pending ?? 0}
        total={inbox.data?.counts.total ?? 0}
      />
      {inbox.error ? <Notice tone="danger">{inbox.error}</Notice> : null}
      {inbox.loading && !inbox.data ? <p className={styles.lead}>Loading reviews…</p> : null}
      {inbox.data && inbox.data.reviews.length === 0 ? (
        <div className={styles.empty}>
          <MessageSquareText size={22} aria-hidden="true" />
          <p>
            {inbox.filter === "pending"
              ? "You're all caught up. Every review has a reply."
              : "No reviews yet. They appear here once buyers rate your products."}
          </p>
        </div>
      ) : null}
      {inbox.data?.reviews.map((review) => (
        <article key={review.id} className={styles.card}>
          <div className={styles.cardHead}>
            <span>
              <Stars value={review.rating} size={14} /> · {review.author} · {formatDate(review.createdAt)}
            </span>
            <Link href={`/products/${review.product.slug}#reviews`}>{review.product.title}</Link>
          </div>
          {review.title ? <strong>{review.title}</strong> : null}
          {review.body ? <p className={styles.aText}>{review.body}</p> : null}
          {review.images.length > 0 ? (
            <ul className={styles.thumbs} aria-label="Photos from the buyer">
              {review.images.map((url) => (
                <li key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizedImage(url, 160)} alt="" loading="lazy" />
                </li>
              ))}
            </ul>
          ) : null}

          {editing === review.id || !review.reply ? (
            <ReplyEditor
              key={`${review.id}-${review.reply ?? ""}`}
              initial={review.reply ?? ""}
              placeholder="Write a public reply"
              submitLabel={review.reply ? "Save reply" : "Post reply"}
              onSubmit={(body) => save(review.id, body)}
              onCancel={review.reply ? () => setEditing(null) : undefined}
            />
          ) : (
            <div className={styles.replyBox}>
              <strong>Your reply · {formatDate(review.repliedAt)}</strong>
              <p>{review.reply}</p>
              <div className={ui.rowActions}>
                <Button size="sm" variant="secondary" onClick={() => setEditing(review.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} onClick={() => void remove(review.id)}>
                  Delete
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
      <Pager inbox={inbox} />
    </div>
  );
}

export function QuestionsPanel({ onChanged }: { onChanged?: () => void }) {
  const fetcher = useCallback((filter: Filter, page: number) => fetchSellerQuestions(filter, page), []);
  const inbox = usePagedInbox<{ questions: SellerQuestion[] }>(fetcher, (d) => d.questions);
  const [editing, setEditing] = useState<string | null>(null);

  const save = async (id: string, body: string) => {
    const result = await answerQuestion(id, body);
    if (result.error) return result.error;
    setEditing(null);
    await inbox.reload();
    onChanged?.();
    return null;
  };

  const hide = async (id: string) => {
    if (!window.confirm("Remove this question from the product page?")) return;
    const result = await removeQuestion(id);
    if (!result.error) {
      await inbox.reload();
      onChanged?.();
    }
  };

  return (
    <div className={styles.stack}>
      <FilterTabs
        filter={inbox.filter}
        onChange={inbox.setFilter}
        pending={inbox.data?.counts.pending ?? 0}
        total={inbox.data?.counts.total ?? 0}
      />
      {inbox.error ? <Notice tone="danger">{inbox.error}</Notice> : null}
      {inbox.loading && !inbox.data ? <p className={styles.lead}>Loading questions…</p> : null}
      {inbox.data && inbox.data.questions.length === 0 ? (
        <div className={styles.empty}>
          <MessageSquareText size={22} aria-hidden="true" />
          <p>
            {inbox.filter === "pending"
              ? "No questions waiting. Nice work."
              : "No questions yet. Buyers can ask from any product page."}
          </p>
        </div>
      ) : null}
      {inbox.data?.questions.map((item) => (
        <article key={item.id} className={styles.card}>
          <div className={styles.cardHead}>
            <span>
              {item.askedBy} · {formatDate(item.createdAt)}
            </span>
            <Link href={`/products/${item.product.slug}#questions`}>{item.product.title}</Link>
          </div>
          <strong>{item.question}</strong>
          {editing === item.id || !item.answer ? (
            <ReplyEditor
              key={`${item.id}-${item.answer ?? ""}`}
              initial={item.answer ?? ""}
              placeholder="Write a public answer"
              submitLabel={item.answer ? "Save answer" : "Post answer"}
              onSubmit={(body) => save(item.id, body)}
              onCancel={item.answer ? () => setEditing(null) : undefined}
            />
          ) : (
            <div className={styles.replyBox}>
              <strong>Your answer · {formatDate(item.answeredAt)}</strong>
              <p>{item.answer}</p>
              <div className={ui.rowActions}>
                <Button size="sm" variant="secondary" onClick={() => setEditing(item.id)}>
                  Edit
                </Button>
              </div>
            </div>
          )}
          <div>
            <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} onClick={() => void hide(item.id)}>
              Remove question
            </Button>
          </div>
        </article>
      ))}
      <Pager inbox={inbox} />
    </div>
  );
}

function Pager({
  inbox,
}: {
  inbox: { page: number; hasPrev: boolean; hasNext: boolean; load: (filter: Filter, page: number) => Promise<void>; filter: Filter };
}) {
  if (!inbox.hasPrev && !inbox.hasNext) return null;
  return (
    <div className={styles.filterRow}>
      <Button variant="outline" size="sm" disabled={!inbox.hasPrev} onClick={() => void inbox.load(inbox.filter, inbox.page - 1)}>
        Previous
      </Button>
      <span className={styles.lead}>Page {inbox.page}</span>
      <Button variant="outline" size="sm" disabled={!inbox.hasNext} onClick={() => void inbox.load(inbox.filter, inbox.page + 1)}>
        Next
      </Button>
    </div>
  );
}
