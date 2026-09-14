"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { redirectToLogin } from "@/utils/api-client";
import {
  fetchOrderDetail,
  fetchOrders,
  fetchAddresses,
  createAddress,
  deleteAddress,
  updateMyProfile,
  formatOrderStatusLabel,
  orderStatusBadgeClass,
  type OrderListItem,
  type AddressRecord,
} from "@/utils/cart";
import {
  fetchWishlist,
  removeFromWishlist,
  type WishlistItem,
} from "@/utils/wishlist";
import { productHref } from "@/utils/catalog";

import {
  LayoutDashboard,
  ShoppingBag,
  Heart,
  Star,
  MapPin,
  CreditCard,
  User,
  Bell,
  Store,
  Settings as SettingsIcon,
  LogOut,
  Mail,
  Phone,
  Edit3,
  Calendar,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import styles from "./account.module.css";
import Heading from "@/components/ui/Heading/Heading";
import Text from "@/components/ui/Text/Text";
import Button from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import Sidebar from "@/components/layout/Sidebar/Sidebar";

type DisplayOrder = {
  id: string;
  orderNumber?: string;
  title: string;
  date: string;
  price: number;
  qty: number;
  status: string;
  statusKey: string;
  image: string;
};

function mapOrdersForDisplay(
  orders: OrderListItem[],
  details: Map<string, Awaited<ReturnType<typeof fetchOrderDetail>>>
): DisplayOrder[] {
  return orders.map((order) => {
    const detail = details.get(order.id);
    const firstItem = detail?.items[0];
    return {
      id: order.id,
      title:
        order.previewTitle ??
        firstItem?.productTitle ??
        `Order · ${order.itemCount} item(s)`,
      date: new Date(order.createdAt).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      price: order.totalAmount,
      qty: firstItem?.quantity ?? order.itemCount,
      status: formatOrderStatusLabel(order.status),
      statusKey: order.status,
      image:
        order.previewThumbnailUrl ||
        firstItem?.productThumbnailUrl ||
        "/images/product-woven-hanging.jpg",
      orderNumber: order.orderNumber,
    };
  });
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <Text>Loading account…</Text>
        </div>
      }
    >
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: sessionUser, status: authStatus, logout, refreshSession, setUser } = useAuth();
  const tabParam = searchParams.get("tab");
  const pendingOrderId = searchParams.get("pending");
  const [activeTab, setActiveTab] = useState(tabParam ?? "dashboard");
  const [recentOrders, setRecentOrders] = useState<DisplayOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [addressCount, setAddressCount] = useState(0);
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [defaultAddressLabel, setDefaultAddressLabel] = useState(
    "Add an address to get started"
  );
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: "Home",
    recipientName: "",
    phoneNumber: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (authStatus === "ready" && !sessionUser) {
      redirectToLogin("/account");
    }
  }, [authStatus, sessionUser]);

  useEffect(() => {
    if (authStatus !== "ready" || !sessionUser) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const list = await fetchOrders(1, activeTab === "orders" ? 20 : 5);
      if (cancelled) return;

      const detailEntries = await Promise.all(
        list.orders.slice(0, activeTab === "orders" ? 10 : 3).map(async (order) => {
          const detail = await fetchOrderDetail(order.id);
          return [order.id, detail] as const;
        })
      );
      if (cancelled) return;

      setOrdersTotal(list.total);
      setRecentOrders(mapOrdersForDisplay(list.orders, new Map(detailEntries)));

      const addresses = await fetchAddresses();
      if (!cancelled) {
        setAddresses(addresses);
        setAddressCount(addresses.length);
        const defaultAddress =
          addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
        if (defaultAddress) {
          setDefaultAddressLabel(
            [
              defaultAddress.line1,
              defaultAddress.line2,
              defaultAddress.city,
              defaultAddress.state,
              defaultAddress.postalCode,
            ]
              .filter(Boolean)
              .join(", ")
          );
        } else {
          setDefaultAddressLabel("Add an address to get started");
        }
      }

      if (!cancelled) {
        setProfileName(sessionUser.fullName ?? "");
        setProfilePhone(sessionUser.phoneNumber ?? "");
      }

      if (pendingOrderId) {
        const fromList = list.orders.find((order) => order.id === pendingOrderId);
        const status =
          fromList?.status ??
          (await fetchOrderDetail(pendingOrderId))?.status ??
          "pending_payment";
        setPendingNotice(
          status === "pending_payment"
            ? `Order ${pendingOrderId.slice(0, 8)}… is awaiting payment. Complete checkout when Razorpay is enabled (Phase 4).`
            : `Order ${pendingOrderId.slice(0, 8)}… was placed (${formatOrderStatusLabel(status)}).`
        );
      }

      const wish = await fetchWishlist();
      if (!cancelled) {
        setWishlistItems(wish.items);
        setWishlistCount(wish.total || wish.items.length);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, sessionUser, activeTab, pendingOrderId]);

  const user = {
    name: sessionUser?.fullName ?? "",
    email: sessionUser?.email ?? "",
    phone: sessionUser?.phoneNumber ?? "Not set",
    memberSince: sessionUser?.createdAt
      ? new Date(sessionUser.createdAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "",
    status: sessionUser?.status === "active" ? "Active" : (sessionUser?.status ?? ""),
    address: defaultAddressLabel,
    avatar:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_nZ1bL9Vcq6_iyx6xBOSL2oaaTepkAAFPaw&s",
    emailVerified: Boolean(sessionUser?.emailVerifiedAt),
  };

  const stats = [
    {
      val: String(ordersTotal),
      label: "Total Orders",
      linkText: "View all orders",
      href: "/account?tab=orders",
      icon: <ShoppingBag size={20} />,
      bg: "#f5f3ff",
      color: "var(--color-primary)",
    },
    {
      val: String(wishlistCount),
      label: "Wishlist Items",
      linkText: "View wishlist",
      href: "/account?tab=wishlist",
      icon: <Heart size={20} />,
      bg: "#fff5f5",
      color: "var(--color-danger)",
    },
    {
      val: "—",
      label: "Reviews Given",
      linkText: "Not available yet",
      href: "/account?tab=reviews",
      icon: <Star size={20} />,
      bg: "#fffbeb",
      color: "var(--color-warning)",
    },
    {
      val: String(addressCount),
      label: "Saved Addresses",
      linkText: "Manage addresses",
      href: "/account?tab=addresses",
      icon: <MapPin size={20} />,
      bg: "#eff6ff",
      color: "var(--color-info)",
    },
  ];

  if (authStatus !== "ready" || !sessionUser) {
    return (
      <div className={styles.container}>
        <Text>Checking your session...</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>My Account</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.layout}>
        <Sidebar>
          <Sidebar.Nav>
            <Sidebar.Item
              icon={<LayoutDashboard size={18} />}
              active={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </Sidebar.Item>
            <Sidebar.Item
              icon={<ShoppingBag size={18} />}
              active={activeTab === "orders"}
              onClick={() => setActiveTab("orders")}
            >
              Orders
            </Sidebar.Item>
            <Sidebar.Item
              icon={<Heart size={18} />}
              active={activeTab === "wishlist"}
              onClick={() => setActiveTab("wishlist")}
            >
              Wishlist
            </Sidebar.Item>
            <Sidebar.Item
              icon={<Star size={18} />}
              active={activeTab === "reviews"}
              onClick={() => setActiveTab("reviews")}
            >
              Reviews
            </Sidebar.Item>
            <Sidebar.Item
              icon={<MapPin size={18} />}
              active={activeTab === "addresses"}
              onClick={() => setActiveTab("addresses")}
            >
              Addresses
            </Sidebar.Item>
            <Sidebar.Item
              icon={<CreditCard size={18} />}
              active={activeTab === "payment-methods"}
              onClick={() => setActiveTab("payment-methods")}
            >
              Payment Methods
            </Sidebar.Item>
            <Sidebar.Item
              icon={<User size={18} />}
              active={activeTab === "profile-details"}
              onClick={() => setActiveTab("profile-details")}
            >
              Profile Details
            </Sidebar.Item>
            <Sidebar.Item
              icon={<Bell size={18} />}
              active={activeTab === "notifications"}
              onClick={() => setActiveTab("notifications")}
            >
              Notifications
            </Sidebar.Item>
            <Sidebar.Item
              icon={<Store size={18} />}
              active={activeTab === "seller-dashboard"}
              onClick={() => router.push("/seller")}
            >
              Seller Dashboard
            </Sidebar.Item>
            <Sidebar.Item
              icon={<SettingsIcon size={18} />}
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </Sidebar.Item>
            <Sidebar.Item
              icon={<LogOut size={18} />}
              onClick={() => {
                void logout().then(() => {
                  router.replace("/login");
                });
              }}
            >
              Logout
            </Sidebar.Item>
          </Sidebar.Nav>

          <Sidebar.Callout
            title="Sell on Stuffsy"
            description="Start your online store and grow your business with us."
            buttonText="Start Selling"
            onButtonClick={() => (window.location.href = "/sell")}
          />
        </Sidebar>

        <main className={styles.mainContent}>
          <div className={styles.headerArea}>
            <Heading level={2}>My Account</Heading>
            <span className={styles.welcomeText}>
              Welcome back, <strong>{user.name}</strong>! 👋
            </span>
          </div>

          {pendingNotice && (
            <div className={styles.pendingPaymentNotice} role="status">
              {pendingNotice}
            </div>
          )}

          <div className={styles.profileCard}>
            <div className={styles.profileLeft}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatar}
                alt={user.name}
                className={styles.avatar}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150";
                }}
              />
              <div className={styles.profileDetails}>
                <div className={styles.nameRow}>
                  <Heading level={3}>{user.name}</Heading>
                  {user.emailVerified ? (
                    <span className={styles.verifiedBadge}>Verified</span>
                  ) : (
                    <span className={styles.verifiedBadge}>Unverified</span>
                  )}
                </div>
                <div className={styles.contactRow}>
                  <div className={styles.contactItem}>
                    <Mail size={14} />
                    <span>{user.email}</span>
                  </div>
                  <div className={styles.contactItem}>
                    <Phone size={14} />
                    <span>{user.phone}</span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Edit3 size={14} />}
              onClick={() => setActiveTab("profile-details")}
            >
              Edit Profile
            </Button>
          </div>

          <div className={styles.statsRow}>
            {stats.map((stat, idx) => (
              <div key={idx} className={styles.statCard}>
                <div
                  className={styles.statIconWrapper}
                  style={{ backgroundColor: stat.bg, color: stat.color }}
                >
                  {stat.icon}
                </div>
                <div className={styles.statValCol}>
                  <span className={styles.statNumber}>{stat.val}</span>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <Link href={stat.href} className={styles.statLink}>
                    <span>{stat.linkText}</span>
                    <ArrowRight size={10} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.splitGrid}>
            {activeTab === "notifications" ? (
              <div className={styles.splitSection} style={{ gridColumn: "1 / -1" }}>
                <div className={styles.sectionHeader}>
                  <Heading level={4}>Notifications</Heading>
                </div>
                <Text size="sm" color="muted">
                  Order and marketing email preferences are not wired to a backend API yet.
                  Transactional mail (order confirmation, shipping, invoice, auth) is sent
                  automatically when those events occur.
                </Text>
              </div>
            ) : activeTab === "reviews" ||
              activeTab === "payment-methods" ||
              activeTab === "settings" ? (
              <div className={styles.splitSection} style={{ gridColumn: "1 / -1" }}>
                <div className={styles.sectionHeader}>
                  <Heading level={4}>
                    {activeTab === "reviews"
                      ? "Reviews"
                      : activeTab === "payment-methods"
                        ? "Payment Methods"
                        : "Settings"}
                  </Heading>
                </div>
                <Text size="sm" color="muted">
                  {activeTab === "reviews"
                    ? "A reviews list API is not available yet. You can still write verified reviews from a delivered order’s details page."
                    : activeTab === "payment-methods"
                      ? "Saved cards / UPI wallets are not stored on Stuffsy — payments run through Razorpay Checkout at order time."
                      : "Account settings beyond profile and addresses are not available yet."}
                </Text>
              </div>
            ) : activeTab === "addresses" ? (
              <div className={styles.splitSection} style={{ gridColumn: "1 / -1" }}>
                <div className={styles.sectionHeader}>
                  <Heading level={4}>Saved Addresses ({addresses.length})</Heading>
                </div>
                {addresses.length === 0 ? (
                  <Text size="sm" color="muted">
                    No saved addresses yet.
                  </Text>
                ) : (
                  <div className={styles.ordersList}>
                    {addresses.map((addr) => (
                      <div key={addr.id} className={styles.orderRow}>
                        <div className={styles.orderInfo}>
                          <span className={styles.orderTitle}>
                            {addr.label}
                            {addr.isDefault ? " · Default" : ""}
                          </span>
                          <span className={styles.orderId}>
                            {addr.recipientName} · {addr.phoneNumber}
                          </span>
                          <span className={styles.orderId}>
                            {[addr.line1, addr.line2, addr.city, addr.state, addr.postalCode]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                        <div className={styles.orderMeta}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={addressBusy}
                            onClick={() => {
                              void (async () => {
                                setAddressBusy(true);
                                try {
                                  await deleteAddress(addr.id);
                                  const list = await fetchAddresses();
                                  setAddresses(list);
                                  setAddressCount(list.length);
                                } finally {
                                  setAddressBusy(false);
                                }
                              })();
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.sectionHeader} style={{ marginTop: 24 }}>
                  <Heading level={4}>Add address</Heading>
                </div>
                <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
                  {(
                    [
                      ["label", "Label"],
                      ["recipientName", "Full name"],
                      ["phoneNumber", "Phone"],
                      ["line1", "Address line 1"],
                      ["line2", "Address line 2"],
                      ["city", "City"],
                      ["state", "State"],
                      ["postalCode", "PIN"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} style={{ display: "grid", gap: 4, fontSize: 13 }}>
                      {label}
                      <input
                        value={newAddress[key]}
                        onChange={(e) =>
                          setNewAddress((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--color-border, #e5e7eb)",
                        }}
                      />
                    </label>
                  ))}
                  <Button
                    disabled={addressBusy}
                    onClick={() => {
                      void (async () => {
                        setAddressBusy(true);
                        try {
                          await createAddress({
                            ...newAddress,
                            line2: newAddress.line2 || null,
                            isDefault: addresses.length === 0,
                          });
                          const list = await fetchAddresses();
                          setAddresses(list);
                          setAddressCount(list.length);
                          setNewAddress({
                            label: "Home",
                            recipientName: "",
                            phoneNumber: "",
                            line1: "",
                            line2: "",
                            city: "",
                            state: "",
                            postalCode: "",
                          });
                        } finally {
                          setAddressBusy(false);
                        }
                      })();
                    }}
                  >
                    {addressBusy ? "Saving…" : "Save address"}
                  </Button>
                </div>
              </div>
            ) : activeTab === "profile-details" ? (
              <div className={styles.splitSection} style={{ gridColumn: "1 / -1" }}>
                <div className={styles.sectionHeader}>
                  <Heading level={4}>Profile Details</Heading>
                </div>
                <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    Full name
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--color-border, #e5e7eb)",
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    Phone
                    <input
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--color-border, #e5e7eb)",
                      }}
                    />
                  </label>
                  <Text size="sm" color="muted">
                    Email: {sessionUser?.email} (change not supported here)
                  </Text>
                  {profileMsg ? <Text size="sm">{profileMsg}</Text> : null}
                  <Button
                    disabled={profileBusy}
                    onClick={() => {
                      void (async () => {
                        setProfileBusy(true);
                        setProfileMsg(null);
                        const result = await updateMyProfile({
                          fullName: profileName,
                          phoneNumber: profilePhone || null,
                        });
                        setProfileBusy(false);
                        if (result.error || !result.data?.user) {
                          setProfileMsg(result.error ?? "Could not update profile");
                          return;
                        }
                        setUser(result.data.user);
                        setProfileMsg("Profile updated.");
                        void refreshSession();
                      })();
                    }}
                  >
                    {profileBusy ? "Saving…" : "Save profile"}
                  </Button>
                </div>
              </div>
            ) : activeTab === "wishlist" ? (
              <div className={styles.splitSection} style={{ gridColumn: "1 / -1" }}>
                <div className={styles.sectionHeader}>
                  <Heading level={4}>Wishlist ({wishlistItems.length})</Heading>
                </div>
                {wishlistItems.length === 0 ? (
                  <Text size="sm" color="muted">
                    No saved items yet. Tap the heart on a product to add it here.
                  </Text>
                ) : (
                  <div className={styles.ordersList}>
                    {wishlistItems.map((item) => (
                      <div key={item.id} className={styles.orderRow}>
                        <Link
                          href={productHref({ slug: item.slug })}
                          style={{
                            display: "contents",
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <div className={styles.orderImgWrapper}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.thumbnailUrl || "/images/product-woven-hanging.jpg"}
                              alt={item.title}
                              className={styles.orderImg}
                            />
                          </div>
                          <div className={styles.orderInfo}>
                            <span className={styles.orderTitle}>{item.title}</span>
                            <span className={styles.orderId}>{item.shopName}</span>
                          </div>
                        </Link>
                        <div className={styles.orderMeta}>
                          <span className={styles.orderPrice}>
                            ₹{item.price.toLocaleString("en-IN")}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void removeFromWishlist(item.productId).then(async () => {
                                const wish = await fetchWishlist();
                                setWishlistItems(wish.items);
                                setWishlistCount(wish.total || wish.items.length);
                              });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
            <div className={styles.splitSection}>
              <div className={styles.sectionHeader}>
                <Heading level={4}>
                  {activeTab === "orders" ? "Your Orders" : "Recent Orders"}
                </Heading>
                {activeTab !== "orders" && (
                  <Link href="/account?tab=orders" className={styles.viewAllLink}>
                    <span>View all orders</span>
                    <ArrowRight size={12} />
                  </Link>
                )}
              </div>
              <div className={styles.ordersList}>
                {recentOrders.length === 0 && (
                  <Text size="sm" color="muted">
                    No orders yet.
                  </Text>
                )}
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}/details`}
                    className={styles.orderRow}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className={styles.orderImgWrapper}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={order.image}
                        alt={order.title}
                        className={styles.orderImg}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=100";
                        }}
                      />
                    </div>
                    <div className={styles.orderInfo}>
                      <span className={styles.orderTitle}>{order.title}</span>
                      <span className={styles.orderId}>
                        Order ID: {order.orderNumber || order.id.slice(0, 8)}
                      </span>
                      <span className={styles.orderId}>{order.date}</span>
                    </div>
                    <div className={styles.orderMeta}>
                      <span className={styles.orderPrice}>
                        ₹{order.price.toLocaleString("en-IN")}
                      </span>
                      <span className={styles.orderQty}>{order.qty} Item</span>
                      <span
                        className={`${styles.statusBadge} ${
                          styles[orderStatusBadgeClass(order.statusKey)]
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.splitSection}>
              <div className={styles.sectionHeader}>
                <Heading level={4}>Account Overview</Heading>
              </div>
              <div className={styles.overviewList}>
                <div className={styles.overviewRow}>
                  <div className={styles.overviewIcon}>
                    <User size={16} />
                  </div>
                  <div className={styles.overviewLabelCol}>
                    <span className={styles.overviewLabel}>Full Name</span>
                    <span className={styles.overviewVal}>{user.name}</span>
                  </div>
                </div>

                <div className={styles.overviewRow}>
                  <div className={styles.overviewIcon}>
                    <Mail size={16} />
                  </div>
                  <div className={styles.overviewLabelCol}>
                    <span className={styles.overviewLabel}>Email Address</span>
                    <span className={styles.overviewVal}>{user.email}</span>
                  </div>
                </div>

                <div className={styles.overviewRow}>
                  <div className={styles.overviewIcon}>
                    <Phone size={16} />
                  </div>
                  <div className={styles.overviewLabelCol}>
                    <span className={styles.overviewLabel}>Phone Number</span>
                    <span className={styles.overviewVal}>{user.phone}</span>
                  </div>
                </div>

                <div className={styles.overviewRow}>
                  <div className={styles.overviewIcon}>
                    <Calendar size={16} />
                  </div>
                  <div className={styles.overviewLabelCol}>
                    <span className={styles.overviewLabel}>Member Since</span>
                    <span className={styles.overviewVal}>{user.memberSince}</span>
                  </div>
                </div>

                <div className={styles.overviewRow}>
                  <div className={styles.overviewIcon}>
                    <ShieldCheck size={16} />
                  </div>
                  <div className={styles.overviewLabelCol}>
                    <span className={styles.overviewLabel}>Account Status</span>
                    <span className={styles.activeBadge}>{user.status}</span>
                  </div>
                </div>

                <div className={styles.overviewRow}>
                  <div className={styles.overviewIcon}>
                    <MapPin size={16} />
                  </div>
                  <div className={styles.overviewLabelCol}>
                    <span className={styles.overviewLabel}>Default Address</span>
                    <span className={styles.overviewVal}>{user.address}</span>
                  </div>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
