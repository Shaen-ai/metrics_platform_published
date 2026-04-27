"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, asChild, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

    const variants = {
      primary: "bg-[var(--primary)] text-white hover:brightness-110 focus:ring-[var(--primary)] rounded-full shadow-sm hover:shadow-md",
      secondary: "bg-white text-[var(--primary)] border-2 border-[var(--primary)] hover:bg-[var(--secondary)] focus:ring-[var(--primary)] rounded-full",
      outline: "border border-[var(--border)] bg-transparent hover:bg-[var(--muted)] rounded-full text-[var(--foreground)]",
      ghost: "hover:bg-[var(--muted)] rounded-lg text-[var(--foreground)]",
      danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 rounded-full",
    };

    const sizes = {
      sm: "h-8 px-4 text-sm",
      md: "h-10 px-5 text-sm",
      lg: "h-12 px-8 text-base font-semibold",
      icon: "h-10 w-10 p-0",
    };

    if (asChild) {
      return (
        <span className={cn(baseStyles, variants[variant], sizes[size], className)}>
          {children}
        </span>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
