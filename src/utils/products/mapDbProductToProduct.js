export const mapDbProductToProduct = (item) => ({
    id: item.id,
    title: item.name,
    reviews: 0,
    price: Number(item.price),
    discountedPrice: Number(item.price),
    category: item.category,
    description: item.description,
    stock: item.stock,
    status: item.status,
    imgs: {
        thumbnails: [item.image_url],
        previews: [item.image_url],
    },
});
