"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Heart from "@/components/Header/Heart";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/redux/store";
import { useCartModalContext } from "@/app/context/CartSidebarModalContext";
import {
  USER_DISPLAY_NAME_CHANGED_EVENT,
  clearCachedUserDisplayName,
  getCachedUserDisplayName,
  setCachedUserDisplayName,
} from "@/utils/auth/user-cache";

const HeaderIcon = ({ children, className = "" }) => (
  <svg
    className={className}
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {children}
  </svg>
);

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
      const nextOpenState = !accountMenuOpen;
      setAccountMenuOpen(nextOpenState);
      if (nextOpenState) {
        void loadCurrentUser();
      }
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

  return (
    <header className="fixed left-0 top-0 z-9999 w-full border-b border-[#e6dff1] bg-white shadow-[0_12px_35px_rgba(45,36,76,0.08)]">
      <div className="mx-auto w-full max-w-[1470px] px-4 md:px-6 xl:px-8">
        <div className="flex min-h-[86px] items-center gap-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 text-[28px] font-bold tracking-tight text-black"
            aria-label="Stuffsy home"
          >
            <Image
              src="/images/logo/Stuffsy_logo.png"
              alt="Stuffsy Logo"
              width={44}
              height={44}
              className="h-10 w-10 object-contain"
              priority
            />
            <span className="hidden xsm:block">Stuffsy</span>
          </Link>

          <form
            className="mx-auto hidden w-full max-w-[805px] md:block"
            onSubmit={(event) => event.preventDefault()}
          >
            <label htmlFor="site-search" className="relative block">
              <input
                id="site-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search for products, categories, shops..."
                autoComplete="off"
                className="h-13 w-full rounded-lg border border-[#ded3ef] bg-[#fdf9ff] py-2.5 pl-5 pr-12 text-custom-sm font-medium text-[#24304f] outline-none duration-200 placeholder:text-[#344064] focus:border-[#8b3dff] focus:ring-4 focus:ring-[#8b3dff]/10"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#344064] transition hover:text-[#7418ff]"
              >
                <HeaderIcon className="h-5.5 w-5.5">
                  <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </HeaderIcon>
              </button>
            </label>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-4 sm:gap-7">
            <Link
              href="/wishlist"
              aria-label="Wishlist"
              className="hidden text-[#253050] transition hover:text-[#7418ff] sm:inline-flex"
            >
              <Heart className="h-7 w-7" />
            </Link>

            <button
              type="button"
              onClick={openCartModal}
              aria-label="Open cart"
              className="relative text-[#253050] transition hover:text-[#7418ff]"
            >
              <HeaderIcon className="h-8 w-8">
                <path
                  d="M6.2 6.2H21L19.2 14.7H8L6.2 3.5H3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9.5" cy="19.4" r="1.35" fill="currentColor" />
                <circle cx="17.4" cy="19.4" r="1.35" fill="currentColor" />
              </HeaderIcon>
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#651fff] px-1 text-xs font-bold leading-none text-white">
                {cartItems.length}
              </span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={handleAccountClick}
                aria-label={signedInUserName ? "Account menu" : "Sign in"}
                disabled={isCheckingAccount}
                className="flex items-center gap-2 disabled:cursor-wait disabled:opacity-70"
              >
                <Image
                  src="/images/users/user-01.jpg"
                  alt=""
                  width={42}
                  height={42}
                  className="h-10.5 w-10.5 rounded-full object-cover ring-2 ring-[#eee8f6]"
                />
                {signedInUserName && (
                  <span className="hidden max-w-[130px] text-left lg:block">
                    <span className="block truncate text-custom-sm font-semibold text-black">
                      {signedInUserName}
                    </span>
                    {isSeller && <span className="block text-2xs text-[#344064]">Seller</span>}
                  </span>
                )}
              </button>

              {signedInUserName && accountMenuOpen && (
                <div className="absolute right-0 top-full z-99999 mt-3 w-48 rounded-lg border border-[#e7def4] bg-white py-2 shadow-[0_16px_40px_rgba(52,48,75,0.14)]">
                  <Link
                    href="/my-account"
                    onClick={() => setAccountMenuOpen(false)}
                    className="block px-4 py-2 text-custom-sm font-medium text-dark hover:bg-[#f8f2ff] hover:text-[#7418ff]"
                  >
                    My Account
                  </Link>
                  <Link
                    href={isSeller ? "/seller" : "/seller/create-shop"}
                    onClick={() => setAccountMenuOpen(false)}
                    className="block px-4 py-2 text-custom-sm font-medium text-dark hover:bg-[#f8f2ff] hover:text-[#7418ff]"
                  >
                    {isSeller ? "Seller Page" : "Make Your Own Shop"}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="block w-full px-4 py-2 text-left text-custom-sm font-medium text-dark hover:bg-[#f8f2ff] hover:text-[#7418ff] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#eee7f8] px-4 pb-4 md:hidden">
          <form className="pt-4" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="site-search-mobile" className="relative block">
              <input
                id="site-search-mobile"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search for anything..."
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-[#ded3ef] bg-[#fdf9ff] py-2.5 pl-4 pr-11 text-custom-sm font-medium text-[#24304f] outline-none placeholder:text-[#344064] focus:border-[#8b3dff] focus:ring-4 focus:ring-[#8b3dff]/10"
              />
              <button
                type="submit"
                aria-label="Search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#344064]"
              >
                <HeaderIcon className="h-5 w-5">
                  <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </HeaderIcon>
              </button>
            </label>
          </form>
        </div>
      </div>
    </header>
  );
};

export default Header;
