"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

const SERVICE_WORKER_URL = "/serwist/sw.js";

const isServiceWorkerDisabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ENABLE_SW_DEV !== "1";

interface PwaProviderProps {
  children: ReactNode;
}

export function PwaProvider({ children }: PwaProviderProps) {
  return (
    <SerwistProvider swUrl={SERVICE_WORKER_URL} disable={isServiceWorkerDisabled}>
      {children}
    </SerwistProvider>
  );
}
