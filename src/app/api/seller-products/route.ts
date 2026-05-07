import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/utils/supabase/admin";
import { SellerProductStatus } from "@/types/sellerProduct";

type CreateProductBody = {
  name?: string;
  category?: string;
  price?: number;
  stock?: number;
  image?: string;
  description?: string;
  status?: SellerProductStatus;
};

const isSellerStatus = (value: string): value is SellerProductStatus =>
  value === "active" || value === "draft" || value === "out-of-stock";

export async function GET() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  let body: CreateProductBody;
  try {
    body = (await request.json()) as CreateProductBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const category = body.category?.trim();
  const description = body.description?.trim();
  const image = body.image?.trim() || "/images/products/product-1-bg-1.png";
  const price = Number(body.price);
  const stock = Number(body.stock);
  const status = body.status ?? "active";

  if (!name || !category || !description) {
    return NextResponse.json(
      { error: "Name, category and description are required." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json(
      { error: "Price must be a valid non-negative number." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(stock) || stock < 0) {
    return NextResponse.json(
      { error: "Stock must be a valid non-negative integer." },
      { status: 400 },
    );
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
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Product id is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Product deleted." }, { status: 200 });
}
