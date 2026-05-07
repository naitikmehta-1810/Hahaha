const mapDbProductToSellerProduct = (item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    price: Number(item.price),
    stock: item.stock,
    image: item.image_url,
    description: item.description,
    status: item.status,
    createdAt: item.created_at,
});
export const loadSellerProducts = async () => {
    var _a, _b;
    const response = await fetch("/api/seller-products");
    const data = (await response.json());
    if (!response.ok) {
        throw new Error((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to load products.");
    }
    return ((_b = data.products) !== null && _b !== void 0 ? _b : []).map(mapDbProductToSellerProduct);
};
export const createSellerProduct = async (payload) => {
    var _a;
    const response = await fetch("/api/seller-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const data = (await response.json());
    if (!response.ok) {
        throw new Error((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to create product.");
    }
    if (!data.product) {
        throw new Error("Product was not returned by the server.");
    }
    return mapDbProductToSellerProduct(data.product);
};
export const deleteSellerProduct = async (id) => {
    var _a;
    const response = await fetch(`/api/seller-products?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
    const data = (await response.json());
    if (!response.ok) {
        throw new Error((_a = data.error) !== null && _a !== void 0 ? _a : "Failed to delete product.");
    }
};
