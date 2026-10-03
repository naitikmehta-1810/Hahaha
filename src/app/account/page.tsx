"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Calendar,
  CreditCard,
  Edit3,
  Heart,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Phone,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest, redirectToLogin } from "@/utils/api-client";
import {
  fetchOrderDetail,
  fetchOrders,
  fetchAddresses,
  createAddress,
  deleteAddress,
  changeMyPassword,
  updateMyProfile,
  uploadMyAvatar,
  formatOrderStatusLabel,
  type OrderListItem,
  type AddressRecord,
} from "@/utils/cart";
import { fetchWishlist, toggleWishlist, type WishlistItem } from "@/utils/wishlist";
import { productHref } from "@/utils/catalog";
import { FALLBACK_PRODUCT_IMAGE, optimizedImage } from "@/utils/media";
import styles from "./account.module.css";
import Button, { ButtonLink } from "@/components/ui/Button/Button";
import Breadcrumbs from "@/components/ui/Breadcrumbs/Breadcrumbs";
import EmptyState from "@/components/ui/EmptyState/EmptyState";
import Notice, { type NoticeTone } from "@/components/ui/Notice/Notice";
import StatusPill from "@/components/ui/StatusPill/StatusPill";
import Sidebar from "@/components/layout/Sidebar/Sidebar";
import MyReviews from "@/components/reviews/MyReviews";

type TabKey =
  | "dashboard"
  | "orders"
  | "wishlist"
  | "reviews"
  | "addresses"
  | "payment-methods"
  | "profile-details"
  | "notifications"
  | "settings";

const TABS: Array<{ key: TabKey; label: string; Icon: typeof User }> = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "orders", label: "Orders", Icon: ShoppingBag },
  { key: "wishlist", label: "Wishlist", Icon: Heart },
  { key: "reviews", label: "Reviews", Icon: Star },
  { key: "addresses", label: "Addresses", Icon: MapPin },
  { key: "payment-methods", label: "Payment methods", Icon: CreditCard },
  { key: "profile-details", label: "Profile details", Icon: User },
  { key: "notifications", label: "Notifications", Icon: Bell },
  { key: "settings", label: "Settings", Icon: SettingsIcon },
];

const TAB_TITLES: Record<TabKey, { title: string; description: string }> = {
  dashboard: { title: "My account", description: "" },
  orders: { title: "Your orders", description: "Track, review and manage everything you’ve ordered." },
  wishlist: { title: "Wishlist", description: "Pieces you’ve saved for later." },
  reviews: { title: "Reviews", description: "Ratings you’ve shared with makers." },
  addresses: { title: "Addresses", description: "Where we deliver your orders." },
  "payment-methods": { title: "Payment methods", description: "How you pay on Stuffsy." },
  "profile-details": { title: "Profile details", description: "Your name, photo and password." },
  notifications: { title: "Notifications", description: "Choose what we tell you about, and how." },
  settings: { title: "Settings", description: "Account preferences." },
};

function isTab(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
  return letters.toUpperCase() || "U";
}

const EMPTY_ADDRESS = {
  label: "Home",
  recipientName: "",
  phoneNumber: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
};

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

type PrefsState = {
  orderUpdates: boolean;
  marketing: boolean;
  priceDrop: boolean;
  abandonedCart: boolean;
  recentlyViewed: boolean;
};

function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<PrefsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void apiRequest<{ prefs: PrefsState; pushConfigured?: boolean }>(
      "GET",
      "/api/account/notification-prefs"
    ).then((result) => {
      if (result.data?.prefs) setPrefs(result.data.prefs);
      if (typeof result.data?.pushConfigured === "boolean") {
        setPushConfigured(result.data.pushConfigured);
      }
    });
  }, []);

  if (!prefs) {
    return <p className={styles.muted}>Loading preferences…</p>;
  }

  const rows: Array<{ key: keyof PrefsState; label: string; hint: string }> = [
    {
      key: "orderUpdates",
      label: "Order updates",
      hint: "Confirmation, shipping, out for delivery and delivered.",
    },
    {
      key: "marketing",
      label: "Offers & discounts",
      hint: "Coupon campaigns from Stuffsy.",
    },
    {
      key: "priceDrop",
      label: "Cart price drops",
      hint: "When an item in your cart gets cheaper.",
    },
    {
      key: "abandonedCart",
      label: "Cart reminders",
      hint: "When you leave items in your cart.",
    },
    {
      key: "recentlyViewed",
      label: "Recently viewed digests",
      hint: "Occasional reminders of pieces you browsed.",
    },
  ];

  const runPush = (mode: "enable" | "disable") => {
    void (async () => {
      setPushBusy(true);
      setMessage(null);
      const push = await import("@/utils/push");
      const result = mode === "enable" ? await push.enableBrowserPush() : await push.disableBrowserPush();
      setPushBusy(false);
      setMessage({ tone: "info", text: result.message });
    })();
  };

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Browser notifications</h2>
            <p className={styles.panelSub}>
              {pushConfigured
                ? "Get live order updates on this device."
                : "Browser push isn’t available yet. Email notifications still work."}
            </p>
          </div>
        </div>
        <div className={styles.buttonRow}>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Bell size={14} />}
            disabled={pushBusy || !pushConfigured}
            onClick={() => runPush("enable")}
          >
            {pushBusy ? "Working…" : "Enable on this device"}
          </Button>
          <Button variant="secondary" size="sm" disabled={pushBusy} onClick={() => runPush("disable")}>
            Turn off on this device
          </Button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>What we send you</h2>
            <p className={styles.panelSub}>
              By email, and by browser push when enabled. Sign-in and password emails are always sent.
            </p>
          </div>
        </div>
        <div className={styles.prefList}>
          {rows.map((row) => (
            <label key={row.key} className={styles.prefRow}>
              <span className={styles.prefCopy}>
                <strong>{row.label}</strong>
                <span className={styles.prefHint}>{row.hint}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className={styles.switch}
                checked={prefs[row.key]}
                disabled={saving}
                onChange={(e) => setPrefs((p) => (p ? { ...p, [row.key]: e.target.checked } : p))}
              />
            </label>
          ))}
        </div>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <div className={styles.panelActions}>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => {
              void (async () => {
                setSaving(true);
                setMessage(null);
                const result = await apiRequest<{ prefs: PrefsState }>(
                  "PATCH",
                  "/api/account/notification-prefs",
                  { body: prefs }
                );
                setSaving(false);
                if (result.error) {
                  setMessage({ tone: "danger", text: result.error });
                  return;
                }
                if (result.data?.prefs) setPrefs(result.data.prefs);
                setMessage({ tone: "success", text: "Preferences saved." });
              })();
            }}
          >
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </section>
    </div>
  );
}

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
        `Order · ${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`,
      date: new Date(order.createdAt).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      price: order.totalAmount,
      qty: order.itemCount,
      status: formatOrderStatusLabel(order.status),
      statusKey: order.status,
      image:
        order.previewThumbnailUrl ||
        firstItem?.productThumbnailUrl ||
        FALLBACK_PRODUCT_IMAGE,
      orderNumber: order.orderNumber,
    };
  });
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <p className={styles.muted}>Loading account…</p>
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
  const [activeTab, setActiveTab] = useState<TabKey>(isTab(tabParam) ? tabParam : "dashboard");
  const [recentOrders, setRecentOrders] = useState<DisplayOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileDob, setProfileDob] = useState("");
  const [profileGender, setProfileGender] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressMsg, setAddressMsg] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    if (isTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    setNavOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

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
      setOrdersLoading(true);
      const list = await fetchOrders(1, activeTab === "orders" ? 20 : 5);
      if (cancelled) return;

      // Only fetch full details for orders the list endpoint did not preview.
      const detailEntries = await Promise.all(
        list.orders
          .filter((order) => !order.previewTitle || !order.previewThumbnailUrl)
          .slice(0, activeTab === "orders" ? 10 : 3)
          .map(async (order) => {
            const detail = await fetchOrderDetail(order.id);
            return [order.id, detail] as const;
          })
      );
      if (cancelled) return;

      setOrdersTotal(list.total);
      setRecentOrders(mapOrdersForDisplay(list.orders, new Map(detailEntries)));
      setOrdersLoading(false);

      const addressList = await fetchAddresses();
      if (!cancelled) {
        setAddresses(addressList);
      }

      if (!cancelled) {
        setProfileName(sessionUser.fullName ?? "");
        setProfilePhone(sessionUser.phoneNumber ?? "");
        setProfileDob(sessionUser.dateOfBirth ?? "");
        setProfileGender(sessionUser.gender ?? "");
      }

      if (pendingOrderId) {
        const fromList = list.orders.find((order) => order.id === pendingOrderId);
        const status =
          fromList?.status ??
          (await fetchOrderDetail(pendingOrderId))?.status ??
          "pending_payment";
        const ref = fromList?.orderNumber ? `#${fromList.orderNumber}` : "Your order";
        setPendingNotice(
          status === "pending_payment"
            ? `${ref} is waiting for payment. Complete payment to confirm it.`
            : `${ref} was placed (${formatOrderStatusLabel(status)}).`
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

  const changeTab = (tab: TabKey) => {
    setActiveTab(tab);
    setNavOpen(false);
    router.replace(tab === "dashboard" ? "/account" : `/account?tab=${tab}`, { scroll: false });
  };

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const memberSinceDate = sessionUser?.createdAt ? new Date(sessionUser.createdAt) : null;

  const user = {
    name: sessionUser?.fullName ?? "",
    email: sessionUser?.email ?? "",
    phone: sessionUser?.phoneNumber || "Not added",
    memberSince: memberSinceDate
      ? memberSinceDate.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })
      : "—",
    status: sessionUser?.status ?? "active",
    address: defaultAddress
      ? [defaultAddress.line1, defaultAddress.line2, defaultAddress.city, defaultAddress.state, defaultAddress.postalCode]
          .filter(Boolean)
          .join(", ")
      : "No address saved yet",
    avatarUrl: sessionUser?.avatarUrl ?? null,
    avatarInitials: initialsFromName(sessionUser?.fullName ?? ""),
    emailVerified: Boolean(sessionUser?.emailVerifiedAt),
  };

  const stats = [
    {
      val: ordersTotal.toLocaleString("en-IN"),
      label: "Orders",
      tab: "orders" as TabKey,
      linkText: "View orders",
      Icon: ShoppingBag,
      tone: styles.toneViolet,
    },
    {
      val: wishlistCount.toLocaleString("en-IN"),
      label: "Wishlist items",
      tab: "wishlist" as TabKey,
      linkText: "View wishlist",
      Icon: Heart,
      tone: styles.toneRed,
    },
    {
      val: addresses.length.toLocaleString("en-IN"),
      label: "Saved addresses",
      tab: "addresses" as TabKey,
      linkText: "Manage addresses",
      Icon: MapPin,
      tone: styles.toneBlue,
    },
    {
      val: memberSinceDate
        ? memberSinceDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
        : "—",
      label: "Member since",
      tab: "profile-details" as TabKey,
      linkText: "Edit profile",
      Icon: Calendar,
      tone: styles.toneAmber,
    },
  ];

  if (authStatus !== "ready" || !sessionUser) {
    return (
      <div className={styles.container}>
        <p className={styles.muted}>Checking your session…</p>
      </div>
    );
  }

  const avatar = (className: string) =>
    user.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={optimizedImage(user.avatarUrl, 160)} alt="" className={className} />
    ) : (
      <div className={className} aria-hidden>
        {user.avatarInitials}
      </div>
    );

  const ordersList = (
    <div className={styles.ordersList}>
      {ordersLoading && recentOrders.length === 0 ? <p className={styles.muted}>Loading orders…</p> : null}
      {!ordersLoading && recentOrders.length === 0 ? (
        <EmptyState
          bare
          icon={<ShoppingBag size={22} />}
          title="No orders yet"
          description="When you place an order, you can track it here."
          action={<ButtonLink href="/shop" size="sm">Start shopping</ButtonLink>}
        />
      ) : null}
      {recentOrders.map((order) => (
        <Link key={order.id} href={`/orders/${order.id}/details`} className={styles.orderRow}>
          <div className={styles.orderImgWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedImage(order.image, 160)}
              alt=""
              className={styles.orderImg}
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE;
              }}
            />
          </div>
          <div className={styles.orderInfo}>
            <span className={styles.orderTitle}>{order.title}</span>
            <span className={styles.orderId}>
              #{order.orderNumber || order.id.slice(0, 8)} · {order.date}
            </span>
          </div>
          <div className={styles.orderMeta}>
            <span className={styles.orderPrice}>₹{order.price.toLocaleString("en-IN")}</span>
            <StatusPill status={order.statusKey}>{order.status}</StatusPill>
          </div>
        </Link>
      ))}
    </div>
  );

  const heading = TAB_TITLES[activeTab];

  return (
    <div className={styles.container}>
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        {activeTab === "dashboard" ? (
          <Breadcrumbs.Item active>My account</Breadcrumbs.Item>
        ) : (
          <Breadcrumbs.Item href="/account">My account</Breadcrumbs.Item>
        )}
        {activeTab !== "dashboard" ? <Breadcrumbs.Item active>{heading.title}</Breadcrumbs.Item> : null}
      </Breadcrumbs>

      <div className={styles.layout}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X size={16} /> : <Menu size={16} />}
          {TABS.find((tab) => tab.key === activeTab)?.label ?? "Account menu"}
        </button>
        {navOpen ? (
          <button
            type="button"
            className={styles.navScrim}
            aria-label="Close account menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <Sidebar open={navOpen}>
          <div className={styles.sidebarUser}>
            {avatar(styles.sidebarAvatar)}
            <div className={styles.sidebarUserText}>
              <strong>{user.name || "Your account"}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <Sidebar.Nav>
            {TABS.map((tab) => (
              <Sidebar.Item
                key={tab.key}
                icon={<tab.Icon size={18} />}
                active={activeTab === tab.key}
                onClick={() => changeTab(tab.key)}
              >
                {tab.label}
              </Sidebar.Item>
            ))}
            {sessionUser.isSeller || sessionUser.role === "admin" ? (
              <span className={styles.navDivider} role="separator" />
            ) : null}
            {sessionUser.isSeller ? (
              <Sidebar.Item icon={<Store size={18} />} href="/seller" onClick={() => setNavOpen(false)}>
                Seller hub
              </Sidebar.Item>
            ) : null}
            {sessionUser.role === "admin" ? (
              <Sidebar.Item icon={<ShieldCheck size={18} />} href="/admin" onClick={() => setNavOpen(false)}>
                Admin console
              </Sidebar.Item>
            ) : null}
            <span className={styles.navDivider} role="separator" />
            <Sidebar.Item
              icon={<LogOut size={18} />}
              onClick={() => {
                setNavOpen(false);
                void logout().then(() => {
                  router.replace("/login");
                });
              }}
            >
              Sign out
            </Sidebar.Item>
          </Sidebar.Nav>

          {sessionUser.isSeller ? null : (
            <Sidebar.Callout
              title="Sell on Stuffsy"
              description="Open your own shop and reach buyers across India."
              buttonText="Start selling"
              onButtonClick={() => router.push("/sell")}
            />
          )}
        </Sidebar>

        <div className={styles.mainContent}>
          <div className={styles.headerArea}>
            <h1 className={styles.pageTitle}>{heading.title}</h1>
            <p className={styles.welcomeText}>
              {activeTab === "dashboard"
                ? `Welcome back${user.name ? `, ${user.name.split(/\s+/)[0]}` : ""}.`
                : heading.description}
            </p>
          </div>

          {pendingNotice ? <Notice tone="warning">{pendingNotice}</Notice> : null}

          {activeTab === "dashboard" ? (
            <>
              <section className={styles.profileCard}>
                <div className={styles.profileLeft}>
                  {avatar(styles.avatar)}
                  <div className={styles.profileDetails}>
                    <div className={styles.nameRow}>
                      <h2 className={styles.profileName}>{user.name}</h2>
                      {user.emailVerified ? (
                        <StatusPill tone="success">Verified</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Email not verified</StatusPill>
                      )}
                    </div>
                    <div className={styles.contactRow}>
                      <span className={styles.contactItem}>
                        <Mail size={14} />
                        {user.email}
                      </span>
                      <span className={styles.contactItem}>
                        <Phone size={14} />
                        {user.phone}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Edit3 size={14} />}
                  onClick={() => changeTab("profile-details")}
                >
                  Edit profile
                </Button>
              </section>

              <div className={styles.statsRow}>
                {stats.map((stat) => (
                  <button
                    key={stat.label}
                    type="button"
                    className={styles.statCard}
                    onClick={() => changeTab(stat.tab)}
                  >
                    <span className={`${styles.statIconWrapper} ${stat.tone}`} aria-hidden="true">
                      <stat.Icon size={20} />
                    </span>
                    <span className={styles.statValCol}>
                      <span className={styles.statNumber}>{stat.val}</span>
                      <span className={styles.statLabel}>{stat.label}</span>
                      <span className={styles.statLink}>
                        {stat.linkText}
                        <ArrowRight size={11} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className={styles.splitGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h2 className={styles.panelTitle}>Recent orders</h2>
                    {recentOrders.length > 0 ? (
                      <button type="button" className={styles.viewAllLink} onClick={() => changeTab("orders")}>
                        View all
                        <ArrowRight size={12} />
                      </button>
                    ) : null}
                  </div>
                  {ordersList}
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHead}>
                    <h2 className={styles.panelTitle}>Account overview</h2>
                  </div>
                  <dl className={styles.overviewList}>
                    {[
                      { Icon: User, label: "Full name", value: user.name },
                      { Icon: Mail, label: "Email", value: user.email },
                      { Icon: Phone, label: "Phone", value: user.phone },
                      { Icon: Calendar, label: "Member since", value: user.memberSince },
                      { Icon: MapPin, label: "Default address", value: user.address },
                    ].map((row) => (
                      <div key={row.label} className={styles.overviewRow}>
                        <span className={styles.overviewIcon} aria-hidden="true">
                          <row.Icon size={16} />
                        </span>
                        <div className={styles.overviewLabelCol}>
                          <dt className={styles.overviewLabel}>{row.label}</dt>
                          <dd className={styles.overviewVal}>{row.value}</dd>
                        </div>
                      </div>
                    ))}
                    <div className={styles.overviewRow}>
                      <span className={styles.overviewIcon} aria-hidden="true">
                        <ShieldCheck size={16} />
                      </span>
                      <div className={styles.overviewLabelCol}>
                        <dt className={styles.overviewLabel}>Account status</dt>
                        <dd>
                          <StatusPill status={user.status} />
                        </dd>
                      </div>
                    </div>
                  </dl>
                </section>
              </div>
            </>
          ) : null}

          {activeTab === "orders" ? (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>
                  {ordersTotal > 0 ? `${ordersTotal.toLocaleString("en-IN")} orders` : "Orders"}
                </h2>
              </div>
              {ordersList}
            </section>
          ) : null}

          {activeTab === "wishlist" ? (
            <section className={styles.panel}>
              {wishlistItems.length === 0 ? (
                <EmptyState
                  bare
                  icon={<Heart size={22} />}
                  title="Your wishlist is empty"
                  description="Tap the heart on any product to save it here."
                  action={<ButtonLink href="/shop" size="sm">Discover products</ButtonLink>}
                />
              ) : (
                <div className={styles.ordersList}>
                  {wishlistItems.map((item) => (
                    <div key={item.id} className={styles.orderRow}>
                      <Link href={productHref({ slug: item.slug })} className={styles.wishLink}>
                        <span className={styles.orderImgWrapper}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={optimizedImage(item.thumbnailUrl || FALLBACK_PRODUCT_IMAGE, 160)}
                            alt=""
                            className={styles.orderImg}
                          />
                        </span>
                        <span className={styles.orderInfo}>
                          <span className={styles.orderTitle}>{item.title}</span>
                          <span className={styles.orderId}>{item.shopName}</span>
                        </span>
                      </Link>
                      <div className={styles.orderMeta}>
                        <span className={styles.orderPrice}>₹{item.price.toLocaleString("en-IN")}</span>
                        <button
                          type="button"
                          className={styles.textDanger}
                          onClick={() => {
                            void toggleWishlist(item.productId, true).then(async () => {
                              const wish = await fetchWishlist();
                              setWishlistItems(wish.items);
                              setWishlistCount(wish.total || wish.items.length);
                            });
                          }}
                        >
                          <Trash2 size={13} />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeTab === "addresses" ? (
            <>
              {addresses.length === 0 ? (
                <EmptyState
                  icon={<MapPin size={22} />}
                  title="No saved addresses"
                  description="Add an address below to check out faster."
                />
              ) : (
                <div className={styles.addressGrid}>
                  {addresses.map((addr) => (
                    <article key={addr.id} className={styles.addressCard}>
                      <div className={styles.addressHead}>
                        <strong>{addr.label}</strong>
                        {addr.isDefault ? <StatusPill tone="brand">Default</StatusPill> : null}
                      </div>
                      <p className={styles.addressName}>{addr.recipientName}</p>
                      <p className={styles.addressLines}>
                        {[addr.line1, addr.line2, addr.city, addr.state, addr.postalCode]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      <p className={styles.addressPhone}>
                        <Phone size={13} /> {addr.phoneNumber}
                      </p>
                      <button
                        type="button"
                        className={styles.textDanger}
                        disabled={addressBusy}
                        onClick={() => {
                          if (!window.confirm(`Remove the “${addr.label}” address?`)) return;
                          void (async () => {
                            setAddressBusy(true);
                            try {
                              await deleteAddress(addr.id);
                              setAddresses(await fetchAddresses());
                            } finally {
                              setAddressBusy(false);
                            }
                          })();
                        }}
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>Add a new address</h2>
                    <p className={styles.panelSub}>
                      {addresses.length === 0 ? "Your first address becomes the default." : "Saved for faster checkout."}
                    </p>
                  </div>
                </div>
                <form
                  className={styles.fieldGrid}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void (async () => {
                      setAddressBusy(true);
                      setAddressMsg(null);
                      try {
                        await createAddress({
                          ...newAddress,
                          line2: newAddress.line2 || null,
                          isDefault: addresses.length === 0,
                        });
                        setAddresses(await fetchAddresses());
                        setNewAddress(EMPTY_ADDRESS);
                        setAddressMsg({ tone: "success", text: "Address saved." });
                      } catch (error) {
                        setAddressMsg({
                          tone: "danger",
                          text: error instanceof Error ? error.message : "Could not save the address.",
                        });
                      } finally {
                        setAddressBusy(false);
                      }
                    })();
                  }}
                >
                  {(
                    [
                      ["label", "Label", "Home, Work…", false, true],
                      ["recipientName", "Full name", "", false, true],
                      ["phoneNumber", "Phone", "10-digit mobile", false, true],
                      ["postalCode", "PIN code", "6 digits", false, true],
                      ["line1", "Address line 1", "House no., street", true, true],
                      ["line2", "Address line 2 (optional)", "Area, landmark", true, false],
                      ["city", "City", "", false, true],
                      ["state", "State", "", false, true],
                    ] as const
                  ).map(([key, label, placeholder, wide, required]) => (
                    <label key={key} className={`${styles.formField} ${wide ? styles.fieldWide : ""}`}>
                      {label}
                      <input
                        value={newAddress[key]}
                        placeholder={placeholder}
                        required={required}
                        inputMode={key === "phoneNumber" || key === "postalCode" ? "numeric" : undefined}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                  {addressMsg ? (
                    <div className={styles.fieldWide}>
                      <Notice tone={addressMsg.tone}>{addressMsg.text}</Notice>
                    </div>
                  ) : null}
                  <div className={`${styles.fieldWide} ${styles.panelActions}`}>
                    <Button type="submit" disabled={addressBusy}>
                      {addressBusy ? "Saving…" : "Save address"}
                    </Button>
                  </div>
                </form>
              </section>
            </>
          ) : null}

          {activeTab === "notifications" ? <NotificationPrefsPanel /> : null}

          {activeTab === "reviews" ? (
            <section className={styles.panel}>
              <MyReviews
                emptyAction={
                  <Button size="sm" variant="outline" onClick={() => changeTab("orders")}>
                    Go to my orders
                  </Button>
                }
              />
            </section>
          ) : null}

          {activeTab === "payment-methods" ? (
            <section className={styles.panel}>
              <EmptyState
                bare
                icon={<CreditCard size={22} />}
                title="No saved payment methods"
                description="Stuffsy doesn’t store your cards or UPI details. You pay securely through Razorpay each time you check out."
              />
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className={styles.panel}>
              <EmptyState
                bare
                icon={<SettingsIcon size={22} />}
                title="Nothing else to configure yet"
                description="Manage your profile, addresses and notifications from the menu."
                action={
                  <Button size="sm" variant="outline" onClick={() => changeTab("profile-details")}>
                    Edit profile
                  </Button>
                }
              />
            </section>
          ) : null}

          {activeTab === "profile-details" ? (
            <div className={styles.profileEditor}>
              <section className={styles.panel}>
                <div className={styles.editorIdentity}>
                  {avatar(styles.avatar)}
                  <div className={styles.avatarCopy}>
                    <h2 className={styles.panelTitle}>{user.name || "Your profile"}</h2>
                    <p className={styles.panelSub}>
                      Past orders keep the name and address used at checkout.
                    </p>
                    <div className={styles.avatarActions}>
                      <label className={styles.avatarUpload}>
                        {avatarBusy ? "Uploading…" : user.avatarUrl ? "Change photo" : "Add photo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={avatarBusy}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            if (file.size > 4_500_000) {
                              setProfileMsg({ tone: "danger", text: "Choose a photo under 4.5 MB." });
                              return;
                            }
                            void (async () => {
                              setAvatarBusy(true);
                              setProfileMsg(null);
                              try {
                                const dataBase64 = await new Promise<string>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onload = () => resolve(String(reader.result ?? ""));
                                  reader.onerror = () => reject(new Error("Could not read file"));
                                  reader.readAsDataURL(file);
                                });
                                const result = await uploadMyAvatar({
                                  dataBase64,
                                  fileName: file.name,
                                });
                                if (result.error || !result.data?.user) {
                                  setProfileMsg({ tone: "danger", text: result.error ?? "Could not upload photo" });
                                  return;
                                }
                                setUser(result.data.user);
                                setProfileMsg({ tone: "success", text: "Profile photo updated." });
                                void refreshSession();
                              } catch {
                                setProfileMsg({ tone: "danger", text: "Could not upload photo" });
                              } finally {
                                setAvatarBusy(false);
                              }
                            })();
                          }}
                        />
                      </label>
                      {user.avatarUrl ? (
                        <button
                          type="button"
                          className={styles.avatarRemove}
                          disabled={avatarBusy}
                          onClick={() => {
                            void (async () => {
                              setAvatarBusy(true);
                              setProfileMsg(null);
                              const result = await updateMyProfile({ avatarUrl: null });
                              setAvatarBusy(false);
                              if (result.error || !result.data?.user) {
                                setProfileMsg({ tone: "danger", text: result.error ?? "Could not remove photo" });
                                return;
                              }
                              setUser(result.data.user);
                              setProfileMsg({ tone: "success", text: "Profile photo removed." });
                              void refreshSession();
                            })();
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.formField}>
                    Full name
                    <input
                      value={profileName}
                      autoComplete="name"
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </label>
                  <label className={styles.formField}>
                    Phone
                    <input
                      value={profilePhone}
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="10-digit mobile"
                      onChange={(e) => setProfilePhone(e.target.value)}
                    />
                  </label>
                  <label className={styles.formField}>
                    Date of birth
                    <input
                      type="date"
                      value={profileDob}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setProfileDob(e.target.value)}
                    />
                  </label>
                  <label className={styles.formField}>
                    Gender
                    <select value={profileGender} onChange={(e) => setProfileGender(e.target.value)}>
                      <option value="">Not set</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label className={`${styles.formField} ${styles.fieldWide}`}>
                    <span className={styles.labelWithPill}>
                      Email
                      {user.emailVerified ? (
                        <StatusPill tone="success">Verified</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Not verified</StatusPill>
                      )}
                    </span>
                    <input value={sessionUser.email} readOnly />
                  </label>
                </div>
                {profileMsg ? <Notice tone={profileMsg.tone}>{profileMsg.text}</Notice> : null}
                <div className={styles.panelActions}>
                  <Button
                    disabled={profileBusy}
                    onClick={() => {
                      void (async () => {
                        const name = profileName.trim();
                        const phone = profilePhone.trim();
                        if (name.length < 2) {
                          setProfileMsg({ tone: "danger", text: "Enter your full name." });
                          return;
                        }
                        if (phone && phone.replace(/\D/g, "").length < 8) {
                          setProfileMsg({ tone: "danger", text: "Enter a valid phone number, or leave it blank." });
                          return;
                        }
                        setProfileBusy(true);
                        setProfileMsg(null);
                        const result = await updateMyProfile({
                          fullName: name,
                          phoneNumber: phone || null,
                          dateOfBirth: profileDob || null,
                          gender: profileGender ? profileGender : null,
                        });
                        setProfileBusy(false);
                        if (result.error || !result.data?.user) {
                          setProfileMsg({ tone: "danger", text: result.error ?? "Could not update profile" });
                          return;
                        }
                        setUser(result.data.user);
                        setProfileName(result.data.user.fullName ?? "");
                        setProfilePhone(result.data.user.phoneNumber ?? "");
                        setProfileDob(result.data.user.dateOfBirth ?? "");
                        setProfileGender(result.data.user.gender ?? "");
                        setProfileMsg({ tone: "success", text: "Profile updated." });
                        void refreshSession();
                      })();
                    }}
                  >
                    {profileBusy ? "Saving…" : "Save profile"}
                  </Button>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>Password</h2>
                    <p className={styles.panelSub}>
                      You stay signed in here. Other devices are signed out.
                    </p>
                  </div>
                </div>
                <div className={styles.formStack}>
                  <label className={styles.formField}>
                    Current password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </label>
                  <label className={styles.formField}>
                    New password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={nextPassword}
                      onChange={(e) => setNextPassword(e.target.value)}
                    />
                  </label>
                  <label className={styles.formField}>
                    Confirm new password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </label>
                </div>
                {passwordMsg ? <Notice tone={passwordMsg.tone}>{passwordMsg.text}</Notice> : null}
                <div className={styles.panelActions}>
                  <Button
                    variant="outline"
                    disabled={passwordBusy}
                    onClick={() => {
                      void (async () => {
                        if (!currentPassword) {
                          setPasswordMsg({ tone: "danger", text: "Enter your current password." });
                          return;
                        }
                        if (nextPassword.length < 8) {
                          setPasswordMsg({ tone: "danger", text: "New password must be at least 8 characters." });
                          return;
                        }
                        if (nextPassword !== confirmPassword) {
                          setPasswordMsg({ tone: "danger", text: "New password and confirmation do not match." });
                          return;
                        }
                        setPasswordBusy(true);
                        setPasswordMsg(null);
                        const result = await changeMyPassword({
                          currentPassword,
                          newPassword: nextPassword,
                        });
                        setPasswordBusy(false);
                        if (result.error) {
                          setPasswordMsg({ tone: "danger", text: result.error });
                          return;
                        }
                        setCurrentPassword("");
                        setNextPassword("");
                        setConfirmPassword("");
                        setPasswordMsg({ tone: "success", text: "Password updated." });
                      })();
                    }}
                  >
                    {passwordBusy ? "Updating…" : "Update password"}
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
