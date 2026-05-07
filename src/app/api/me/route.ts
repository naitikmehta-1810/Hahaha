import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/utils/auth/session";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const tokenMatch = cookieHeader.match(
    new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]+)`),
  );
  const sessionToken = tokenMatch?.[1];

  if (!sessionToken) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  let payload: { userId: string; exp: number } | null = null;
  try {
    payload = verifySessionToken(decodeURIComponent(sessionToken));
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("id", payload.userId)
    .maybeSingle();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
      },
    },
    { status: 200 },
  );
}
