import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/utils/auth/session";

export async function POST() {
  const response = NextResponse.json(
    { message: "Signed out successfully." },
    { status: 200 }
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
