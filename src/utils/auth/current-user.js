import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/utils/auth/session";
export const getCurrentUserFromRequest = async (request) => {
    var _a;
    const cookieHeader = (_a = request.headers.get("cookie")) !== null && _a !== void 0 ? _a : "";
    const tokenMatch = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]+)`));
    const sessionToken = tokenMatch === null || tokenMatch === void 0 ? void 0 : tokenMatch[1];
    if (!sessionToken) {
        return null;
    }
    const payload = verifySessionToken(decodeURIComponent(sessionToken));
    if (!payload) {
        return null;
    }
    const supabase = getSupabaseAdminClient();
    const { data: user, error } = await supabase
        .from("users")
        .select("id, full_name, email, password_hash, is_seller")
        .eq("id", payload.userId)
        .maybeSingle();
    if (error || !user) {
        return null;
    }
    return user;
};
