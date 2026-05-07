"use client";
import React, { useMemo, useState } from "react";
import Breadcrumb from "../Common/Breadcrumb";
import CustomSelect from "./CustomSelect";
import SingleGridItem from "../Shop/SingleGridItem";
import SingleListItem from "../Shop/SingleListItem";
import { useProducts } from "@/hooks/useProducts";
const ShopWithSidebar = () => {
    const [productStyle, setProductStyle] = useState("grid");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const { products } = useProducts();
    const options = useMemo(() => [
        { label: "Latest Products", value: "0" },
        { label: "Best Selling", value: "1" },
        { label: "Old Products", value: "2" },
    ], []);
    const categoryMap = useMemo(() => {
        var _a, _b, _c;
        const map = new Map();
        for (const product of products) {
            map.set((_a = product.category) !== null && _a !== void 0 ? _a : "Uncategorized", ((_c = map.get((_b = product.category) !== null && _b !== void 0 ? _b : "Uncategorized")) !== null && _c !== void 0 ? _c : 0) + 1);
        }
        return map;
    }, [products]);
    const filteredProducts = useMemo(() => {
        if (selectedCategory === "all")
            return products;
        return products.filter((item) => item.category === selectedCategory);
    }, [products, selectedCategory]);
    return (<>
      <Breadcrumb title={"Explore All Products"} pages={["shop", "/", "shop with sidebar"]}/>
      <section className="overflow-hidden relative pb-20 pt-5 lg:pt-20 xl:pt-28 bg-[#f3f4f6]">
        <div className="max-w-[1170px] w-full mx-auto px-4 sm:px-8 xl:px-0">
          <div className="flex gap-7.5">
            <aside className="max-w-[270px] w-full hidden xl:block">
              <div className="bg-white shadow-1 rounded-lg py-4 px-5">
                <h3 className="text-dark font-medium mb-3">Categories</h3>
                <button onClick={() => setSelectedCategory("all")} className={`w-full text-left mb-2 ${selectedCategory === "all" ? "text-blue" : "text-dark"}`}>
                  All ({products.length})
                </button>
                {Array.from(categoryMap.entries()).map(([category, count]) => (<button key={category} onClick={() => setSelectedCategory(category)} className={`w-full text-left mb-2 ${selectedCategory === category ? "text-blue" : "text-dark"}`}>
                    {category} ({count})
                  </button>))}
              </div>
            </aside>

            <div className="xl:max-w-[870px] w-full">
              <div className="rounded-lg bg-white shadow-1 pl-3 pr-2.5 py-2.5 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-4">
                    <CustomSelect options={options}/>
                    <p>
                      Showing <span className="text-dark">{filteredProducts.length}</span>{" "}
                      Products
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button onClick={() => setProductStyle("grid")} aria-label="button for product grid tab" className={`${productStyle === "grid" ? "bg-blue border-blue text-white" : "text-dark bg-gray-1 border-gray-3"} flex items-center justify-center w-10.5 h-9 rounded-[5px] border ease-out duration-200 hover:bg-blue hover:border-blue hover:text-white`}>
                      Grid
                    </button>
                    <button onClick={() => setProductStyle("list")} aria-label="button for product list tab" className={`${productStyle === "list" ? "bg-blue border-blue text-white" : "text-dark bg-gray-1 border-gray-3"} flex items-center justify-center w-10.5 h-9 rounded-[5px] border ease-out duration-200 hover:bg-blue hover:border-blue hover:text-white`}>
                      List
                    </button>
                  </div>
                </div>
              </div>

              {filteredProducts.length === 0 ? (<div className="rounded-lg bg-white shadow-1 p-6 text-dark">
                  No products found for this category.
                </div>) : (<div className={productStyle === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-7.5 gap-y-9"
                : "flex flex-col gap-7.5"}>
                  {filteredProducts.map((item) => productStyle === "grid" ? (<SingleGridItem item={item} key={item.id}/>) : (<SingleListItem item={item} key={item.id}/>))}
                </div>)}
            </div>
          </div>
        </div>
      </section>
    </>);
};
export default ShopWithSidebar;
