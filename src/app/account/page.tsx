"use client";

import React, { useState } from "react";
import Link from "next/link";

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

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  // User details
  const user = {
    name: "Nandita Sharma",
    email: "nandita@example.com",
    phone: "+91 98156 43210",
    memberSince: "May 10, 2024",
    status: "Active",
    address: "123, Green Street, Mumbai, Maharashtra 400001, India",
    avatar:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_nZ1bL9Vcq6_iyx6xBOSL2oaaTepkAAFPaw&s",
  };

  // Stats cards values
  const stats = [
    {
      val: "12",
      label: "Total Orders",
      linkText: "View all orders",
      href: "/account?tab=orders",
      icon: <ShoppingBag size={20} />,
      bg: "#f5f3ff", // purple-50
      color: "var(--color-primary)",
    },
    {
      val: "24",
      label: "Wishlist Items",
      linkText: "View wishlist",
      href: "/account?tab=wishlist",
      icon: <Heart size={20} />,
      bg: "#fff5f5", // red-50
      color: "var(--color-danger)",
    },
    {
      val: "18",
      label: "Reviews Given",
      linkText: "View reviews",
      href: "/account?tab=reviews",
      icon: <Star size={20} />,
      bg: "#fffbeb", // amber-50
      color: "var(--color-warning)",
    },
    {
      val: "5",
      label: "Saved Addresses",
      linkText: "Manage addresses",
      href: "/account?tab=addresses",
      icon: <MapPin size={20} />,
      bg: "#eff6ff", // blue-50
      color: "var(--color-info)",
    },
  ];

  // Recent Orders
  const recentOrders = [
    {
      id: "#SFY12345",
      title: "Boho Woven Wall Hanging",
      date: "May 20, 2024",
      price: 1599,
      qty: 1,
      status: "Delivered",
      image: "/images/product-woven-hanging.jpg",
    },
    {
      id: "#SFY12344",
      title: "Scented Soy Candle",
      date: "May 18, 2024",
      price: 799,
      qty: 1,
      status: "Delivered",
      image: "/images/product-soy-candle.jpg",
    },
    {
      id: "#SFY12343",
      title: "Beaded Flower Earrings",
      date: "May 15, 2024",
      price: 499,
      qty: 1,
      status: "Shipped",
      image: "/images/product-flower-earrings.jpg",
    },
  ];

  return (
    <div className={styles.container}>
      {/* Breadcrumbs */}
      <Breadcrumbs>
        <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
        <Breadcrumbs.Item active>My Account</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className={styles.layout}>
        {/* Sidebar Nav */}
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
              onClick={() => setActiveTab("seller-dashboard")}
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
              onClick={() => alert("Logging out...")}
            >
              Logout
            </Sidebar.Item>
          </Sidebar.Nav>

          {/* Sell Callout */}
          <Sidebar.Callout
            title="Sell on Stuffsy"
            description="Start your online store and grow your business with us."
            buttonText="Start Selling"
            onButtonClick={() => (window.location.href = "/sell")}
          />
        </Sidebar>

        {/* Dashboard Main Content */}
        <main className={styles.mainContent}>
          <div className={styles.headerArea}>
            <Heading level={2}>My Account</Heading>
            <span className={styles.welcomeText}>
              Welcome back, <strong>{user.name}</strong>! 👋
            </span>
          </div>

          {/* Profile Header */}
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
                  <span className={styles.verifiedBadge}>Verified</span>
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
            <Button variant="outline" size="sm" leftIcon={<Edit3 size={14} />}>
              Edit Profile
            </Button>
          </div>

          {/* Stats Row */}
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

          {/* Recent Orders & Overview splits */}
          <div className={styles.splitGrid}>
            {/* Recent Orders */}
            <div className={styles.splitSection}>
              <div className={styles.sectionHeader}>
                <Heading level={4}>Recent Orders</Heading>
                <Link href="/account?tab=orders" className={styles.viewAllLink}>
                  <span>View all orders</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
              <div className={styles.ordersList}>
                {recentOrders.map((order, idx) => (
                  <div key={idx} className={styles.orderRow}>
                    <div className={styles.orderImgWrapper}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={order.image}
                        alt={order.title}
                        className={styles.orderImg}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (order.title.includes("Woven")) {
                            target.src =
                              "https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?auto=format&fit=crop&q=80&w=100";
                          } else if (order.title.includes("Candle")) {
                            target.src =
                              "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=100";
                          } else {
                            target.src =
                              "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&q=80&w=100";
                          }
                        }}
                      />
                    </div>
                    <div className={styles.orderInfo}>
                      <span className={styles.orderTitle}>{order.title}</span>
                      <span className={styles.orderId}>
                        Order ID: {order.id}
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
                          order.status === "Delivered"
                            ? styles.delivered
                            : styles.shipped
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Account Overview */}
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
                    <span className={styles.overviewVal}>
                      {user.memberSince}
                    </span>
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
                    <span className={styles.overviewLabel}>
                      Default Address
                    </span>
                    <span className={styles.overviewVal}>{user.address}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
