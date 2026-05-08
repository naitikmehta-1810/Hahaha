import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserFromRequest } from "@/utils/auth/current-user";

const SHIPPING_COST_BY_METHOD = {
    free: 0,
    fedex: 10.99,
    dhl: 12.5,
};

const toPositiveInt = (value) => {
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
        return null;
    }
    return num;
};

const toAddressObject = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
};

const createOrderNumber = (index) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${timestamp}-${index + 1}-${random}`;
};

const mapOrderForClient = (order) => {
    const items = order.order_items ?? [];
    const firstTitle = items[0]?.product_name ?? "Order Items";
    const remainingCount = Math.max(items.length - 1, 0);
    const title = remainingCount > 0 ? `${firstTitle} +${remainingCount} more` : firstTitle;

    return {
        orderId: order.id,
        orderNumber: order.order_number,
        createdAt: new Date(order.created_at).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }),
        status: order.status,
        total: `₹${Number(order.total_amount).toFixed(2)}`,
        title,
        totalItems: order.total_items,
        paymentStatus: order.payment_status,
    };
};

export async function GET(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const supabase = getSupabaseAdminClient();

    let query = supabase
        .from("orders")
        .select("id, order_number, status, payment_status, total_amount, total_items, created_at, order_items(product_name, quantity, line_total)")
        .order("created_at", { ascending: false });

    if (scope === "seller") {
        if (!user.is_seller) {
            return NextResponse.json({ error: "Seller account required." }, { status: 403 });
        }
        query = query.eq("seller_id", user.id);
    }
    else {
        query = query.eq("buyer_id", user.id);
    }

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: (data ?? []).map(mapOrderForClient) }, { status: 200 });
}

export async function POST(request) {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    }
    catch (_a) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const rawItems = Array.isArray(body.cartItems) ? body.cartItems : [];
    if (rawItems.length === 0) {
        return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    const normalizedCart = [];
    for (const item of rawItems) {
        const id = typeof item?.id === "string" ? item.id : null;
        const quantity = toPositiveInt(item?.quantity);
        if (!id || !quantity) {
            return NextResponse.json({ error: "Invalid cart item payload." }, { status: 400 });
        }
        normalizedCart.push({ id, quantity });
    }

    const paymentMethod = typeof body.paymentMethod === "string" && body.paymentMethod.trim()
        ? body.paymentMethod.trim()
        : "bank";
    const shippingMethod = typeof body.shippingMethod === "string" && body.shippingMethod.trim()
        ? body.shippingMethod.trim()
        : "free";
    const shippingAmount = SHIPPING_COST_BY_METHOD[shippingMethod] ?? 0;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const shippingAddress = toAddressObject(body.shippingAddress);
    const billingAddress = toAddressObject(body.billingAddress);

    const supabase = getSupabaseAdminClient();
    const productIds = [...new Set(normalizedCart.map((item) => item.id))];

    const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, name, category, price, image_url, seller_id, stock, status")
        .in("id", productIds);

    if (productsError) {
        return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    if (productMap.size !== productIds.length) {
        return NextResponse.json({ error: "Some cart products no longer exist." }, { status: 400 });
    }

    const sellerUserIds = new Set();
    const productQuantityMap = new Map();
    const cartWithProducts = [];

    for (const item of normalizedCart) {
        const product = productMap.get(item.id);
        if (!product) {
            return NextResponse.json({ error: "Invalid product in cart." }, { status: 400 });
        }
        if (!product.seller_id) {
            return NextResponse.json({ error: `Seller is missing for product "${product.name}".` }, { status: 400 });
        }
        if (product.status !== "active") {
            return NextResponse.json({ error: `Product "${product.name}" is not available.` }, { status: 409 });
        }

        const currentQty = productQuantityMap.get(product.id) ?? 0;
        const nextQty = currentQty + item.quantity;
        if (nextQty > product.stock) {
            return NextResponse.json({ error: `Insufficient stock for "${product.name}".` }, { status: 409 });
        }

        productQuantityMap.set(product.id, nextQty);
        sellerUserIds.add(product.seller_id);
        cartWithProducts.push({ ...item, product });
    }

    const { data: sellers, error: sellersError } = await supabase
        .from("sellers")
        .select("id, user_id, is_active")
        .in("user_id", [...sellerUserIds]);

    if (sellersError) {
        return NextResponse.json({ error: sellersError.message }, { status: 500 });
    }

    const sellerMap = new Map((sellers ?? []).map((seller) => [seller.user_id, seller]));
    for (const sellerId of sellerUserIds) {
        const seller = sellerMap.get(sellerId);
        if (!seller || seller.is_active === false) {
            return NextResponse.json({ error: "One or more seller accounts are unavailable." }, { status: 409 });
        }
    }

    const groupedBySeller = new Map();
    for (const item of cartWithProducts) {
        const sellerId = item.product.seller_id;
        const sellerItems = groupedBySeller.get(sellerId) ?? [];
        sellerItems.push(item);
        groupedBySeller.set(sellerId, sellerItems);
    }

    const createdOrders = [];
    let index = 0;
    for (const [sellerId, sellerItems] of groupedBySeller.entries()) {
        const subtotal = sellerItems.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
        const totalItems = sellerItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = subtotal + shippingAmount;

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .insert({
            order_number: createOrderNumber(index),
            transaction_id: null,
            seller_id: sellerId,
            buyer_id: user.id,
            status: "pending",
            payment_status: "pending",
            payment_method: paymentMethod,
            currency: "INR",
            subtotal,
            shipping_amount: shippingAmount,
            tax_amount: 0,
            discount_amount: 0,
            total_amount: totalAmount,
            total_items: totalItems,
            shipping_address: shippingAddress,
            billing_address: billingAddress,
            notes,
        })
            .select("id, order_number, status, payment_status, total_amount, total_items, created_at")
            .single();

        if (orderError) {
            return NextResponse.json({ error: orderError.message }, { status: 500 });
        }

        const orderItemsPayload = sellerItems.map((item) => ({
            order_id: order.id,
            product_id: item.product.id,
            product_name: item.product.name,
            product_category: item.product.category,
            product_image_url: item.product.image_url,
            unit_price: Number(item.product.price),
            quantity: item.quantity,
            line_total: Number(item.product.price) * item.quantity,
            product_snapshot: {
                id: item.product.id,
                name: item.product.name,
                category: item.product.category,
                image_url: item.product.image_url,
                seller_id: item.product.seller_id,
            },
        }));

        const { error: orderItemsError } = await supabase.from("order_items").insert(orderItemsPayload);
        if (orderItemsError) {
            return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
        }

        createdOrders.push({
            ...order,
            order_items: orderItemsPayload.map((line) => ({
                product_name: line.product_name,
                quantity: line.quantity,
                line_total: line.line_total,
            })),
        });
        index += 1;
    }

    for (const [productId, orderedQty] of productQuantityMap.entries()) {
        const product = productMap.get(productId);
        const nextStock = Math.max(0, product.stock - orderedQty);
        const nextStatus = nextStock === 0 ? "out-of-stock" : product.status;
        const { error: updateError } = await supabase
            .from("products")
            .update({ stock: nextStock, status: nextStatus })
            .eq("id", productId);
        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
    }

    return NextResponse.json({
        message: "Order placed successfully.",
        orders: createdOrders.map(mapOrderForClient),
    }, { status: 201 });
}
