"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";

async function clearOfflineCaches(): Promise<void> {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch (error) {
    console.error("failed to clear offline caches", error);
  }
}

export function SignOutButton({ label }: { label: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await clearOfflineCaches();
          await signOut();
        })
      }
      className="border-border text-muted hover:text-foreground flex min-h-11 min-w-11 items-center justify-center rounded-lg border-2 disabled:opacity-50"
    >
      <LogOut className="size-5" aria-hidden />
    </button>
  );
}
