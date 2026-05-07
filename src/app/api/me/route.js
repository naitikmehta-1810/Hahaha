import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";
export async function GET(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({
        user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
        },
    }, { status: 200 });
}
