import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";

type ProfileBody = {
  firstName?: string;
  lastName?: string;
};

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [firstName = "", ...rest] = user.full_name.trim().split(" ");
  return NextResponse.json(
    {
      profile: {
        firstName,
        lastName: rest.join(" "),
        fullName: user.full_name,
        email: user.email,
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: ProfileBody;
  try {
    body = (await request.json()) as ProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";

  if (!firstName) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Profile updated.", fullName }, { status: 200 });
}
