"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, ShoppingCart, Search, MapPin, ChevronDown, Menu, User, LogOut, ShoppingBag, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/redux/store";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import {
  USER_DISPLAY_NAME_CHANGED_EVENT,
  clearCachedUserDisplayName,
  getCachedUserDisplayName,
  setCachedUserDisplayName,
} from "@/utils/auth/user-cache";

const Header = () => {
  const router = useRouter();
  const { openCartModal } = useCartModalContext();
  const cartItems = useAppSelector((state) => state.cartReducer.items);
  const [searchQuery, setSearchQuery] = useState("");
  const [signedInUserName, setSignedInUserName] = useState("");
  const [isSeller, setIsSeller] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);
  const [selectedSearchCat, setSelectedSearchCat] = useState("All");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadCurrentUser = async () => {
    try {
      const response = await fetch("/api/me");
      if (!response.ok) {
        clearCachedUserDisplayName();
        setSignedInUserName("");
        setIsSeller(false);
        return null;
      }

      const data = await response.json();
      if (data.user === null) {
        clearCachedUserDisplayName();
        setSignedInUserName("");
        setIsSeller(false);
        router.refresh();
        return null;
      }

      const fullName = data.user?.fullName ?? "";
      setSignedInUserName(fullName);
      setIsSeller(Boolean(data.user?.isSeller));
      setCachedUserDisplayName(fullName);
      return data.user;
    } catch {
      const cachedDisplayName = getCachedUserDisplayName();
      setSignedInUserName(cachedDisplayName);
      return cachedDisplayName ? { fullName: cachedDisplayName } : null;
    }
  };

  const handleAccountClick = async () => {
    if (isCheckingAccount) return;

    if (signedInUserName) {
      setAccountMenuOpen(!accountMenuOpen);
      void loadCurrentUser();
      return;
    }

    setIsCheckingAccount(true);
    const user = await loadCurrentUser();
    setIsCheckingAccount(false);

    if (user) {
      setAccountMenuOpen(true);
      return;
    }

    router.push("/signin");
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      clearCachedUserDisplayName();
      setSignedInUserName("");
      setIsSeller(false);
      setAccountMenuOpen(false);
      setIsLoggingOut(false);
      router.push("/signin");
      router.refresh();
    }
  };

  useEffect(() => {
    setSignedInUserName(getCachedUserDisplayName());
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    const handleUserDisplayNameChanged = (event) => {
      setSignedInUserName(event.detail?.fullName || "");
    };
    window.addEventListener(USER_DISPLAY_NAME_CHANGED_EVENT, handleUserDisplayNameChanged);
    return () => window.removeEventListener(USER_DISPLAY_NAME_CHANGED_EVENT, handleUserDisplayNameChanged);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop-with-sidebar?search=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push("/shop-with-sidebar");
    }
  };

  return (
    <header className="z-[999] w-full bg-slate-900 text-white shadow-md">
      {/* Top Navbar */}
      <div className="mx-auto w-full max-w-[1500px] px-4 py-2 flex items-center justify-between gap-4 md:gap-6">
        
         {/* Left Logo Section */}
         <div className="flex items-center gap-6 shrink-0">
           <Link
             href="/"
             className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white hover:ring-1 hover:ring-white p-1 rounded-sm duration-150"
             aria-label="Stuffsy home"
           >
             <Image
               src="/images/logo/Stuffsy_logo.png"
               alt="Stuffsy Logo"
               width={34}
               height={34}
               className="h-9 w-9 object-contain brightness-110"
               priority
             />
             <span className="hidden sm:inline-block font-extrabold text-white tracking-wide">stuffsy</span>
           </Link>

           {/* Deliver to Location Box (Mock) */}
           <div className="hidden lg:flex items-center gap-1.5 hover:ring-1 hover:ring-white p-1.5 rounded-sm cursor-pointer duration-150">
             <MapPin className="h-5 w-5 text-slate-300 mt-2" />
             <div className="text-left text-xs leading-none">
               <span className="text-slate-400 block font-normal">Deliver to</span>
               <span className="text-white font-bold block mt-0.5">Mumbai / 400001</span>
             </div>
           </div>
         </div>

        {/* Center Search Bar */}
        <form
          className="flex-1 hidden md:flex items-center h-10 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-amber-500 shadow-sm"
          onSubmit={handleSearchSubmit}
        >
          <div className="relative h-full shrink-0">
            <select
              value={selectedSearchCat}
              onChange={(e) => setSelectedSearchCat(e.target.value)}
              className="h-full px-3 text-xs bg-slate-100 hover:bg-slate-200 border-r border-slate-300 text-slate-700 outline-none cursor-pointer font-medium rounded-l-lg"
            >
              <option>All</option>
              <option>Home Decor</option>
              <option>Jewelry</option>
              <option>Clothing</option>
              <option>Art & Collectibles</option>
              <option>Beauty</option>
            </select>
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for products, categories, creators..."
            autoComplete="off"
            className="w-full h-full px-4 py-2 text-sm text-slate-900 placeholder-slate-500 outline-none"
          />
          <button
            type="submit"
            aria-label="Search"
            className="h-full px-6 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-900 transition font-bold flex items-center justify-center rounded-r-lg"
          >
            <Search className="h-5 w-5 text-slate-900 stroke-[2.5]" />
          </button>
        </form>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
          
          {/* Language Flag (Mock) */}
          <div className="hidden md:flex items-center gap-1.5 hover:ring-1 hover:ring-white p-2 rounded-sm cursor-pointer duration-150 text-xs font-bold text-white">
            <span className="text-base leading-none">🇮🇳</span>
            <span>EN</span>
            <ChevronDown className="h-3 w-3 text-slate-300" />
          </div>

          {/* Account Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={handleAccountClick}
              disabled={isCheckingAccount}
              className="flex items-center gap-1 text-left hover:ring-1 hover:ring-white p-1.5 rounded-sm duration-150 disabled:cursor-wait"
            >
              <div className="hidden sm:block text-xs leading-none">
                <span className="text-slate-400 block font-normal">
                  Hello, {signedInUserName ? signedInUserName.split(" ")[0] : "sign in"}
                </span>
                <span className="text-white font-bold block mt-0.5 flex items-center gap-0.5">
                  Account & Lists
                  <ChevronDown className="h-3 w-3 text-slate-300" />
                </span>
              </div>
              <div className="sm:hidden flex items-center justify-center h-9 w-9 rounded-full bg-slate-700">
                <User className="h-5 w-5 text-slate-300" />
              </div>
            </button>

            {signedInUserName && accountMenuOpen && (
              <div className="absolute right-0 top-full z-[1000] mt-1 w-52 rounded-md border border-slate-700 bg-slate-800 py-2 shadow-xl text-slate-100">
                <div className="px-4 py-2 border-b border-slate-700 mb-1">
                  <p className="text-xs text-slate-400">Signed in as</p>
                  <p className="text-sm font-semibold truncate text-amber-400">{signedInUserName}</p>
                  {isSeller && <span className="inline-block mt-1 text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">Seller Dashboard Active</span>}
                </div>
                <Link
                  href="/my-account"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 hover:text-white"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  My Account
                </Link>
                <Link
                  href={isSeller ? "/seller" : "/seller/create-shop/step_1"}
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 hover:text-white"
                >
                  <ShoppingBag className="h-4 w-4 text-slate-400" />
                  {isSeller ? "Seller Panel" : "Become a Seller"}
                </Link>
                <Link
                  href="/wishlist"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 hover:text-white"
                >
                  <Heart className="h-4 w-4 text-slate-400" />
                  My Wishlist
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-red-900/40 hover:text-red-200 border-t border-slate-700 mt-1 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4 text-red-400" />
                  {isLoggingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            )}
          </div>

          {/* Returns & Orders Track */}
          <Link
            href="/my-account"
            className="hidden sm:flex flex-col text-left hover:ring-1 hover:ring-white p-1.5 rounded-sm duration-150 text-xs leading-none"
          >
            <span className="text-slate-400 block font-normal">Returns</span>
            <span className="text-white font-bold block mt-0.5">& Orders</span>
          </Link>

          {/* Cart Icon Section */}
          <button
            type="button"
            onClick={openCartModal}
            aria-label="Open cart"
            className="flex items-center gap-1.5 hover:ring-1 hover:ring-white p-2 rounded-sm duration-150 relative text-white"
          >
            <div className="relative">
              <ShoppingCart className="h-7 w-7 text-white stroke-[2]" />
              <span className="absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold leading-none text-slate-900 ring-2 ring-slate-900">
                {cartItems.length}
              </span>
            </div>
            <span className="hidden md:inline-block font-extrabold text-sm text-white mt-1.5">Cart</span>
          </button>
          
          {/* Mobile Menu Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex items-center justify-center p-1.5 rounded hover:bg-slate-800 text-white"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

       {/* Sub-Header bar */}
       <div className="bg-slate-800 text-white text-xs border-t border-slate-700/50 shadow-inner">
         <div className="mx-auto w-full max-w-[1500px] px-4 py-2 flex items-center justify-between gap-6 overflow-x-auto whitespace-nowrap">
           <div className="flex items-center gap-4 sm:gap-6 font-semibold">
             <Link href="/shop-with-sidebar" className="flex items-center gap-1 text-slate-100 hover:text-white duration-150">
               <Menu className="h-4 w-4" />
               All Categories
             </Link>
             <Link href="/shop-with-sidebar?filter=bestseller" className="text-slate-300 hover:text-white duration-150">
               Best Sellers
             </Link>
             <Link href="/shop-with-sidebar" className="text-slate-300 hover:text-white duration-150">
               Deals
             </Link>
             <Link href="/shop-with-sidebar?filter=new" className="text-slate-300 hover:text-white duration-150">
               New Arrivals
             </Link>
             <Link href="/seller/create-shop/step_1" className="text-slate-300 hover:text-white duration-150 flex items-center gap-1 text-amber-400">
               <Landmark className="h-3.5 w-3.5" />
               Sell on Stuffsy
             </Link>
             <Link href="/contact" className="text-slate-300 hover:text-white duration-150">
               Customer Service
             </Link>
           </div>

           <div className="hidden sm:block text-slate-400 text-[11px] font-medium italic">
             🔥 Super Saver Deals Live: Free Shipping over ₹999!
           </div>
         </div>
       </div>

      {/* Mobile Search & Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800 p-4 space-y-4 animate-fade-in">
          {/* Mobile Search Bar */}
          <form className="flex items-center h-10 rounded overflow-hidden bg-white" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-full px-4 text-sm text-slate-900 outline-none"
            />
            <button type="submit" className="h-full px-4 bg-amber-500 text-slate-900 flex items-center justify-center">
              <Search className="h-4 w-4 stroke-[2.5]" />
            </button>
          </form>

          {/* Quick links for mobile */}
          <div className="grid grid-cols-2 gap-3 text-sm font-medium py-2">
            <Link href="/shop-with-sidebar" className="text-slate-300 hover:text-white py-1">Shop Catalog</Link>
            <Link href="/wishlist" className="text-slate-300 hover:text-white py-1 flex items-center gap-1.5"><Heart className="h-4 w-4 text-red-500" /> Wishlist</Link>
            <Link href="/my-account" className="text-slate-300 hover:text-white py-1">My Orders</Link>
            <Link href="/contact" className="text-slate-300 hover:text-white py-1">Support Help</Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
