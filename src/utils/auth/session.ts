import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "stuffsy_session";
export const SESSION_DURATION_DAYS = 7;

type SessionPayload = {
  userId: string;
  exp: number;
};

const getSessionSecret = () => {
  const secret = process.env.AUTH_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "Missing session secret. Set AUTH_SESSION_SECRET (recommended) or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return secret;
};

const toBase64Url = (value: string) => Buffer.from(value).toString("base64url");

const sign = (value: string) => {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(value).digest("base64url");
};

export const createSessionToken = (userId: string) => {
  const payload: SessionPayload = {
    userId,
    exp: getSessionExpiryDate().getTime(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifySessionToken = (token: string): SessionPayload | null => {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8"),
    ) as SessionPayload;
    if (!payload.userId || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const getSessionExpiryDate = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  return expiresAt;
};
