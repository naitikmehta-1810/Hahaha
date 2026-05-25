"use client";
import React from "react";
import Link from "next/link";
import { ArrowUp, Mail, Phone, MapPin, ShieldCheck, Heart } from "lucide-react";

const Footer = () => {
  const year = new Date().getFullYear();

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-slate-900 text-slate-300 font-sans border-t border-slate-800">
      {/* Back to Top Bar */}
      <button
        onClick={handleBackToTop}
        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-center py-4 text-xs font-semibold uppercase tracking-wider transition duration-150 flex items-center justify-center gap-1 border-b border-slate-700/50"
      >
        <ArrowUp className="h-4 w-4" />
        Back to top
      </button>

      {/* Main Footer Links */}
      <div className="mx-auto w-full max-w-[1400px] px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          
           {/* Column 1: Get to Know Us */}
           <div>
             <h2 className="text-white text-sm font-extrabold uppercase tracking-wider mb-5">
               Get to Know Us
             </h2>
             <ul className="space-y-4 text-xs">
               <li className="flex gap-3 items-start text-slate-400">
                 <MapPin className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                 <span>About Stuffsy</span>
               </li>
               <li className="flex gap-3 items-center text-slate-400">
                 <Phone className="h-4 w-4 text-amber-500 shrink-0" />
                 <span>Careers</span>
               </li>
               <li className="flex gap-3 items-center text-slate-400">
                 <Mail className="h-4 w-4 text-amber-500 shrink-0" />
                 <span>Press Releases</span>
               </li>
               <li className="flex gap-3 items-center text-slate-400">
                 <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0" />
                 <span>Conditions of Use</span>
               </li>
               <li className="flex gap-3 items-center text-slate-400">
                 <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0" />
                 <span>Privacy Policy</span>
               </li>
             </ul>
           </div>

           {/* Column 2: Connect with Us */}
           <div>
             <h2 className="text-white text-sm font-extrabold uppercase tracking-wider mb-5">
               Connect with Us
             </h2>
             <div className="flex gap-2">
               <a href="#" className="h-8 w-8 rounded-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 transition flex items-center justify-center" aria-label="Facebook">
                 <span className="font-bold text-sm">fb</span>
               </a>
               <a href="#" className="h-8 w-8 rounded-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 transition flex items-center justify-center" aria-label="Twitter">
                 <span className="font-bold text-sm">tw</span>
               </a>
               <a href="#" className="h-8 w-8 rounded-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 transition flex items-center justify-center" aria-label="Instagram">
                 <span className="font-bold text-sm">ig</span>
               </a>
               <a href="#" className="h-8 w-8 rounded-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 transition flex items-center justify-center" aria-label="YouTube">
                 <span className="font-bold text-sm">yt</span>
               </a>
               <a href="#" className="h-8 w-8 rounded-full bg-slate-800 hover:bg-amber-500 hover:text-slate-900 transition flex items-center justify-center" aria-label="Pinterest">
                 <span className="font-bold text-sm">pin</span>
               </a>
             </div>
           </div>

          {/* Column 3: Make Money with Us */}
          <div>
            <h2 className="text-white text-sm font-extrabold uppercase tracking-wider mb-5">
              Sell on Stuffsy
            </h2>
            <ul className="space-y-3 text-xs text-slate-400">
              <li>
                <Link href="/seller/create-shop/step_1" className="hover:text-white hover:underline transition font-semibold text-amber-400">
                  Become a Seller
                </Link>
              </li>
              <li>
                <a href="#" className="hover:text-white hover:underline transition">
                  Advertise Your Products
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white hover:underline transition">
                  Host an Online Boutique
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white hover:underline transition">
                  Seller Policies & Guidelines
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white hover:underline transition">
                  Fulfillment by Stuffsy
                </a>
              </li>
            </ul>
          </div>

           {/* Column 4: Let Us Help You */}
           <div>
             <h2 className="text-white text-sm font-extrabold uppercase tracking-wider mb-5">
               Let Us Help You
             </h2>
             <ul className="space-y-3 text-xs text-slate-400">
               <li>
                 <Link href="/contact" className="hover:text-white hover:underline transition">
                   Contact Us
                 </Link>
               </li>
               <li>
                 <Link href="/contact" className="hover:text-white hover:underline transition">
                   Returns &amp; Refunds
                 </Link>
               </li>
               <li>
                 <Link href="/contact" className="hover:text-white hover:underline transition">
                   Shipping &amp; Delivery
                 </Link>
               </li>
               <li>
                 <Link href="/contact" className="hover:text-white hover:underline transition">
                   Payment Security
                 </Link>
               </li>
               <li>
                 <Link href="/wishlist" className="hover:text-white hover:underline transition">
                   Wishlist Help
                 </Link>
               </li>
               <li>
                 <Link href="/cart" className="hover:text-white hover:underline transition">
                   Order Help
                 </Link>
               </li>
             </ul>
           </div>
        </div>
      </div>

      {/* Security & Copyright Footer */}
      <div className="bg-slate-950 text-slate-500 py-8 px-6 border-t border-slate-800/80">
        <div className="mx-auto w-full max-w-[1400px] flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-center md:text-left">
          
          {/* Left copyright and legal */}
          <div className="space-y-2">
            <p className="text-slate-400">
              &copy; {year} <span className="font-extrabold text-amber-500">stuffsy Inc.</span> or its affiliates. All rights reserved.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 text-slate-500">
              <a href="#" className="hover:text-slate-300 hover:underline">Conditions of Use</a>
              <a href="#" className="hover:text-slate-300 hover:underline">Privacy Policy</a>
              <a href="#" className="hover:text-slate-300 hover:underline">Interest-Based Ads</a>
              <a href="#" className="hover:text-slate-300 hover:underline">Cookies Consent</a>
            </div>
          </div>

          {/* Right Security and Payment options */}
          <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
            <div className="flex items-center gap-3 text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-[11px]">100% Secure Transaction &bull; 256-bit SSL</span>
            </div>
            <div className="flex items-center gap-3 font-bold text-[10px] tracking-widest text-slate-600 uppercase">
              <span>VISA</span>
              <span>MasterCard</span>
              <span>RuPay</span>
              <span>UPI</span>
              <span>Netbanking</span>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
};

export default Footer;
