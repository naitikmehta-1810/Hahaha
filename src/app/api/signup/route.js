import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { hashPassword } from "@/utils/auth/password";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function POST(request) {
    var _a, _b, _c, _d;
    let body;
    try {
        body = (await request.json());
    }
    catch (_e) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const fullName = (_a = body.fullName) === null || _a === void 0 ? void 0 : _a.trim();
    const email = (_b = body.email) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase();
    const password = (_c = body.password) !== null && _c !== void 0 ? _c : "";
    const confirmPassword = (_d = body.confirmPassword) !== null && _d !== void 0 ? _d : "";
    if (!fullName || !email || !password || !confirmPassword) {
        return NextResponse.json({ error: "All signup fields are required." }, { status: 400 });
    }
    if (!emailPattern.test(email)) {
        return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters long." }, { status: 400 });
    }
    if (password !== confirmPassword) {
        return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }
    const passwordHash = hashPassword(password);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({
            error: "Server configuration is missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        }, { status: 500 });
    }
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("users").insert({
        full_name: fullName,
        email,
        password_hash: passwordHash,
    });
    if (error) {
        const isDuplicateEmail = error.code === "23505" ||
            error.message.toLowerCase().includes("users_email_key") ||
            error.message.toLowerCase().includes("duplicate key");
        if (isDuplicateEmail) {
            return NextResponse.json({ error: "This email is already registered." }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: "Account created successfully." }, { status: 201 });
}
