import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/utils/auth/session";

export type CurrentUser = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
};

export const getCurrentUserFromRequest = async (
  request: Request,
): Promise<CurrentUser | null> => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const tokenMatch = cookieHeader.match(
    new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]+)`),
  );
  const sessionToken = tokenMatch?.[1];

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
    .select("id, full_name, email, password_hash")
    .eq("id", payload.userId)
    .maybeSingle();

  if (error || !user) {
    return null;
  }

  return user;
};
