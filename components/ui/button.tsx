import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-wide transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:brightness-110 active:brightness-95",
        secondary:
          "border-2 border-border-strong bg-surface-raised text-foreground hover:bg-surface",
        danger: "bg-danger text-danger-foreground hover:brightness-110",
        ghost: "text-muted hover:bg-surface-raised hover:text-foreground",
      },
      size: {
        touch: "min-h-touch px-6 text-lg",
        md: "min-h-12 px-4 text-base",
        sm: "min-h-10 px-3 text-sm",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "touch" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  block,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}
