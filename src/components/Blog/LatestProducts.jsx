"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useProducts } from "@/hooks/useProducts";
const LatestProducts = ({ products = [] }) => {
    const { products: sellerProducts } = useProducts();
    const resolvedProducts = sellerProducts.length > 0 ? sellerProducts : products;
    return (<div className="shadow-1 bg-white rounded-xl mt-7.5">
      <div className="px-4 sm:px-6 py-4.5 border-b border-gray-3">
        <h2 className="font-medium text-lg text-dark">Latest Products</h2>
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-6">
          {/* <!-- product item --> */}
          {resolvedProducts.slice(0, 3).map((product, key) => {
            var _a, _b, _c;
            return (<div className="flex items-center gap-6" key={key}>
              <div className="flex items-center justify-center rounded-[10px] bg-gray-3 max-w-[90px] w-full h-22.5">
                <Image src={(_c = (_b = (_a = product.imgs) === null || _a === void 0 ? void 0 : _a.thumbnails) === null || _b === void 0 ? void 0 : _b[0]) !== null && _c !== void 0 ? _c : "/images/products/product-1-sm-1.png"} alt="product" width={74} height={74}/>
              </div>

              <div>
                <h3 className="font-medium text-dark mb-1 ease-out duration-200 hover:text-blue">
                  <Link href="/shop-details"> {product.title} </Link>
                </h3>
                <p className="text-custom-sm">Price: ₹{product.price}</p>
              </div>
            </div>);
        })}
        </div>
      </div>
    </div>);
};
export default LatestProducts;
