import React from "react";
import styles from "./Button.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "secondary" | "text";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
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
  ...props
}: ButtonProps) => {
  const btnClass = `${styles.btn} ${styles[variant]} ${styles[size]} ${
    fullWidth ? styles.full : ""
  } ${className}`;

  return (
    <button className={btnClass} {...props}>
      {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
    </button>
  );
};
export default Button;
