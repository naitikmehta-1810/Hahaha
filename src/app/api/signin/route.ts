import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { verifyPassword } from "@/utils/auth/password";
import {
  createSessionToken,
  getSessionExpiryDate,
  SESSION_COOKIE_NAME,
} from "@/utils/auth/session";

type SigninBody = {
  email?: string;
  password?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: SigninBody;

  try {
    body = (await request.json()) as SigninBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  if (!emailPattern.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, full_name, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  let token: string;
  const expiresAt = getSessionExpiryDate();
  try {
    token = createSessionToken(user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create user session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response = NextResponse.json(
    { message: "Signed in successfully.", fullName: user.full_name },
    { status: 200 },
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return response;
}
