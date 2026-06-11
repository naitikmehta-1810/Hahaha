import type { Metadata } from "next";
import { Mail, Lock, Eye, ArrowRight } from "lucide-react";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Stuffsy - Login",
  description: "Sign in to your Stuffsy account to manage orders, wishlist, and shop settings.",
};

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.grid}>
          <section className={styles.leftSection}>
            <div className={styles.logoBlock}>
              <div className={styles.logoMark}>sj</div>
              <div>
                <h1 className={styles.brand}>Stuffsy</h1>
                <p className={styles.tagline}>Sell Your Stuff, Your Way</p>
              </div>
            </div>

            <div className={styles.badge}>Welcome Back 👋</div>

            <h2 className={styles.heading}>
              Welcome
              <br />
              <span>Back 👋</span>
            </h2>

            <p className={styles.subheading}>
              Sign in to continue selling and managing your shop on Stuffsy.
            </p>

            <form className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  Email
                </label>
                <div className={styles.inputWrap}>
                  <Mail className={styles.inputIcon} size={18} />
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <div className={styles.inputWrap}>
                  <Lock className={styles.inputIcon} size={18} />
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className={styles.input}
                  />
                  <button type="button" className={styles.eyeButton} aria-label="Show password">
                    <Eye size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.row}>
                <label className={styles.remember}>
                  <input type="checkbox" className={styles.checkbox} />
                  Remember me
                </label>

                <button type="button" className={styles.textButton}>
                  Forgot Password?
                </button>
              </div>

              <button type="submit" className={styles.primaryButton}>
                <span>Sign In</span>
                <ArrowRight size={22} />
              </button>

              <div className={styles.divider}>
                <span />
                <small>OR</small>
                <span />
              </div>

              <button type="button" className={styles.secondaryButton}>
                Continue with Google
              </button>

              <p className={styles.footerText}>
                New to Stuffsy? <span className={styles.footerLink}>Create Account</span>
              </p>
            </form>
          </section>

          <aside className={styles.rightSection} aria-hidden="true">
            <div className={styles.glow} />

            <div className={styles.lamp}>
              <div className={styles.lampWire} />
              <div className={styles.lampShade} />
            </div>

            <div className={styles.illustration}>
              <div className={styles.illustrationCard}>
                <div className={styles.mockHeader}>
                  <span className={styles.mockDot} />
                  <span className={styles.mockDot} />
                  <span className={styles.mockDot} />
                </div>
                <div className={styles.mockProduct} />
                <div className={styles.mockLine} />
                <div className={styles.mockLineShort} />
              </div>
              <div className={styles.floatingBadge}>Shop Ready</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
