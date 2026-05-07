import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";
import { hashPassword, verifyPassword } from "@/utils/auth/password";

type PasswordBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: PasswordBody;
  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  const confirmNewPassword = body.confirmNewPassword ?? "";

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return NextResponse.json(
      { error: "All password fields are required." },
      { status: 400 },
    );
  }

  if (!verifyPassword(currentPassword, user.password_hash)) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 },
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters long." },
      { status: 400 },
    );
  }

  if (newPassword !== confirmNewPassword) {
    return NextResponse.json(
      { error: "New password and confirmation do not match." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ password_hash: hashPassword(newPassword) })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Password updated." }, { status: 200 });
}
