export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  role: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiResult<T> = {
  data: T | null;
  error: string | null;
  status: number;
  /** Raw JSON body on failure (structured codes, failures[], reason, etc.). */
  errorData?: unknown;
};

type ApiRequestOptions = Omit<RequestInit, "credentials" | "body"> & {
  body?: unknown;
  /**
   * Skip silent refresh + login redirect.
   * Use for login/signup/refresh/health and for the initial /me session probe.
   */
  skipRefresh?: boolean;
};

function getApiBaseUrl() {
  // Browser: same-origin `/api` via Next rewrite (first-party cookies).
  if (typeof window !== "undefined") {
    return "";
  }

  const healthUrl = process.env.NEXT_PUBLIC_BACKEND_HEALTH_URL;
  if (healthUrl) {
    return healthUrl.replace(/\/api\/health\/?$/i, "").replace(/\/$/, "");
  }

  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

/** Prefer calling this at request time; value differs on server vs browser. */
export function apiBaseUrl() {
  return getApiBaseUrl();
}

function messageFromBody(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text || null;
}

export function redirectToLogin(nextPath?: string) {
  if (typeof window === "undefined") {
    return;
  }
  const next = nextPath ?? `${window.location.pathname}${window.location.search}`;
  const target =
    next && next !== "/login" && next !== "/signup"
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";
  if (window.location.pathname !== "/login") {
    window.location.replace(target);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = apiRequest<{ message?: string }>("POST", "/api/auth/refresh", {
      skipRefresh: true,
      body: {},
    })
      .then((result) => result.status < 400 && !result.error)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function apiRequest<T>(
  method: string,
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResult<T>> {
  const { skipRefresh = false, body, headers, ...init } = options;

  const execute = () =>
    fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    let response = await execute();
    let parsed = await parseBody(response);

    if (response.status === 401 && !skipRefresh) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        response = await execute();
        parsed = await parseBody(response);
      } else {
        clearAuthSession();
        redirectToLogin();
        return {
          data: null,
          error: messageFromBody(parsed, "Unauthorized"),
          status: 401,
        };
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error: messageFromBody(parsed, "Something went wrong."),
        status: response.status,
        errorData: parsed,
      };
    }

    return {
      data: (parsed as T) ?? null,
      error: null,
      status: response.status,
    };
  } catch {
    return {
      data: null,
      error:
        "Unable to connect to the backend server. Make sure the API is running on port 4000 (npm run dev:backend).",
      status: 0,
    };
  }
}

type AuthSessionListener = () => void;
const authSessionListeners = new Set<AuthSessionListener>();

export function onAuthSessionCleared(listener: AuthSessionListener) {
  authSessionListeners.add(listener);
  return () => {
    authSessionListeners.delete(listener);
  };
}

export function clearAuthSession() {
  authSessionListeners.forEach((listener) => listener());
}
