import React, { memo } from "react";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import {
  productHref,
  productImageUrl,
  type ProductCard as CatalogProduct,
} from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE } from "@/utils/media";
import styles from "../page.module.css";

const SKELETONS = Array.from({ length: 6 }, (_, index) => index);

function swapToFallback(event: React.SyntheticEvent<HTMLImageElement, Event>) {
  (event.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
}

/** `products` is `null` while the list loads; cards rise in one after another. */
function ProductGrid({ products }: { products: CatalogProduct[] | null }) {
  if (products && products.length === 0) {
    return <p className={styles.emptyNote}>Nothing here yet. Check back soon.</p>;
  }
  return (
    <div className={styles.productsGrid} aria-busy={products === null}>
      {products === null
        ? SKELETONS.map((index) => <ProductCard.Skeleton key={index} />)
        : products.map((product, index) => (
            <ProductCard
              key={product.id}
              href={productHref(product)}
              productId={product.id}
              className={styles.productCard}
              style={{ "--i": index } as React.CSSProperties}
            >
              <ProductCard.Image
                src={productImageUrl(product)}
                alt={product.title}
                onError={swapToFallback}
              >
                {product.isBestseller ? <ProductCard.Badge>Bestseller</ProductCard.Badge> : null}
              </ProductCard.Image>
              <ProductCard.Body>
                <ProductCard.Title>{product.title}</ProductCard.Title>
                <ProductCard.Subtitle>{product.shopName}</ProductCard.Subtitle>
                <ProductCard.Price
                  amount={product.price}
                  gstPercent={product.gstPercent}
                  originalAmount={product.compareAtPrice ?? undefined}
                  discountPercentage={product.discountPercent ?? undefined}
                />
                <ProductCard.Rating rating={product.avgRating} reviewsCount={product.reviewCount} />
              </ProductCard.Body>
            </ProductCard>
          ))}
    </div>
  );
}

export default memo(ProductGrid);
