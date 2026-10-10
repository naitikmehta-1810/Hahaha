"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Send } from "lucide-react";
import Button from "@/components/ui/Button/Button";
import Notice from "@/components/ui/Notice/Notice";
import ReportButton from "@/components/community/ReportButton";
import {
  MESSAGE_MAX_CHARS,
  fetchConversations,
  fetchThread,
  sendThreadMessage,
  setConversationBlocked,
  type ConversationSummary,
  type MessageSide,
  type ThreadMessage,
} from "@/utils/community";
import { optimizedImage } from "@/utils/media";
import { formatDate } from "@/utils/format";
import styles from "./Community.module.css";

const LIST_POLL_MS = 30_000;
const THREAD_POLL_MS = 12_000;

function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : formatDate(iso);
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={optimizedImage(url, 96)} alt="" className={styles.avatar} loading="lazy" />
  ) : (
    <span className={styles.avatarFallback} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Runs `callback` every `ms` while the tab is visible, and once when it becomes visible again. */
function useVisiblePolling(callback: () => void, ms: number, enabled = true) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    const timer = window.setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, enabled]);
}

/**
 * Conversation list plus the open thread. `as` says which side the signed-in
 * person is on: "buyer" (their chats with shops) or "seller" (their shop's inbox).
 */
export default function Inbox({
  as,
  initialConversationId,
  onUnreadChange,
}: {
  as: MessageSide;
  initialConversationId?: string | null;
  /** Reports the total unread count after each refresh (for tab badges). */
  onUnreadChange?: (count: number) => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [meta, setMeta] = useState<ConversationSummary | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Held in a ref so an inline callback from the parent never restarts polling.
  const unreadCallback = useRef(onUnreadChange);
  useEffect(() => {
    unreadCallback.current = onUnreadChange;
  }, [onUnreadChange]);

  const loadList = useCallback(async () => {
    const result = await fetchConversations(as);
    if (result.error || !result.data) {
      setListError(result.error ?? "Could not load your messages.");
      setConversations((current) => current ?? []);
      return;
    }
    setListError(null);
    setConversations(result.data.conversations);
    unreadCallback.current?.(result.data.conversations.reduce((sum, item) => sum + item.unread, 0));
  }, [as]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useVisiblePolling(() => void loadList(), LIST_POLL_MS);

  const loadThread = useCallback(
    async (id: string, mode: "open" | "refresh") => {
      if (mode === "open") {
        setThreadLoading(true);
        setThreadError(null);
      }
      const result = await fetchThread(id);
      if (mode === "open") setThreadLoading(false);
      if (result.error || !result.data) {
        if (mode === "open") setThreadError(result.error ?? "Could not open this conversation.");
        return;
      }
      const data = result.data;
      setMeta(data.conversation);
      setNextBefore(data.nextBefore);
      setMessages((current) => {
        // A refresh keeps any older pages already loaded above the newest page.
        if (mode === "open" || current.length === 0) return data.messages;
        const known = new Set(data.messages.map((m) => m.id));
        const older = current.filter((m) => !known.has(m.id) && m.createdAt < (data.messages[0]?.createdAt ?? ""));
        return [...older, ...data.messages];
      });
      // Opening or refreshing a thread marks it read, so reflect that in the list.
      setConversations((current) =>
        current?.map((item) => (item.id === id && item.unread ? { ...item, unread: 0 } : item)) ?? current
      );
    },
    []
  );

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setMeta(null);
      return;
    }
    stickToBottom.current = true;
    void loadThread(activeId, "open");
  }, [activeId, loadThread]);

  useVisiblePolling(() => activeId && void loadThread(activeId, "refresh"), THREAD_POLL_MS, Boolean(activeId));

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const loadOlder = async () => {
    if (!activeId || !nextBefore) return;
    const container = messagesRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    stickToBottom.current = false;
    const result = await fetchThread(activeId, nextBefore);
    if (!result.data) return;
    const older = result.data.messages;
    setNextBefore(result.data.nextBefore);
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      return [...older.filter((m) => !known.has(m.id)), ...current];
    });
    // Keep the reader where they were after older messages are inserted above.
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - previousHeight;
    });
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    setSendError(null);
    const result = await sendThreadMessage(activeId, body);
    setSending(false);
    if (result.error || !result.data) {
      setSendError(result.error ?? "Could not send your message.");
      return;
    }
    stickToBottom.current = true;
    setDraft("");
    setMessages((current) => [...current, { ...result.data!.message, mine: true }]);
    void loadList();
  };

  const toggleBlock = async () => {
    if (!activeId || !meta) return;
    const next = !meta.blockedByMe;
    if (
      next &&
      !window.confirm(
        as === "seller"
          ? "Block this buyer? They won't be able to message your shop until you unblock them."
          : "Block this shop? You won't be able to message each other until you unblock it."
      )
    ) {
      return;
    }
    const result = await setConversationBlocked(activeId, next);
    if (result.error) {
      setSendError(result.error);
      return;
    }
    setMeta({ ...meta, blockedByMe: next });
  };

  if (conversations === null) return <p className={styles.lead}>Loading your messages…</p>;

  const empty =
    as === "buyer"
      ? "No messages yet. Use “Message” on a shop or product page to start a conversation with a maker."
      : "No messages yet. When a buyer writes to your shop, it shows up here.";
  const blocked = meta?.blockedByMe || meta?.blockedByThem;

  return (
    <div className={`${styles.inbox} ${activeId ? styles.inboxThreadOpen : ""}`}>
      <ul className={styles.convList} aria-label="Conversations">
        {listError ? (
          <li style={{ padding: 12 }}>
            <Notice tone="danger">{listError}</Notice>
          </li>
        ) : null}
        {conversations.length === 0 && !listError ? (
          <li className={styles.threadEmpty}>
            <p className={styles.lead}>{empty}</p>
          </li>
        ) : null}
        {conversations.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`${styles.convItem} ${item.id === activeId ? styles.convItemActive : ""}`}
              aria-current={item.id === activeId ? "true" : undefined}
              onClick={() => setActiveId(item.id)}
            >
              <Avatar name={item.counterpart.name} url={item.counterpart.avatarUrl} />
              <span className={styles.convText}>
                <span className={styles.convName}>{item.counterpart.name}</span>
                <span className={styles.convPreview}>{item.lastMessagePreview ?? "No messages"}</span>
              </span>
              <span className={styles.convMeta}>
                <span>{timeLabel(item.lastMessageAt)}</span>
                {item.unread > 0 ? (
                  <span className={styles.unread} aria-label={`${item.unread} unread`}>
                    {item.unread}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className={styles.thread} aria-label="Conversation">
        {!activeId ? (
          <div className={styles.threadEmpty}>
            <p className={styles.lead}>Select a conversation to read it.</p>
          </div>
        ) : threadLoading ? (
          <div className={styles.threadEmpty}>
            <p className={styles.lead}>Opening conversation…</p>
          </div>
        ) : threadError ? (
          <div className={styles.threadEmpty}>
            <Notice tone="danger">{threadError}</Notice>
          </div>
        ) : (
          <>
            <header className={styles.threadHead}>
              <button
                type="button"
                className={styles.threadBack}
                aria-label="Back to conversations"
                onClick={() => setActiveId(null)}
              >
                <ArrowLeft size={18} />
              </button>
              {meta ? <Avatar name={meta.counterpart.name} url={meta.counterpart.avatarUrl} /> : null}
              <div className={styles.threadTitle}>
                <strong>{meta?.counterpart.name ?? "Conversation"}</strong>
                {meta?.product ? (
                  <Link href={`/products/${meta.product.slug}`}>About: {meta.product.title}</Link>
                ) : meta?.counterpart.shopSlug ? (
                  <Link href={`/shops/${meta.counterpart.shopSlug}`}>View shop</Link>
                ) : null}
              </div>
              <div className={styles.threadTools}>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Ban size={14} />}
                  onClick={() => void toggleBlock()}
                  aria-pressed={Boolean(meta?.blockedByMe)}
                >
                  {meta?.blockedByMe ? "Unblock" : "Block"}
                </Button>
              </div>
            </header>

            <div
              className={styles.messages}
              ref={messagesRef}
              onScroll={(event) => {
                const el = event.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              role="log"
              aria-live="polite"
            >
              {nextBefore ? (
                <button type="button" className={styles.loadOlder} onClick={() => void loadOlder()}>
                  Load earlier messages
                </button>
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.bubble} ${message.mine ? styles.bubbleMine : styles.bubbleTheirs}`}
                >
                  {message.body}
                  <span className={styles.bubbleTime}>
                    {timeLabel(message.createdAt)}
                    {!message.mine ? (
                      <>
                        {" · "}
                        <ReportButton targetType="message" targetId={message.id} />
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {blocked ? (
              <p className={styles.blockedNote}>
                {meta?.blockedByMe
                  ? "You've blocked this conversation. Unblock to send messages."
                  : "You can't send messages in this conversation."}
              </p>
            ) : (
              <form className={styles.composer} onSubmit={(e) => void send(e)}>
                <textarea
                  rows={1}
                  value={draft}
                  maxLength={MESSAGE_MAX_CHARS}
                  placeholder="Write a message…"
                  aria-label="Message"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter adds a line.
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(e);
                    }
                  }}
                />
                <Button type="submit" disabled={sending || !draft.trim()} leftIcon={<Send size={15} />}>
                  Send
                </Button>
              </form>
            )}
            {sendError ? (
              <div style={{ padding: "0 16px 12px" }}>
                <Notice tone="danger">{sendError}</Notice>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
