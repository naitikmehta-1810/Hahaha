import { apiRequest } from "./api-client";

/* ── Reports ─────────────────────────────────────────────────────────────── */

export type ReportTargetType = "product" | "review" | "shop" | "question" | "message";

export const REPORT_REASONS: Array<{ value: string; label: string; hint?: string }> = [
  { value: "counterfeit", label: "Counterfeit or not as described", hint: "A copy, or not what the listing says" },
  { value: "misleading", label: "Misleading or false claims" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "offensive", label: "Offensive or abusive" },
  { value: "scam", label: "Looks like a scam" },
  { value: "spam", label: "Spam" },
  { value: "copyright", label: "Copies someone else's work" },
  { value: "other", label: "Something else" },
];

export function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}) {
  return apiRequest<{ ok: true; alreadyReported: boolean }>("POST", "/api/reports", { body: input });
}

/* ── Product questions ───────────────────────────────────────────────────── */

export type ProductQuestion = {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  answer: string;
  answeredAt: string;
  shopName: string | null;
};

export type PendingQuestion = { id: string; question: string; askedAt: string };

export type QuestionPage = {
  page: number;
  pageSize: number;
  total: number;
  questions: ProductQuestion[];
  pending: PendingQuestion[];
};

export function fetchQuestions(productId: string, page = 1) {
  return apiRequest<QuestionPage>(
    "GET",
    `/api/questions?productId=${encodeURIComponent(productId)}&page=${page}&pageSize=5`,
    { skipRefresh: true }
  );
}

export function askQuestion(productId: string, question: string) {
  return apiRequest<{ question: PendingQuestion }>("POST", "/api/questions", {
    body: { productId, question },
  });
}

export function withdrawQuestion(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/questions/${id}`);
}

/* ── Messages ────────────────────────────────────────────────────────────── */

export type MessageSide = "buyer" | "seller";

export type ConversationSummary = {
  id: string;
  counterpart: { name: string; avatarUrl: string | null; shopSlug: string | null };
  product: { id: string; title: string; slug: string; thumbnailUrl: string | null } | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unread: number;
  blockedByMe: boolean;
  blockedByThem: boolean;
};

export type ThreadMessage = {
  id: string;
  side: MessageSide;
  mine: boolean;
  body: string;
  createdAt: string;
};

export type Thread = {
  conversation: ConversationSummary | null;
  hasMore: boolean;
  nextBefore: string | null;
  messages: ThreadMessage[];
};

export const MESSAGE_MAX_CHARS = 1000;

export function fetchConversations(as: MessageSide) {
  return apiRequest<{ conversations: ConversationSummary[] }>("GET", `/api/messages/conversations?as=${as}`, {
    skipRefresh: true,
  });
}

export function fetchThread(id: string, before?: string | null) {
  const qs = before ? `?before=${encodeURIComponent(before)}` : "";
  return apiRequest<Thread>("GET", `/api/messages/conversations/${id}${qs}`, { skipRefresh: true });
}

export function startConversation(input: { shopSlug: string; productId?: string | null; body: string }) {
  return apiRequest<{ conversationId: string; message: ThreadMessage }>("POST", "/api/messages/conversations", {
    body: input,
  });
}

export function sendThreadMessage(id: string, body: string) {
  return apiRequest<{ message: ThreadMessage }>("POST", `/api/messages/conversations/${id}/messages`, {
    body: { body },
  });
}

export function setConversationBlocked(id: string, blocked: boolean) {
  return apiRequest<{ blocked: boolean }>(blocked ? "PUT" : "DELETE", `/api/messages/conversations/${id}/block`, {
    body: blocked ? {} : undefined,
  });
}

export function fetchUnreadMessages() {
  return apiRequest<{ buyer: number; seller: number; total: number }>("GET", "/api/messages/unread", {
    skipRefresh: true,
  });
}

/* ── Seller community inbox ──────────────────────────────────────────────── */

export type CommunitySummary = {
  unrepliedReviews: number;
  unansweredQuestions: number;
  unreadMessages: number;
};

export function fetchCommunitySummary() {
  return apiRequest<CommunitySummary>("GET", "/api/seller/community/summary", { skipRefresh: true });
}

export type SellerReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author: string;
  createdAt: string;
  images: string[];
  reply: string | null;
  repliedAt: string | null;
  product: { id: string; title: string; slug: string };
};

export type SellerQuestion = {
  id: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  askedBy: string;
  createdAt: string;
  product: { id: string; title: string; slug: string };
};

export type InboxPage<T> = {
  page: number;
  pageSize: number;
  counts: { total: number; pending: number };
} & T;

export function fetchSellerReviews(filter: "pending" | "all", page = 1) {
  return apiRequest<InboxPage<{ reviews: SellerReview[] }>>(
    "GET",
    `/api/seller/reviews?filter=${filter}&page=${page}`
  );
}

export function replyToReview(id: string, body: string) {
  return apiRequest<{ reply: string; repliedAt: string }>("PUT", `/api/seller/reviews/${id}/reply`, {
    body: { body },
  });
}

export function deleteReviewReply(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/seller/reviews/${id}/reply`);
}

export function fetchSellerQuestions(filter: "pending" | "all", page = 1) {
  return apiRequest<InboxPage<{ questions: SellerQuestion[] }>>(
    "GET",
    `/api/seller/questions?filter=${filter}&page=${page}`
  );
}

export function answerQuestion(id: string, body: string) {
  return apiRequest<{ answer: string; answeredAt: string }>("PUT", `/api/seller/questions/${id}/answer`, {
    body: { body },
  });
}

export function removeQuestion(id: string) {
  return apiRequest<{ ok: true }>("DELETE", `/api/seller/questions/${id}`);
}
