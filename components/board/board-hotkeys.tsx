"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function BoardHotkeys({
  newOrderHref,
  filterId,
}: {
  newOrderHref: string;
  filterId: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "n" || key === "т") {
        event.preventDefault();
        router.push(newOrderHref);
      } else if (key === "/") {
        event.preventDefault();
        document.getElementById(filterId)?.focus();
      } else if (key === "r" || key === "к") {
        event.preventDefault();
        router.refresh();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filterId, newOrderHref, router]);
  return null;
}
