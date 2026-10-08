"use client";

import { RotateCw } from "lucide-react";

interface RetryButtonProps {
  label: string;
}

function reloadPage() {
  window.location.reload();
}

export function RetryButton({ label }: RetryButtonProps) {
  return (
    <button
      type="button"
      onClick={reloadPage}
      className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#F5A524] px-6 text-xl font-bold text-[#0B0F14] transition-colors hover:bg-[#FFB840] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#F5A524] active:bg-[#D98F12]"
    >
      <RotateCw aria-hidden="true" className="size-7" strokeWidth={2.75} />
      {label}
    </button>
  );
}
