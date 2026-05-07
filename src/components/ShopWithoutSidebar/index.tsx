"use client";
import React, { useMemo, useState } from "react";
import Breadcrumb from "../Common/Breadcrumb";
import SingleGridItem from "../Shop/SingleGridItem";
import SingleListItem from "../Shop/SingleListItem";
import CustomSelect from "../ShopWithSidebar/CustomSelect";
import { useProducts } from "@/hooks/useProducts";

const ShopWithoutSidebar = () => {
  const [productStyle, setProductStyle] = useState("grid");
  const { products } = useProducts();

  const options = useMemo(
    () => [
      { label: "Latest Products", value: "0" },
      { label: "Best Selling", value: "1" },
      { label: "Old Products", value: "2" },
    ],
    [],
  );

  return (
    <>
      <Breadcrumb
        title={"Explore All Products"}
        pages={["shop", "/", "shop without sidebar"]}
      />
      <section className="overflow-hidden relative pb-20 pt-5 lg:pt-20 xl:pt-28 bg-[#f3f4f6]">
        <div className="max-w-[1170px] w-full mx-auto px-4 sm:px-8 xl:px-0">
          <div className="rounded-lg bg-white shadow-1 pl-3 pr-2.5 py-2.5 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-4">
                <CustomSelect options={options} />
                <p>
                  Showing <span className="text-dark">{products.length}</span>{" "}
                  Products
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setProductStyle("grid")}
                  aria-label="button for product grid tab"
                  className={`${productStyle === "grid" ? "bg-blue border-blue text-white" : "text-dark bg-gray-1 border-gray-3"} flex items-center justify-center w-10.5 h-9 rounded-[5px] border ease-out duration-200 hover:bg-blue hover:border-blue hover:text-white`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setProductStyle("list")}
                  aria-label="button for product list tab"
                  className={`${productStyle === "list" ? "bg-blue border-blue text-white" : "text-dark bg-gray-1 border-gray-3"} flex items-center justify-center w-10.5 h-9 rounded-[5px] border ease-out duration-200 hover:bg-blue hover:border-blue hover:text-white`}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="rounded-lg bg-white shadow-1 p-6 text-dark">
              No products yet. Sellers can add products from the seller dashboard.
            </div>
          ) : (
            <div
              className={
                productStyle === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-7.5 gap-y-9"
                  : "flex flex-col gap-7.5"
              }
            >
              {products.map((item) =>
                productStyle === "grid" ? (
                  <SingleGridItem item={item} key={item.id} />
                ) : (
                  <SingleListItem item={item} key={item.id} />
                ),
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default ShopWithoutSidebar;
