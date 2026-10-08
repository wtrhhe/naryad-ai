import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-touch border-border-strong bg-surface text-foreground placeholder:text-muted focus:border-accent aria-invalid:border-danger w-full rounded-lg border-2 px-4 font-mono text-2xl tracking-widest focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
