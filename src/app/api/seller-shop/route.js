import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";

const createSlug = (value, fallbackId) => {
    const base = value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    return `${base || "shop"}-${fallbackId.slice(0, 8)}`;
};

export async function POST(request) {
    var _a, _b, _c, _d, _e, _f;
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    }
    catch (_h) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const storeName = (_a = body.storeName) === null || _a === void 0 ? void 0 : _a.trim();
    const category = (_b = body.category) === null || _b === void 0 ? void 0 : _b.trim();
    const phone = (_c = body.phone) === null || _c === void 0 ? void 0 : _c.trim();
    const city = (_d = body.city) === null || _d === void 0 ? void 0 : _d.trim();
    const state = (_e = body.state) === null || _e === void 0 ? void 0 : _e.trim();
    const description = (_f = body.description) === null || _f === void 0 ? void 0 : _f.trim();

    if (!storeName) {
        return NextResponse.json({ error: "Store name is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: existingSeller, error: existingError } = await supabase
        .from("sellers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

    if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existingSeller) {
        if (!user.is_seller) {
            const { error: updateUserError } = await supabase
                .from("users")
                .update({ is_seller: true })
                .eq("id", user.id);
            if (updateUserError) {
                return NextResponse.json({ error: updateUserError.message }, { status: 500 });
            }
        }
        return NextResponse.json({ seller: existingSeller }, { status: 200 });
    }

    const { data: seller, error: sellerError } = await supabase
        .from("sellers")
        .insert({
        user_id: user.id,
        store_name: storeName,
        store_slug: createSlug(storeName, user.id),
        category: category || null,
        owner_name: user.full_name,
        email: user.email,
        phone: phone || null,
        city: city || null,
        state: state || null,
        description: description || null,
        verification_status: "pending",
        is_active: true,
    })
        .select("*")
        .single();

    if (sellerError) {
        return NextResponse.json({ error: sellerError.message }, { status: 500 });
    }

    const { error: updateUserError } = await supabase
        .from("users")
        .update({ is_seller: true, updated_at: new Date().toISOString() })
        .eq("id", user.id);

    if (updateUserError) {
        return NextResponse.json({ error: updateUserError.message }, { status: 500 });
    }

    return NextResponse.json({ seller, isSeller: true }, { status: 201 });
}
