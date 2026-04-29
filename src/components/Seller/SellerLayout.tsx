"use client";

import Breadcrumb from "@/components/Common/Breadcrumb";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

type SellerLayoutProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

const navItems = [
  { label: "Dashboard", href: "/seller" },
  { label: "All Products", href: "/seller/products" },
  { label: "Add Product", href: "/seller/add-product" },
  { label: "Analytics", href: "/seller/analytics" },
];

const SellerLayout = ({ title, description, children }: SellerLayoutProps) => {
  const pathname = usePathname();

  return (
    <>
      <Breadcrumb title={"Seller Portal"} pages={["seller", title]} />

      <section className="overflow-hidden py-20 bg-gray-2">
        <div className="max-w-[1170px] w-full mx-auto px-4 sm:px-8 xl:px-0">
          <div className="flex flex-col xl:flex-row gap-7.5">
            <aside className="xl:max-w-[320px] w-full bg-white rounded-xl shadow-1 p-4 sm:p-7.5">
              <h2 className="font-semibold text-dark text-xl mb-6">
                Seller Navigation
              </h2>
              <div className="flex flex-wrap xl:flex-col gap-3">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-md px-4.5 py-3 font-medium ease-out duration-200 ${
                        isActive
                          ? "bg-blue text-white"
                          : "bg-gray-1 text-dark-2 hover:bg-blue hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </aside>

            <div className="w-full bg-white rounded-xl shadow-1 p-4 sm:p-7.5 xl:p-9">
              <h1 className="font-semibold text-dark text-2xl mb-2">{title}</h1>
              <p className="text-custom-sm mb-7">{description}</p>
              {children}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default SellerLayout;

