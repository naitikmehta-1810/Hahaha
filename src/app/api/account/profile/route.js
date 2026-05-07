import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";
export async function GET(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const [firstName = "", ...rest] = user.full_name.trim().split(" ");
    return NextResponse.json({
        profile: {
            firstName,
            lastName: rest.join(" "),
            fullName: user.full_name,
            email: user.email,
        },
    }, { status: 200 });
}
export async function PATCH(request) {
    var _a, _b, _c, _d;
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    let body;
    try {
        body = (await request.json());
    }
    catch (_e) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const firstName = (_b = (_a = body.firstName) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
    const lastName = (_d = (_c = body.lastName) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : "";
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
