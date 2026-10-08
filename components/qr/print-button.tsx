"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Printer className="size-6" aria-hidden />
      {label}
    </Button>
  );
}
