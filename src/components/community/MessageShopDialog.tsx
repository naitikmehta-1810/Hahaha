"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import Dialog from "@/components/ui/Dialog/Dialog";
import Notice from "@/components/ui/Notice/Notice";
import { MESSAGE_MAX_CHARS, startConversation } from "@/utils/community";
import styles from "./Community.module.css";

/** Write to a shop. Opens from the shop page and from a product page. */
export default function MessageShopDialog({
  shopSlug,
  shopName,
  productId,
  productTitle,
  onClose,
}: {
  shopSlug: string;
  shopName: string;
  productId?: string | null;
  productTitle?: string | null;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setError("Write a message first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await startConversation({ shopSlug, productId: productId ?? null, body: body.trim() });
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not send your message.");
      return;
    }
    setSentTo(result.data.conversationId);
  };

  return (
    <Dialog title={`Message ${shopName}`} icon={<MessageCircle size={18} />} onClose={onClose}>
      {sentTo ? (
        <>
          <Notice tone="success">
            Sent. {shopName} will reply in your Messages. We&apos;ll notify you when they do.
          </Notice>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <ButtonLink href={`/account?tab=messages&c=${sentTo}`} onClick={onClose}>
              Open conversation
            </ButtonLink>
          </div>
        </>
      ) : (
        <form className={styles.form} onSubmit={(e) => void send(e)}>
          {productTitle ? (
            <p className={styles.lead}>
              About <strong>{productTitle}</strong>
            </p>
          ) : (
            <p className={styles.lead}>Ask about custom orders, materials, or anything else.</p>
          )}
          <label className={styles.field}>
            <span>Your message</span>
            <textarea
              autoFocus
              rows={5}
              value={body}
              maxLength={MESSAGE_MAX_CHARS}
              placeholder="Hi! I'd love to know…"
              onChange={(e) => setBody(e.target.value)}
            />
            <span className={styles.hint}>
              <span>Only you and the shop can see this.</span>
              <span>
                {body.length}/{MESSAGE_MAX_CHARS}
              </span>
            </span>
          </label>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
