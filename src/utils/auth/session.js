import { createHmac, timingSafeEqual } from "node:crypto";
export const SESSION_COOKIE_NAME = "stuffsy_session";
export const SESSION_DURATION_DAYS = 7;
const getSessionSecret = () => {
    var _a;
    const secret = (_a = process.env.AUTH_SESSION_SECRET) !== null && _a !== void 0 ? _a : process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
        throw new Error("Missing session secret. Set AUTH_SESSION_SECRET (recommended) or SUPABASE_SERVICE_ROLE_KEY.");
    }
    return secret;
};
const toBase64Url = (value) => Buffer.from(value).toString("base64url");
const sign = (value) => {
    const secret = getSessionSecret();
    return createHmac("sha256", secret).update(value).digest("base64url");
};
export const createSessionToken = (userId) => {
    const payload = {
        userId,
        exp: getSessionExpiryDate().getTime(),
    };
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
};
export const verifySessionToken = (token) => {
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
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
        if (!payload.userId || !payload.exp || payload.exp <= Date.now()) {
            return null;
        }
        return payload;
    }
    catch (_a) {
        return null;
    }
};
export const getSessionExpiryDate = () => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
    return expiresAt;
};
