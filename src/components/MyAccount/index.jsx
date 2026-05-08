"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Orders from "../Orders";
import { useAppSelector } from "@/redux/store";

const SidebarIcon = ({ children, className = "" }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {children}
  </svg>
);

const getStatusStyle = (status) => {
  if (status === "delivered") return "bg-green-light-6 text-green";
  if (status === "cancelled" || status === "on-hold" || status === "failed") return "bg-red/10 text-red";
  return "bg-yellow-light-4 text-yellow";
};

const MyAccount = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [recentOrders, setRecentOrders] = useState([]);
  const wishlistItems = useAppSelector((state) => state.wishlistReducer.items);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [profileResponse, ordersResponse] = await Promise.all([
          fetch("/api/account/profile"),
          fetch("/api/orders"),
        ]);
        const profileData = await profileResponse.json();
        if (!profileResponse.ok) {
          setErrorMessage(profileData.error ?? "Failed to load account details.");
          return;
        }

        setFirstName(profileData.profile.firstName);
        setLastName(profileData.profile.lastName);
        setEmail(profileData.profile.email);
        setFullName(profileData.profile.fullName);

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          setRecentOrders(Array.isArray(ordersData.orders) ? ordersData.orders : []);
        }
      } catch {
        setErrorMessage("Failed to load account details.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadProfile();
  }, []);

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setProfileMessage("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "Failed to update profile.");
        return;
      }
      setProfileMessage(data.message ?? "Profile updated.");
      setFullName(data.fullName ?? `${firstName} ${lastName}`.trim());
    } catch {
      setErrorMessage("Failed to update profile.");
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setPasswordMessage("");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "Failed to update password.");
        return;
      }
      setPasswordMessage(data.message ?? "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      setErrorMessage("Failed to update password.");
    }
  };

  const statCards = [
    {
      title: "Total Orders",
      value: recentOrders.length,
      linkLabel: "View all orders",
      linkStyle: "text",
      onClick: () => setActiveTab("orders"),
      iconBg: "bg-[#f2ecff]",
      iconColor: "text-[#651fff]",
      icon: (
        <SidebarIcon className="h-6 w-6">
          <path
            d="M7 7.5A2.5 2.5 0 019.5 5h5A2.5 2.5 0 0117 7.5V9h1a1 1 0 011 1v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7a1 1 0 011-1h1V7.5zM9.5 7a.5.5 0 00-.5.5V9h6V7.5a.5.5 0 00-.5-.5h-5z"
            fill="currentColor"
          />
        </SidebarIcon>
      ),
    },
    {
      title: "Wishlist Items",
      value: wishlistItems.length,
      linkLabel: "View wishlist",
      linkStyle: "text",
      href: "/wishlist",
      iconBg: "bg-[#fceaf4]",
      iconColor: "text-[#ec4899]",
      icon: (
        <SidebarIcon className="h-6 w-6">
          <path
            d="M12 20s-6.5-4.2-8.6-8.4C1.7 8.1 4 4 8 4c1.8 0 3.3.9 4 2.1C12.7 4.9 14.2 4 16 4c4 0 6.3 4.1 4.6 7.6C18.5 15.8 12 20 12 20z"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
    {
      title: "Reviews Given",
      value: recentOrders.filter((order) => order.status === "delivered").length,
      linkLabel: "View reviews",
      href: "/shop-with-sidebar",
      iconBg: "bg-[#fff7e8]",
      iconColor: "text-[#f59e0b]",
      icon: (
        <SidebarIcon className="h-6 w-6">
          <path
            d="M12 3.5l2.5 5.1 5.6.8-4 3.9.9 5.5L12 16.2 7 18.8l1-5.5-4-3.9 5.5-.8L12 3.5z"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
    {
      title: "Saved Addresses",
      value: 1,
      linkLabel: "Manage address",
      onClick: () => setActiveTab("account-details"),
      iconBg: "bg-[#f2ecff]",
      iconColor: "text-[#7c3aed]",
      icon: (
        <SidebarIcon className="h-6 w-6">
          <path
            d="M12 21s6-6.3 6-11a6 6 0 10-12 0c0 4.7 6 11 6 11z"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
          />
          <circle cx="12" cy="10" r="2" fill="currentColor" />
        </SidebarIcon>
      ),
    },
  ];

  const accountOverviewItems = [
    { label: "Full Name", value: fullName || "Not available" },
    { label: "Email Address", value: email || "Not available" },
    { label: "Phone Number", value: "Not added yet" },
    { label: "Member Since", value: recentOrders[recentOrders.length - 1]?.createdAt ?? "Not available" },
    {
      label: "Account Status",
      value: (
        <span className="inline-flex rounded-[20px] bg-green-light-6 px-3 py-1 text-custom-xs font-medium text-green">
          Active
        </span>
      ),
    },
    { label: "Default Address", value: "Not added yet" },
  ];

  const sidebarItems = [
    {
      label: "Dashboard",
      value: "dashboard",
      type: "tab",
      icon: (
        <SidebarIcon className="h-5 w-5">
          <path
            d="M4 12l8-7 8 7M6.5 10.1V19h11v-8.9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
    {
      label: "Orders",
      value: "orders",
      type: "tab",
      icon: (
        <SidebarIcon className="h-5 w-5">
          <path
            d="M8 8h12l-1.5 9h-11L6 4H3M9 20a1 1 0 110 2 1 1 0 010-2zm8 0a1 1 0 110 2 1 1 0 010-2z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
    {
      label: "Wishlist",
      href: "/wishlist",
      type: "link",
      icon: (
        <SidebarIcon className="h-5 w-5">
          <path
            d="M12 20s-6.5-4.2-8.6-8.4C1.7 8.1 4 4 8 4c1.8 0 3.3.9 4 2.1C12.7 4.9 14.2 4 16 4c4 0 6.3 4.1 4.6 7.6C18.5 15.8 12 20 12 20z"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
    {
      label: "Profile Details",
      value: "account-details",
      type: "tab",
      icon: (
        <SidebarIcon className="h-5 w-5">
          <path
            d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
    {
      label: "Seller Dashboard",
      href: "/seller",
      type: "link",
      icon: (
        <SidebarIcon className="h-5 w-5">
          <path
            d="M4 7h16M7 7V5h10v2m-9 0l1 12h6l1-12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </SidebarIcon>
      ),
    },
  ];

  return (
    <>
      <section className="overflow-hidden bg-gray-2 py-24 lg:py-28">
        <div className="max-w-[1470px] w-full mx-auto px-4 md:px-6 xl:px-8">
          <div className="grid gap-7 xl:grid-cols-[280px,1fr]">
            <div className="space-y-6">
              <div className="rounded-xl border border-[#ece3f8] bg-white p-3">
                <div>
                  {sidebarItems.map((item) => {
                    if (item.type === "link") {
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="flex items-center gap-3 rounded-lg px-3 py-3 text-custom-sm text-dark-4 transition hover:bg-[#f8f2ff] hover:text-[#651fff]"
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      );
                    }
                    const isActive = activeTab === item.value;
                    return (
                      <button
                        key={item.label}
                        onClick={() => setActiveTab(item.value)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-custom-sm transition ${
                          isActive
                            ? "bg-[#f3edff] text-[#651fff] font-medium"
                            : "text-dark-4 hover:bg-[#f8f2ff] hover:text-[#651fff]"
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#ece3f8] bg-white p-5">
                <h3 className="text-xl font-semibold text-[#4a1fb8]">Sell on Stuffsy</h3>
                <p className="mt-2 text-custom-sm text-dark-4">
                  Start your online store and grow your business with us.
                </p>
                <Link
                  href="/seller/create-shop"
                  className="mt-5 inline-flex rounded-md bg-[#651fff] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4d0fff]"
                >
                  Start Selling
                </Link>
              </div>
            </div>

            <div className="space-y-1">
              {errorMessage && (<div className="mb-4 rounded-md bg-red/10 px-4 py-3 text-red">{errorMessage}</div>)}

              {activeTab === "dashboard" && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-[#ece3f8] bg-white p-5 sm:p-7">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <Image
                          src="/images/users/user-01.jpg"
                          alt="User"
                          width={84}
                          height={84}
                          className="h-[84px] w-[84px] rounded-full object-cover"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-2xl font-semibold text-dark">{fullName || "My Account"}</p>
                            <span className="rounded-[20px] bg-[#f3edff] px-3 py-1 text-custom-xs font-medium text-[#651fff]">
                              Verified
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-5 text-custom-sm text-dark-4">
                            <span>{email || "Signed-in user"}</span>
                            <span>+91 98156 43210</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab("account-details")}
                        className="inline-flex rounded-lg border border-[#dccdf8] px-5 py-2.5 text-custom-sm font-medium text-[#651fff] hover:border-[#651fff]"
                      >
                        Edit Profile
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map((card) => (
                      <div key={card.title} className="rounded-xl border border-[#ece3f8] bg-white p-5">
                        <div className="flex items-center gap-4">
                          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${card.iconBg} ${card.iconColor}`}>
                            {card.icon}
                          </div>
                          <div>
                            <p className="text-4xl font-bold leading-none text-dark">{card.value}</p>
                            <p className="mt-2 text-custom-sm text-dark-4">{card.title}</p>
                          </div>
                        </div>

                        {card.href ? (
                          <Link
                            href={card.href}
                            className={`mt-4 inline-flex items-center text-sm font-semibold text-[#651fff] transition hover:text-[#4d0fff] ${
                              card.linkStyle === "text"
                                ? "gap-2"
                                : "justify-center rounded-md border border-[#dccdf8] bg-[#faf7ff] px-4 py-2 hover:border-[#651fff] hover:bg-[#f3ecff]"
                            }`}
                          >
                            {card.linkLabel}
                            {card.linkStyle === "text" && <span aria-hidden="true">&rarr;</span>}
                          </Link>
                        ) : (
                          <button
                            onClick={card.onClick}
                            className={`mt-4 inline-flex items-center text-sm font-semibold text-[#651fff] transition hover:text-[#4d0fff] ${
                              card.linkStyle === "text"
                                ? "gap-2"
                                : "justify-center rounded-md border border-[#dccdf8] bg-[#faf7ff] px-4 py-2 hover:border-[#651fff] hover:bg-[#f3ecff]"
                            }`}
                          >
                            {card.linkLabel}
                            {card.linkStyle === "text" && <span aria-hidden="true">&rarr;</span>}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-xl border border-[#ece3f8] bg-white p-5">
                      <div className="mb-4 flex items-center justify-between border-b border-[#f0ebf8] pb-4">
                        <h3 className="text-2xl font-semibold text-dark">Recent Orders</h3>
                        <button
                          onClick={() => setActiveTab("orders")}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#651fff] transition hover:text-[#4d0fff]"
                        >
                          View all orders
                          <span aria-hidden="true">&rarr;</span>
                        </button>
                      </div>

                      <div className="space-y-4">
                        {recentOrders.slice(0, 3).map((order, index) => (
                          <div key={order.orderId} className="flex gap-4 rounded-lg border border-[#f0ebf8] p-3">
                            <Image
                              src={`/images/products/product-${(index % 4) + 1}-bg-1.png`}
                              alt={order.title}
                              width={74}
                              height={74}
                              className="h-[74px] w-[74px] rounded-md object-cover"
                            />
                            <div className="flex-1">
                              <p className="line-clamp-1 text-lg font-medium text-dark">{order.title}</p>
                              <p className="mt-1 text-custom-sm text-dark-4">Order ID: #{order.orderId.slice(-8)}</p>
                              <p className="text-custom-sm text-dark-4">{order.createdAt}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-semibold text-dark">{order.total}</p>
                              <p className="text-custom-sm text-dark-4">{order.totalItems} Item</p>
                              <span
                                className={`mt-2 inline-flex rounded-[20px] px-2.5 py-1 text-custom-xs font-medium capitalize ${getStatusStyle(order.status)}`}
                              >
                                {order.status}
                              </span>
                            </div>
                          </div>
                        ))}

                        {recentOrders.length === 0 && (
                          <p className="text-custom-sm text-dark-4">You do not have any recent orders yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#ece3f8] bg-white p-5">
                      <div className="mb-4 border-b border-[#f0ebf8] pb-4">
                        <h3 className="text-2xl font-semibold text-dark">Account Overview</h3>
                      </div>

                      <div className="divide-y divide-[#f0ebf8]">
                        {accountOverviewItems.map((item) => (
                          <div key={item.label} className="grid gap-2 py-4 sm:grid-cols-[220px,1fr]">
                            <p className="text-custom-sm text-dark-4">{item.label}</p>
                            <div className="text-custom-sm font-medium text-dark">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "orders" && (<div className="bg-white rounded-xl border border-[#ece3f8] shadow-1">
                  <Orders />
                </div>)}

              {activeTab === "account-details" && (<div className="flex flex-col gap-6">
                  <form onSubmit={handleProfileSubmit} className="bg-white rounded-xl border border-[#ece3f8] shadow-1 p-6 sm:p-8">
                    <h3 className="font-medium text-dark text-xl mb-5">Profile Details</h3>
                    {profileMessage && <p className="mb-4 text-blue">{profileMessage}</p>}
                    <div className="grid sm:grid-cols-2 gap-5 mb-5">
                      <div>
                        <label htmlFor="firstName" className="block mb-2.5">
                          First Name <span className="text-red">*</span>
                        </label>
                        <input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block mb-2.5">
                          Last Name
                        </label>
                        <input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                      </div>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="email" className="block mb-2.5">
                        Email Address
                      </label>
                      <input id="email" value={email} disabled className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none text-dark-4"/>
                    </div>
                    <button type="submit" disabled={isLoading} className="inline-flex font-medium text-white bg-blue py-3 px-7 rounded-md hover:bg-blue-dark ease-out duration-200">
                      Save Changes
                    </button>
                  </form>

                  <form onSubmit={handlePasswordSubmit} className="bg-white rounded-xl border border-[#ece3f8] shadow-1 p-6 sm:p-8">
                    <h3 className="font-medium text-dark text-xl mb-5">Password Change</h3>
                    {passwordMessage && <p className="mb-4 text-blue">{passwordMessage}</p>}
                    <div className="mb-5">
                      <label htmlFor="currentPassword" className="block mb-2.5">
                        Current Password
                      </label>
                      <input type="password" id="currentPassword" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="newPassword" className="block mb-2.5">
                        New Password
                      </label>
                      <input type="password" id="newPassword" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                    </div>
                    <div className="mb-5">
                      <label htmlFor="confirmNewPassword" className="block mb-2.5">
                        Confirm New Password
                      </label>
                      <input type="password" id="confirmNewPassword" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} minLength={6} required className="rounded-md border border-gray-3 bg-gray-1 w-full py-2.5 px-5 outline-none focus:border-transparent focus:shadow-input focus:ring-2 focus:ring-blue/20"/>
                    </div>
                    <button type="submit" className="inline-flex font-medium text-white bg-blue py-3 px-7 rounded-md hover:bg-blue-dark ease-out duration-200">
                      Change Password
                    </button>
                  </form>
                </div>)}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
export default MyAccount;
