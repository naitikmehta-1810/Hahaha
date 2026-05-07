import { NextResponse } from "next/server";
import { randomBytes, scryptSync } from "node:crypto";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";

type SignupBody = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export async function POST(request: Request) {
  let body: SignupBody;

  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!fullName || !email || !password || !confirmPassword) {
    return NextResponse.json(
      { error: "All signup fields are required." },
      { status: 400 },
    );
  }

  if (!emailPattern.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters long." },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match." },
      { status: 400 },
    );
  }

  const passwordHash = hashPassword(password);
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      {
        error:
          "Server configuration is missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("users").insert({
    full_name: fullName,
    email,
    password_hash: passwordHash,
  });

  if (error) {
    const isDuplicateEmail =
      error.code === "23505" ||
      error.message.toLowerCase().includes("users_email_key") ||
      error.message.toLowerCase().includes("duplicate key");

    if (isDuplicateEmail) {
      return NextResponse.json(
        { error: "This email is already registered." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { message: "Account created successfully." },
    { status: 201 },
  );
}
