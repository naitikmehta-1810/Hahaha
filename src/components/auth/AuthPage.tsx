import Link from "next/link";
import {
  ArrowRight,
  Eye,
  Headset,
  Lock,
  Mail,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Truck,
  User,
} from "lucide-react";
import styles from "./AuthPage.module.css";

type AuthMode = "signin" | "signup";

type AuthPageProps = {
  mode: AuthMode;
};

const features = [
  {
    icon: <Truck size={22} />,
    title: "Free Shipping",
    description: "On orders over ₹999",
  },
  {
    icon: <RefreshCcw size={22} />,
    title: "Easy Returns",
    description: "Within 7 days",
  },
  {
    icon: <ShieldCheck size={22} />,
    title: "Secure Payments",
    description: "100% protected",
  },
  {
    icon: <Headset size={22} />,
    title: "24/7 Support",
    description: "We're here to help",
  },
];

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignIn = mode === "signin";

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={`${styles.panel} ${styles.leftPanel} ${isSignIn ? styles.signInTone : styles.signUpTone}`}>
          <div className={styles.brandRow}>
            <span className={styles.brandMark}>sj</span>
            <span className={styles.brandName}>Stuffsy</span>
          </div>

          <div className={styles.leftCopy}>
            <h2 className={styles.leftTitle}>
              {isSignIn ? "Welcome Back! 👋" : "Create Account ✨"}
            </h2>
            <p className={styles.leftText}>
              {isSignIn
                ? "Sign in to continue shopping your favorite handmade products."
                : "Join Stuffsy and discover unique handmade treasures."}
            </p>
          </div>

          <div className={`${styles.illustration} ${isSignIn ? styles.signInIllustration : styles.signUpIllustration}`}>
            {isSignIn ? (
              <>
                <div className={styles.macrame} />
                <div className={styles.vase} />
                <div className={styles.candle} />
                <div className={styles.pot} />
              </>
            ) : (
              <>
                <div className={styles.vaseTall} />
                <div className={styles.lavender} />
                <div className={styles.bag} />
                <div className={styles.purpleCandle} />
              </>
            )}
            <span className={styles.dots} />
          </div>

          <ul className={styles.featureList}>
            {features.map((feature) => (
              <li key={feature.title} className={styles.featureItem}>
                <span className={styles.featureIcon}>{feature.icon}</span>
                <div>
                  <strong>{feature.title}</strong>
                  <p>{feature.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <div className={styles.formWrap}>
            <div className={styles.formHeader}>
              <h1>{isSignIn ? "Sign In" : "Sign Up"}</h1>
              <p>
                {isSignIn
                  ? "Welcome back! Please sign in to your account."
                  : "Create your account and start shopping."}
              </p>
            </div>

            <form className={styles.form}>
              {!isSignIn && (
                <label className={styles.field}>
                  <span>Full Name</span>
                  <div className={styles.inputWrap}>
                    <User className={styles.inputIcon} size={18} />
                    <input type="text" placeholder="Enter your full name" className={styles.input} />
                  </div>
                </label>
              )}

              <label className={styles.field}>
                <span>Email Address</span>
                <div className={styles.inputWrap}>
                  <Mail className={styles.inputIcon} size={18} />
                  <input type="email" placeholder="Enter your email address" className={styles.input} />
                </div>
              </label>

              {!isSignIn && (
                <label className={styles.field}>
                  <span>Phone Number (Optional)</span>
                  <div className={styles.inputWrap}>
                    <Phone className={styles.inputIcon} size={18} />
                    <input type="tel" placeholder="Enter your phone number" className={styles.input} />
                  </div>
                </label>
              )}

              <label className={styles.field}>
                <span>{isSignIn ? "Password" : "Password"}</span>
                <div className={styles.inputWrap}>
                  <Lock className={styles.inputIcon} size={18} />
                  <input
                    type="password"
                    placeholder={isSignIn ? "Enter your password" : "Create a password"}
                    className={styles.input}
                  />
                  <button type="button" className={styles.eyeButton} aria-label="Show password">
                    <Eye size={18} />
                  </button>
                </div>
              </label>

              {!isSignIn && (
                <label className={styles.field}>
                  <span>Confirm Password</span>
                  <div className={styles.inputWrap}>
                    <Lock className={styles.inputIcon} size={18} />
                    <input type="password" placeholder="Confirm your password" className={styles.input} />
                    <button type="button" className={styles.eyeButton} aria-label="Show confirm password">
                      <Eye size={18} />
                    </button>
                  </div>
                </label>
              )}

              {isSignIn ? (
                <div className={styles.inlineRow}>
                  <label className={styles.remember}>
                    <input type="checkbox" className={styles.checkbox} defaultChecked />
                    Remember me
                  </label>
                  <button type="button" className={styles.textLink}>
                    Forgot Password?
                  </button>
                </div>
              ) : (
                <label className={styles.terms}>
                  <input type="checkbox" className={styles.checkbox} defaultChecked />
                  <span>
                    I agree to the{" "}
                    <a href="#" className={styles.link}>
                      Terms &amp; Conditions
                    </a>{" "}
                    and{" "}
                    <a href="#" className={styles.link}>
                      Privacy Policy
                    </a>
                  </span>
                </label>
              )}

              <button type="submit" className={styles.primaryButton}>
                <span>{isSignIn ? "Sign In" : "Create Account"}</span>
                <ArrowRight size={20} />
              </button>

              <div className={styles.divider}>
                <span />
                <small>{isSignIn ? "or continue with" : "or sign up with"}</small>
                <span />
              </div>

              <div className={styles.socialRow}>
                <button type="button" className={styles.socialButton}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.6 20.4H42V20H24v8h11.3C34.9 31.9 30.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.2l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.6z" />
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 12 24 12c3.1 0 5.9 1.2 8.1 3.2l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.9 0-14.7 4.4-17.7 10.7z" />
                    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.2C29.3 35.1 26.8 36 24 36c-6.1 0-11.2-3.9-13.1-9.3l-6.5 5C7.3 38.4 15 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.4H42V20H24v8h11.3c-1.1 3.1-3.2 5.6-6 7.1l.1-.1 6.3 5.2C35.2 41.4 44 35 44 24c0-1.3-.1-2.4-.4-3.6z" />
                  </svg>
                  Google
                </button>
                <button type="button" className={styles.socialButton}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.facebookIcon}>
                      <path
                        fill="currentColor"
                        d="M13.5 22v-8.1h2.7l.4-3.1h-3.1V9c0-.9.2-1.5 1.5-1.5H17V4.8c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.6v1.6H7.1v3.1H10V22h3.5Z"
                      />
                    </svg>
                    Facebook
                  </button>
              </div>

              <p className={styles.switchText}>
                {isSignIn ? "Don't have an account?" : "Already have an account?"}{" "}
                <Link href={isSignIn ? "/signup" : "/login"} className={styles.link}>
                  {isSignIn ? "Sign up" : "Sign in"}
                </Link>
              </p>

              <p className={styles.legalText}>
                {isSignIn
                  ? "By signing in, you agree to our Terms & Conditions and Privacy Policy."
                  : "By creating an account, you agree to our Terms & Conditions and Privacy Policy."}
              </p>
            </form>
          </div>
        </section>
      </div>

      <div className={styles.featureBar}>
        {features.map((feature) => (
          <div key={feature.title} className={styles.featureBarItem}>
            <span className={styles.featureBarIcon}>{feature.icon}</span>
            <div>
              <strong>{feature.title}</strong>
              <p>{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
