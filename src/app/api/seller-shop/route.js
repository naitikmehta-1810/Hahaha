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
    const category = cleanText(body.category) || "Handmade";
    const ownerName = cleanText(body.ownerName) || user.full_name || storeName;
    const email = cleanText(body.email) || user.email;
    const phone = cleanText(body.phone);
    const addressLine1 = cleanText(body.addressLine1) || "Address will be updated soon.";
    const city = cleanText(body.city) || "Mumbai";
    const state = cleanText(body.state) || "Maharashtra";
    const pincode = cleanText(body.pincode) || "400001";
    const country = cleanText(body.country) || "India";
    const razorpayAccountId = cleanText(body.razorpayAccountId) || "pending-setup";
    const logoUrl = cleanText(body.logoUrl) || "/images/users/user-01.jpg";
    const bannerUrl = cleanText(body.bannerUrl) || "/images/sellers/sellers-06.png";
    const description = cleanText(body.description) || `Seller shop for ${storeName || "your brand"}.`;

    const requiredFields = [
        [storeName, "Store name"],
        [phone, "Phone"],
        [email, "Email"],
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
        category,
        owner_name: ownerName,
        email,
        phone,
        address_line1: addressLine1,
        address_line2: cleanText(body.addressLine2),
        city,
        state,
        pincode,
        country,
        pickup_same_as_store: (_a = body.pickupSameAsStore) !== null && _a !== void 0 ? _a : true,
        razorpay_account_id: razorpayAccountId,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        description,
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
