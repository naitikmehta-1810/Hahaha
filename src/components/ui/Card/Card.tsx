import React from "react";
import styles from "./Card.module.css";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
  className?: string;
}

const CardRoot = ({ children, hoverable = false, className = "", ...props }: CardProps) => {
  const cardClass = `${styles.card} ${hoverable ? styles.hoverable : ""} ${className}`;
  return (
    <div className={cardClass} {...props}>
      {children}
    </div>
  );
};

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

const CardHeader = ({ children, className = "", ...props }: CardSectionProps) => {
  return (
    <div className={`${styles.header} ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardBody = ({ children, className = "", ...props }: CardSectionProps) => {
  return (
    <div className={`${styles.body} ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardFooter = ({ children, className = "", ...props }: CardSectionProps) => {
  return (
    <div className={`${styles.footer} ${className}`} {...props}>
      {children}
    </div>
  );
};

interface CardTextProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
  className?: string;
}

const CardTitle = ({ children, className = "", ...props }: CardTextProps) => {
  return (
    <h3 className={`${styles.title} ${className}`} {...props}>
      {children}
    </h3>
  );
};

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
  className?: string;
}

const CardDescription = ({ children, className = "", ...props }: CardDescriptionProps) => {
  return (
    <p className={`${styles.description} ${className}`} {...props}>
      {children}
    </p>
  );
};

// Compound mapping
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
  Title: CardTitle,
  Description: CardDescription,
});

export default Card;
