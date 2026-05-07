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

const cleanText = (value) => value?.trim() || null;
const cleanSlug = (value) => {
    const slug = value
        ?.toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || null;
};

export async function POST(request) {
    var _a;
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

    const storeName = cleanText(body.storeName);
    const storeSlug = cleanSlug(body.storeSlug);

    const requiredFields = [
        [storeName, "Store name"],
        [storeSlug, "Store slug"],
        [cleanText(body.category), "Category"],
        [cleanText(body.ownerName), "Owner name"],
        [cleanText(body.email), "Email"],
        [cleanText(body.phone), "Phone"],
        [cleanText(body.addressLine1), "Address line 1"],
        [cleanText(body.city), "City"],
        [cleanText(body.state), "State"],
        [cleanText(body.pincode), "Pincode"],
        [cleanText(body.country), "Country"],
        [cleanText(body.razorpayAccountId), "Razorpay account ID"],
        [cleanText(body.logoUrl), "Logo URL"],
        [cleanText(body.bannerUrl), "Banner URL"],
        [cleanText(body.description), "Description"],
    ];
    const missingField = requiredFields.find(([value]) => !value);
    if (missingField) {
        return NextResponse.json({ error: `${missingField[1]} is required.` }, { status: 400 });
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
        store_slug: storeSlug || createSlug(storeName, user.id),
        category: cleanText(body.category),
        owner_name: cleanText(body.ownerName) || user.full_name,
        email: cleanText(body.email) || user.email,
        phone: cleanText(body.phone),
        address_line1: cleanText(body.addressLine1),
        address_line2: cleanText(body.addressLine2),
        city: cleanText(body.city),
        state: cleanText(body.state),
        pincode: cleanText(body.pincode),
        country: cleanText(body.country) || "India",
        pickup_same_as_store: (_a = body.pickupSameAsStore) !== null && _a !== void 0 ? _a : true,
        razorpay_account_id: cleanText(body.razorpayAccountId),
        logo_url: cleanText(body.logoUrl),
        banner_url: cleanText(body.bannerUrl),
        description: cleanText(body.description),
        verification_status: "pending",
        is_active: true,
    })
        .select("*")
        .single();

    if (sellerError) {
        if (sellerError.code === "23505") {
            return NextResponse.json({ error: "That store slug is already taken. Please choose another one." }, { status: 409 });
        }
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
