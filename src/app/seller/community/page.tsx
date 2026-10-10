"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Inbox from "@/components/community/Inbox";
import { QuestionsPanel, ReviewsPanel } from "@/components/community/SellerInboxPanels";
import { fetchCommunitySummary, type CommunitySummary } from "@/utils/community";
import ui from "@/components/console/console.module.css";
import styles from "@/components/community/Community.module.css";

type TabKey = "messages" | "reviews" | "questions";

const TABS: Array<{ key: TabKey; label: string; badge: (s: CommunitySummary) => number }> = [
  { key: "messages", label: "Messages", badge: (s) => s.unreadMessages },
  { key: "reviews", label: "Reviews", badge: (s) => s.unrepliedReviews },
  { key: "questions", label: "Questions", badge: (s) => s.unansweredQuestions },
];

function isTab(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default function SellerCommunityPage() {
  return (
    <Suspense fallback={<p className={ui.muted}>Loading…</p>}>
      <CommunityContent />
    </Suspense>
  );
}

function CommunityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params?.get("tab") ?? null;
  const tab: TabKey = isTab(requested) ? requested : "messages";
  const conversationId = params?.get("c") ?? null;
  const [summary, setSummary] = useState<CommunitySummary | null>(null);

  const refreshSummary = useCallback(() => {
    void fetchCommunitySummary().then((result) => {
      if (result.data) setSummary(result.data);
    });
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  return (
    <>
      <PageHeader
        title="Community"
        description="Talk with buyers, answer questions about your pieces and reply to reviews."
      />
      <div className={styles.tabs} role="tablist" aria-label="Community">
        {TABS.map((item) => {
          const count = summary ? item.badge(summary) : 0;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={`${styles.tab} ${tab === item.key ? styles.tabActive : ""}`}
              onClick={() => router.replace(`/seller/community?tab=${item.key}`, { scroll: false })}
            >
              {item.label}
              {count > 0 ? <span className={styles.tabCount}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "messages" ? (
        <Inbox as="seller" initialConversationId={conversationId} onUnreadChange={refreshSummary} />
      ) : null}
      {tab === "reviews" ? <ReviewsPanel onChanged={refreshSummary} /> : null}
      {tab === "questions" ? <QuestionsPanel onChanged={refreshSummary} /> : null}
    </>
  );
}
