"use client";

import React, { useState, useMemo } from "react";
import { Filter as FilterIcon, ChevronDown, Star, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./shop.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import ProductCard from "@/components/ui/ProductCard/ProductCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";

export default function ShopPage() {
  const [minPrice, setMinPrice] = useState(149);
  const [maxPrice, setMaxPrice] = useState(2499);
  const [selectedCategory, setSelectedCategory] = useState("All Items");
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(true);

  // Shop Categories
  const categories = [
    { name: "All Items", count: 42 },
    { name: "Wall Hangings", count: 8 },
    { name: "Plant Hangers", count: 6 },
    { name: "Home Decor", count: 10 },
    { name: "Accessories", count: 6 },
    { name: "Gift Sets", count: 4 },
    { name: "New Arrivals", count: 8 },
  ];

  // Star Rating Counts
  const ratingCounts = [
    { rating: 5, count: 42 },
    { rating: 4, count: 28 },
    { rating: 3, count: 14 },
    { rating: 2, count: 6 },
    { rating: 1, count: 2 },
  ];

  // 12 Products for display matching screenshot
  const products = [
    {
      id: "boho-woven",
      title: "Boho Woven Wall Hanging",
      subtitle: "Macrame Magic",
      price: 1599,
      rating: 4.8,
      reviews: 102,
      badge: "Bestseller",
      image: "https://images.unsplash.com/photo-1604995614969-f28bdfc35d4c?w=400&q=80",
      category: "Wall Hangings",
      inStock: true,
    },
    {
      id: "plant-hanger",
      title: "Macrame Plant Hanger",
      subtitle: "Macrame Magic",
      price: 899,
      rating: 4.7,
      reviews: 76,
      image: "https://images.unsplash.com/photo-1559056199-641a0ac8b8d2?w=400&q=80",
      category: "Plant Hangers",
      inStock: true,
    },
    {
      id: "table-lamp",
      title: "Ceramic Table Lamp",
      subtitle: "Macrame Magic",
      price: 1099,
      rating: 4.6,
      reviews: 88,
      image: "https://images.unsplash.com/photo-1565636192335-14f88b7ce338?w=400&q=80",
      category: "Home Decor",
      inStock: true,
    },
    {
      id: "shelf-hanging",
      title: "Macrame Shelf Hanging",
      subtitle: "Macrame Magic",
      price: 1099,
      rating: 4.9,
      reviews: 98,
      badge: "Bestseller",
      image: "https://images.unsplash.com/photo-1595559827260-b39696c3bed0?w=400&q=80",
      category: "Wall Hangings",
      inStock: true,
    },
    {
      id: "bubble-candle",
      title: "Bubble Cube Candle",
      subtitle: "Macrame Magic",
      price: 499,
      rating: 4.7,
      reviews: 98,
      image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=400&q=80",
      category: "Home Decor",
      inStock: false,
    },
    {
      id: "tassel-hanging",
      title: "Beaded Tassel Hanging",
      subtitle: "Macrame Magic",
      price: 349,
      rating: 4.6,
      reviews: 64,
      image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&q=80",
      category: "Wall Hangings",
      inStock: true,
    },
    {
      id: "bottle-holder",
      title: "Macrame Bottle Holder",
      subtitle: "Macrame Magic",
      price: 699,
      rating: 4.8,
      reviews: 52,
      image: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=400&q=80",
      category: "Accessories",
      inStock: true,
    },
    {
      id: "potted-plant",
      title: "Potted Plant with Pot",
      subtitle: "Macrame Magic",
      price: 349,
      rating: 4.5,
      reviews: 39,
      image: "https://images.unsplash.com/photo-1614613535308-eb5fbd8d2c17?w=400&q=80",
      category: "Home Decor",
      inStock: true,
    },
  ];

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = selectedCategory === "All Items" || p.category === selectedCategory;
      const matchesPrice = p.price >= minPrice && p.price <= maxPrice;
      const matchesRating = selectedRating === null || p.rating >= selectedRating;
      const matchesStock = !inStockOnly || p.inStock;
      return matchesCategory && matchesPrice && matchesRating && matchesStock;
    });
  }, [selectedCategory, minPrice, maxPrice, selectedRating, inStockOnly]);

  const handleClearFilters = () => {
    setMinPrice(149);
    setMaxPrice(2499);
    setSelectedCategory("All Items");
    setSelectedRating(null);
    setInStockOnly(false);
  };

  return (
    <div className={styles.container}>
      {/* Breadcrumbs */}
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shops">Shops</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/shops/macrame-magic">Macrame Magic</Breadcrumbs.Item>
        <Breadcrumbs.Item active>All Products</Breadcrumbs.Item>
      </Breadcrumbs>

      {/* Title section */}
      <div className={styles.titleSection}>
        <Heading level={2}>All Products</Heading>
        <div className={styles.controlsRow}>
          <span className={styles.resultsText}>Showing 1–{filteredProducts.length} of {filteredProducts.length} results</span>
          <select className={styles.select} defaultValue="popular">
            <option value="popular">Sort by: Popular</option>
            <option value="low-high">Price: Low to High</option>
            <option value="high-low">Price: High to Low</option>
            <option value="rating">Average Rating</option>
          </select>
          <button className={styles.filterBtn}>
            <FilterIcon size={16} />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        {/* Sidebar Filters */}
        <aside className={styles.sidebar}>
          <div className={styles.filterSection}>
            {/* Categories */}
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Categories</span>
                <ChevronDown size={16} />
              </div>
              <div className={styles.checkboxList}>
                {categories.map((cat, idx) => (
                  <label key={idx} className={styles.checkboxItem}>
                    <span className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedCategory === cat.name}
                        onChange={() => setSelectedCategory(cat.name)}
                      />
                      <span className={selectedCategory === cat.name ? styles.activeText : ""}>
                        {cat.name}
                      </span>
                    </span>
                    <span>({cat.count})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price */}
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Price</span>
                <ChevronDown size={16} />
              </div>
              <input
                type="range"
                min="149"
                max="2499"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className={styles.rangeSlider}
              />
              <div className={styles.priceRangeInputs}>
                <div className={styles.priceInputWrapper}>
                  <span className={styles.priceSymbol}>₹</span>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(Number(e.target.value))}
                    className={styles.priceInput}
                  />
                </div>
                <span className={styles.priceSymbol} style={{ position: "static" }}>
                  –
                </span>
                <div className={styles.priceInputWrapper}>
                  <span className={styles.priceSymbol}>₹</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className={styles.priceInput}
                  />
                </div>
              </div>
            </div>

            {/* Rating */}
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Rating</span>
                <ChevronDown size={16} />
              </div>
              <div className={styles.ratingList}>
                {ratingCounts.map((rc, idx) => (
                  <label
                    key={idx}
                    className={styles.ratingItem}
                    onClick={() => setSelectedRating(rc.rating)}
                  >
                    <span className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedRating === rc.rating}
                        onChange={() => setSelectedRating(rc.rating)}
                      />
                      <span className={styles.stars}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={i < rc.rating ? styles.starFilled : styles.starEmpty}
                          />
                        ))}
                      </span>
                      <span>&amp; up</span>
                    </span>
                    <span>({rc.count})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Availability */}
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupTitle}>
                <span>Availability</span>
                <ChevronDown size={16} />
              </div>
              <div className={styles.checkboxList}>
                <label className={styles.checkboxItem}>
                  <span className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                    />
                    <span>In Stock</span>
                  </span>
                  <span>(42)</span>
                </label>
              </div>
            </div>

            {/* Clear All */}
            <Button
              variant="outline"
              fullWidth
              className={styles.clearBtn}
              onClick={handleClearFilters}
            >
              Clear All Filters
            </Button>
          </div>
        </aside>

        {/* Main Grid */}
        <main className={styles.mainContent}>
          {filteredProducts.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🔍</span>
              <Text size="lg" weight="medium">No products match your filters</Text>
              <Text size="sm" color="muted">Try adjusting the price range, category, or rating filters.</Text>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear All Filters
              </Button>
            </div>
          ) : (
            <>
              <div className={styles.productsGrid}>
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} href={`/products/${product.id}`}>
                    <ProductCard.Image
                      src={product.image}
                      alt={product.title}
                      onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                        const target = e.target as HTMLImageElement;
                        if (product.id === "boho-woven") {
                          target.src =
                            "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=250";
                        } else if (product.id === "plant-hanger") {
                          target.src =
                            "https://images.unsplash.com/photo-1545167622-3a6ac756afa4?auto=format&fit=crop&q=80&w=250";
                        } else if (product.id === "table-lamp") {
                          target.src =
                            "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=250";
                        } else if (product.id === "shelf-hanging") {
                          target.src =
                            "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=250";
                        } else if (product.id === "bubble-candle") {
                          target.src =
                            "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=250";
                        } else if (product.id === "tassel-hanging") {
                          target.src =
                            "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=250";
                        } else if (product.id === "bottle-holder") {
                          target.src =
                            "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=250";
                        } else {
                          target.src =
                            "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&q=80&w=250";
                        }
                      }}
                    >
                      {product.badge && (
                        <ProductCard.Badge>{product.badge}</ProductCard.Badge>
                      )}
                    </ProductCard.Image>
                    <ProductCard.Body>
                      <ProductCard.Title>{product.title}</ProductCard.Title>
                      <ProductCard.Subtitle>{product.subtitle}</ProductCard.Subtitle>
                      <ProductCard.Price amount={product.price} />
                      <ProductCard.Rating rating={product.rating} reviewsCount={product.reviews} />
                    </ProductCard.Body>
                  </ProductCard>
                ))}
              </div>

              {/* Pagination */}
              <div className={styles.pagination}>
                <button className={styles.pageBtn} aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <button className={`${styles.pageBtn} ${styles.activePageBtn}`}>1</button>
                <button className={styles.pageBtn}>2</button>
                <button className={styles.pageBtn}>3</button>
                <button className={styles.pageBtn}>4</button>
                <span className={styles.pageEllipsis}>...</span>
                <button className={styles.pageBtn}>5</button>
                <button className={styles.pageBtn} aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
