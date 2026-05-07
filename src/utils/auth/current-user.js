import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/utils/auth/session";

const syncUserSellerStatus = async (supabase, user) => {
    const { data: seller, error: sellerError } = await supabase
        .from("sellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (sellerError) {
        return user;
    }

    const hasSellerProfile = Boolean(seller);
    if (Boolean(user.is_seller) === hasSellerProfile) {
        return user;
    }

    const { error: updateError } = await supabase
        .from("users")
        .update({ is_seller: hasSellerProfile, updated_at: new Date().toISOString() })
        .eq("id", user.id);

    if (updateError) {
        return user;
    }

    return { ...user, is_seller: hasSellerProfile };
};

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
    return syncUserSellerStatus(supabase, user);
};
