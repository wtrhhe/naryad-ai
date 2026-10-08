import type { ReportFormat } from "@/lib/reports/document";

export const REPORT_MIME_TYPES: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function asciiFileName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\/;:*?<>|]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "report"
  );
}

export function safeFileName(value: string): string {
  return [...value]
    .map((char) => (char.charCodeAt(0) < 32 ? " " : char))
    .join("")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

export function contentDisposition(fileName: string, fallback: string): string {
  const safe = safeFileName(fileName) || fallback;
  return `attachment; filename="${asciiFileName(fallback)}"; filename*=UTF-8''${encodeRfc5987(safe)}`;
}
