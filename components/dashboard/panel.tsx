import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-border bg-surface flex min-w-0 flex-col gap-3 rounded-xl border-2 p-4",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-wide uppercase">{title}</h2>
          {description ? <p className="text-muted mt-0.5 text-xs">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="border-border text-muted rounded-lg border-2 border-dashed px-3 py-6 text-center text-sm">
      {children}
    </p>
  );
}
