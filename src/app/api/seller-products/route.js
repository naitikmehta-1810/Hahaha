import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";
const isSellerStatus = (value) => value === "active" || value === "draft" || value === "out-of-stock";
export async function GET(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ products: data !== null && data !== void 0 ? data : [] }, { status: 200 });
}
export async function POST(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    var _a, _b, _c, _d, _e;
    let body;
    try {
        body = (await request.json());
    }
    catch (_f) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const name = (_a = body.name) === null || _a === void 0 ? void 0 : _a.trim();
    const category = (_b = body.category) === null || _b === void 0 ? void 0 : _b.trim();
    const description = (_c = body.description) === null || _c === void 0 ? void 0 : _c.trim();
    const image = ((_d = body.image) === null || _d === void 0 ? void 0 : _d.trim()) || "/images/products/product-1-bg-1.png";
    const price = Number(body.price);
    const stock = Number(body.stock);
    const status = (_e = body.status) !== null && _e !== void 0 ? _e : "active";
    if (!name || !category || !description) {
        return NextResponse.json({ error: "Name, category and description are required." }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 400 });
    }
    if (!Number.isInteger(stock) || stock < 0) {
        return NextResponse.json({ error: "Stock must be a valid non-negative integer." }, { status: 400 });
    }
    if (!isSellerStatus(status)) {
        return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from("products")
        .insert({
        name,
        category,
        price,
        stock,
        image_url: image,
        description,
        status,
        seller_id: user.id,
    })
        .select("*")
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ product: data }, { status: 201 });
}
export async function DELETE(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    }
    
    const supabase = getSupabaseAdminClient();
    
    // First, verify the product belongs to the current seller
    const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("seller_id")
        .eq("id", id)
        .maybeSingle();
    
    if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    
    if (!product) {
        return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    
    if (product.seller_id !== user.id) {
        return NextResponse.json({ error: "You do not have permission to delete this product." }, { status: 403 });
    }
    
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: "Product deleted." }, { status: 200 });
}
