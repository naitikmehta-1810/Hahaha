import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";
import { SESSION_COOKIE_NAME } from "@/utils/auth/session";

export async function GET(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        // If session exists but user row is gone, clear the session cookie so client stops treating
        // the session as valid. Return user: null as before.
        const res = NextResponse.json({ user: null }, { status: 200 });
        // Clear cookie by setting an expired Set-Cookie header
        res.headers.set("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly`);
        return res;
    }

    return NextResponse.json({
        user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            isSeller: Boolean(user.is_seller),
        },
    }, { status: 200 });
}
