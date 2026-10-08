import type { Locale } from "@/i18n/config";

export const NAMESPACES = ["common", "auth", "nav", "shell"] as const;

export type Namespace = (typeof NAMESPACES)[number];

export async function loadMessages(locale: Locale) {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const namespaceModule: { default: Record<string, unknown> } = await import(
        `../messages/${locale}/${namespace}.json`
      );
      return [namespace, namespaceModule.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}
