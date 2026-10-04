import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeIndianRupee,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  HandHeart,
  MapPin,
  Package,
  Palette,
  Palmtree,
  Phone,
  Plus,
  Receipt,
  ShieldCheck,
  Star,
  Store,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import CategoryIcon from "@/components/brand/CategoryIcon";
import { SELLER_TAGLINE } from "@/components/brand/tagline";
import { Asterisk, Blob, BrushUnderline, DoodleArrow, Squiggle } from "@/components/art/Doodles";
import InstagramIcon from "@/components/brand/InstagramIcon";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, SUPPORT_EMAIL, supportMailto } from "@/utils/support";
import SellCta from "./SellCta";
import styles from "./sell-info.module.css";

export const metadata: Metadata = {
  title: "Sell on Stuffsy",
  description:
    "Open a shop for your handmade work on Stuffsy. List products, get orders from buyers across India, and let us handle payments and courier pickups.",
};

const BENEFITS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  {
    Icon: Store,
    title: "A shop that looks like you",
    text: "Your own shop page with logo, banner, story and policies, at a link that follows your shop name.",
  },
  {
    Icon: Users,
    title: "Buyers who love handmade",
    text: "Shoppers come to Stuffsy for one-of-a-kind pieces, so your work isn't buried under mass-made goods.",
  },
  {
    Icon: ShieldCheck,
    title: "Payments handled",
    text: "Buyers pay online or with cash on delivery. We collect the money and pay you out.",
  },
  {
    Icon: Truck,
    title: "Shipping made simple",
    text: "Save your pickup address once. We book the courier, they collect from you, buyers get tracking.",
  },
  {
    Icon: Bell,
    title: "Never miss an order",
    text: "New orders reach you by email, WhatsApp and in your seller hub, the moment they're placed.",
  },
  {
    Icon: Receipt,
    title: "Invoices on autopilot",
    text: "A proper tax invoice is generated for every order, so your paperwork stays tidy.",
  },
];

const STEPS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: Palette, title: "Pick what you make", text: "Choose the categories that fit your work." },
  { Icon: Store, title: "Name your shop", text: "Add a shop name and phone number. GSTIN is optional." },
  { Icon: MapPin, title: "Add a pickup address", text: "Where the courier collects your parcels." },
  { Icon: Package, title: "List and start selling", text: "Once your shop is approved, add products and go live." },
];

const NEEDS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: Phone, title: "A mobile number", text: "For order updates and courier calls." },
  { Icon: MapPin, title: "A pickup address", text: "Your home or studio works." },
  { Icon: Wallet, title: "UPI ID or bank account", text: "Where your payouts go." },
  { Icon: Palette, title: "Photos of your work", text: "Clear, well-lit shots sell best." },
  { Icon: BadgeIndianRupee, title: "GSTIN (optional)", text: "Needed only to sell outside your state." },
];

const TOOLS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: Gauge, title: "Dashboard", text: "Sales, orders and best sellers at a glance." },
  { Icon: ClipboardList, title: "Orders", text: "Accept, pack and track every order in one place." },
  { Icon: Tags, title: "Products", text: "Variants, stock levels and low-stock alerts." },
  { Icon: CalendarClock, title: "Dispatch times", text: "Tell buyers when each product ships." },
  { Icon: Star, title: "Reviews", text: "Buyers rate their orders and build your reputation." },
  { Icon: Palmtree, title: "Vacation mode", text: "Pause new orders while you take a break." },
];

/** Mirrors the categories sellers pick in the registration wizard. */
const CATEGORIES = [
  { slug: "home-decor", name: "Home Decor", iconUrl: "Home" },
  { slug: "jewelry", name: "Jewelry", iconUrl: "Gem" },
  { slug: "wall-art", name: "Wall Art", iconUrl: "Image" },
  { slug: "clothing", name: "Clothing", iconUrl: "Shirt" },
  { slug: "accessories", name: "Accessories", iconUrl: "ShoppingBag" },
  { slug: "candles", name: "Candles", iconUrl: "Flame" },
  { slug: "kitchen", name: "Kitchen", iconUrl: "CookingPot" },
  { slug: "toys-games", name: "Toys & Games", iconUrl: "ToyBrick" },
  { slug: "crafts", name: "Crafts", iconUrl: "Scissors" },
  { slug: "stationery", name: "Stationery", iconUrl: "NotebookPen" },
  { slug: "gift-sets", name: "Gift Sets", iconUrl: "Gift" },
  { slug: "pet-supplies", name: "Pet Supplies", iconUrl: "PawPrint" },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Do I need a GST number to sell?",
    a: "No. Without a GSTIN you can sell to buyers in your own state. Add and verify your GSTIN in Shop setup to sell across India.",
  },
  {
    q: "How do I get paid?",
    a: "Buyers pay online or with cash on delivery. Payouts go to the UPI ID or bank account you add under Shop setup → Payment & billing. Commission and payout terms are shown in the seller terms before you create your shop.",
  },
  {
    q: "Who handles shipping?",
    a: "You pack the order. We book the courier to collect it from your pickup address and share tracking with the buyer.",
  },
  {
    q: "When can I start selling?",
    a: "Our team reviews every new shop. While you wait, finish your shop setup: logo, banner, policies and pickup address. You can list products as soon as your shop is active.",
  },
  {
    q: "What can I sell?",
    a: "Handmade, hand-finished and one-of-a-kind items across categories like home decor, jewellery, art, clothing and gifts. Illegal or restricted items aren't allowed.",
  },
  {
    q: "Can I take a break or rename my shop later?",
    a: "Yes. Turn on vacation mode to pause new orders, and rename your shop any time; your shop link updates to match.",
  },
];

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.mark}>
      {children}
      <BrushUnderline className={styles.markStroke} />
    </span>
  );
}

export default function SellOnStuffsyPage() {
  return (
    <div className={styles.page}>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.handKicker}>for makers &amp; artists</p>
          <h1 className={styles.heroTitle}>
            Sell Your Stuff, <Mark>your Way</Mark>
          </h1>
          <p className={styles.heroText}>
            Stuffsy is the marketplace for handmade. Open a shop in minutes, list what you make,
            and reach buyers across India while we handle payments and courier pickups.
          </p>
          <div className={styles.heroActions}>
            <SellCta />
            <a href="#how-it-works" className={styles.textLink}>
              See how it works
            </a>
          </div>
          <ul className={styles.heroFacts}>
            <li>
              <CheckCircle2 size={16} aria-hidden="true" /> Set up in minutes
            </li>
            <li>
              <CheckCircle2 size={16} aria-hidden="true" /> No GSTIN needed to start
            </li>
            <li>
              <CheckCircle2 size={16} aria-hidden="true" /> UPI or bank payouts
            </li>
          </ul>
        </div>

        <div className={styles.heroArt} aria-hidden="true">
          <div className={`${styles.note} ${styles.noteOrder}`}>
            <span className={styles.noteIcon}>
              <Bell size={18} />
            </span>
            <span>
              <small>Just now</small>
              <strong>New order received</strong>
            </span>
          </div>
          <div className={`${styles.note} ${styles.noteShip}`}>
            <span className={styles.noteIcon}>
              <Truck size={18} />
            </span>
            <span>
              <small>Courier booked</small>
              <strong>Ready for pickup</strong>
            </span>
          </div>
          <div className={`${styles.note} ${styles.noteStar}`}>
            <span className={styles.noteIcon}>
              <Star size={18} />
            </span>
            <span>
              <small>New review</small>
              <strong>Rated 5 stars</strong>
            </span>
          </div>
          <div className={styles.heroShop}>
            <span className={styles.heroShopIcon}>
              <Blob className={styles.heroShopBlob} />
              <HandHeart size={40} strokeWidth={1.5} className={styles.heroShopGlyph} />
            </span>
            <strong>Your shop</strong>
            <span className={styles.handLine}>made by you</span>
          </div>
          <Asterisk className={styles.artStar} />
          <Squiggle className={styles.artSquiggle} />
        </div>
      </section>

      {/* ── Benefits ───────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="why-title">
        <div className={styles.sectionHead}>
          <p className={styles.handKicker}>why sell here?</p>
          <h2 id="why-title" className={styles.sectionTitle}>
            Everything a maker needs, <Mark>nothing they don&apos;t</Mark>
          </h2>
        </div>
        <ul className={styles.benefits}>
          {BENEFITS.map(({ Icon, title, text }, index) => (
            <li key={title} className={styles.benefit}>
              <span className={styles.benefitIcon}>
                <Blob className={styles.benefitBlob} variant={index} />
                <Icon size={24} strokeWidth={1.75} className={styles.benefitGlyph} aria-hidden="true" />
              </span>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section id="how-it-works" className={styles.howBand} aria-labelledby="how-title">
        <div className={styles.sectionHead}>
          <p className={styles.handKicker}>how it works</p>
          <h2 id="how-title" className={styles.sectionTitle}>
            From your table to their door in <Mark>4 steps</Mark>
          </h2>
        </div>
        <ol className={styles.steps}>
          {STEPS.map(({ Icon, title, text }, index) => (
            <li key={title} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <span className={styles.stepIcon}>
                <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <strong>{title}</strong>
              <span>{text}</span>
              {index < STEPS.length - 1 ? <DoodleArrow className={styles.stepArrow} /> : null}
            </li>
          ))}
        </ol>
        <div className={styles.howCta}>
          <SellCta />
        </div>
      </section>

      {/* ── What you can sell + what you need ──────────────── */}
      <section className={styles.splitSection}>
        <div className={styles.panel} aria-labelledby="sell-what-title">
          <p className={styles.handKicker}>what you can sell</p>
          <h2 id="sell-what-title" className={styles.panelTitle}>
            If you made it, it belongs here
          </h2>
          <ul className={styles.categoryChips}>
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link href={`/shop?category=${category.slug}`} className={styles.chip}>
                  <CategoryIcon category={category} size={16} />
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className={`${styles.panel} ${styles.panelPaper}`} aria-labelledby="need-title">
          <p className={styles.handKicker}>what you&apos;ll need</p>
          <h2 id="need-title" className={styles.panelTitle}>
            Have these ready
          </h2>
          <ul className={styles.needs}>
            {NEEDS.map(({ Icon, title, text }) => (
              <li key={title} className={styles.need}>
                <span className={styles.needIcon}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Seller hub tools ───────────────────────────────── */}
      <section className={styles.section} aria-labelledby="tools-title">
        <div className={styles.sectionHead}>
          <p className={styles.handKicker}>your seller hub</p>
          <h2 id="tools-title" className={styles.sectionTitle}>
            Run your shop from <Mark>one place</Mark>
          </h2>
        </div>
        <ul className={styles.tools}>
          {TOOLS.map(({ Icon, title, text }) => (
            <li key={title} className={styles.tool}>
              <span className={styles.toolIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div className={styles.sectionHead}>
          <p className={styles.handKicker}>good questions</p>
          <h2 id="faq-title" className={styles.sectionTitle}>
            Before you open your shop
          </h2>
        </div>
        <div className={styles.faq}>
          {FAQ.map(({ q, a }) => (
            <details key={q} className={styles.faqItem}>
              <summary>
                {q}
                <Plus size={18} className={styles.faqIcon} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final call ─────────────────────────────────────── */}
      <section className={styles.finalBand}>
        <p className={styles.handKicker}>ready when you are</p>
        <h2 className={styles.finalTitle}>{SELLER_TAGLINE}</h2>
        <p className={styles.finalText}>It takes a few minutes to open your shop. Your first sale could be next.</p>
        <SellCta />
        <p className={styles.finalContact}>
          Questions first? Write to{" "}
          <a href={supportMailto("Selling on Stuffsy")}>{SUPPORT_EMAIL}</a> or message us on{" "}
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            <InstagramIcon size={14} /> {INSTAGRAM_HANDLE}
          </a>
        </p>
        <Asterisk className={styles.finalStarA} />
        <Asterisk className={styles.finalStarB} />
      </section>
    </div>
  );
}
