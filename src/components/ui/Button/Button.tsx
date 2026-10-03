import React from "react";
import Link from "next/link";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "outline" | "secondary" | "ghost" | "danger" | "text";
type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: ButtonStyleOptions = {}) {
  return [styles.btn, styles[variant], styles[size], fullWidth ? styles.full : "", className]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<ButtonStyleOptions, "className"> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Button = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
    </button>
  );
};

interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, "className">,
    Omit<ButtonStyleOptions, "className"> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
}

/** A link that looks like a button. Use instead of wrapping <Button> in <Link>. */
export const ButtonLink = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = "",
  ...props
}: ButtonLinkProps) => (
  <Link className={buttonClassName({ variant, size, fullWidth, className })} {...props}>
    {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
    {children}
    {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
  </Link>
);

export default Button;
