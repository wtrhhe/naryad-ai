import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { PrintButton } from "@/components/qr/print-button";
import { QrSticker } from "@/components/qr/qr-sticker";
import { qrTokenUrl } from "@/components/qr/qr-token";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/session";
import { publicEnv } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  html, body { background: #ffffff !important; color: #000000 !important; }
  body *:not(:has(.qr-sheet)):not(.qr-sheet):not(.qr-sheet *) { display: none !important; }
  body *:has(.qr-sheet) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; min-height: 0 !important; width: auto !important; overflow: visible !important;
    background: #ffffff !important; backdrop-filter: none !important;
  }
  .qr-sheet { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 4mm !important; }
  .qr-sticker { height: 66mm; break-inside: avoid; page-break-inside: avoid; justify-content: center; }
}
`;

const siteFilterSchema = z.uuid().optional().catch(undefined);

interface QrSheetPageProps {
  searchParams: Promise<{ site?: string | string[] }>;
}

export async function generateMetadata() {
  const t = await getTranslations("qr.sheet");
  return { title: t("title") };
}

export default async function QrSheetPage({ searchParams }: QrSheetPageProps) {
  await requireRole("admin");
  const [{ site }, t, common, supabase] = await Promise.all([
    searchParams,
    getTranslations("qr.sheet"),
    getTranslations("common"),
    createSupabaseServerClient(),
  ]);
  const siteId = siteFilterSchema.parse(typeof site === "string" ? site : undefined);
  const equipmentQuery = supabase
    .from("equipment")
    .select("id, name, inventory_number, qr_token, site_id")
    .eq("is_active", true)
    .order("name");
  const [sitesResult, equipmentResult] = await Promise.all([
    supabase.from("sites").select("id, name").eq("is_active", true).order("name"),
    siteId ? equipmentQuery.eq("site_id", siteId) : equipmentQuery,
  ]);
  if (sitesResult.error || equipmentResult.error) {
    throw new Error(
      `Failed to load equipment for QR stickers: ${sitesResult.error?.message ?? equipmentResult.error?.message}`,
    );
  }
  const sites = sitesResult.data;
  const siteNames = new Map(sites.map((entry) => [entry.id, entry.name]));
  const equipment = [...equipmentResult.data].sort(
    (left, right) =>
      (siteNames.get(left.site_id) ?? "").localeCompare(siteNames.get(right.site_id) ?? "") ||
      left.name.localeCompare(right.name),
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PageHeader title={t("title")} actions={<PrintButton label={t("print")} />} />
      <p className="text-muted mb-4 max-w-3xl">{t("description")}</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex min-w-60 flex-col gap-1">
          <span className="text-sm font-semibold">{t("site")}</span>
          <select
            name="site"
            defaultValue={siteId ?? ""}
            className="min-h-touch border-border-strong bg-surface text-foreground focus:border-accent rounded-lg border-2 px-3 text-lg"
          >
            <option value="">{t("allSites")}</option>
            {sites.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
        <span className="text-muted min-h-touch content-center font-semibold">
          {t("count", { count: equipment.length })}
        </span>
      </form>
      {equipment.length === 0 ? (
        <p className="text-muted py-10 text-center">{t("empty")}</p>
      ) : (
        <section className="qr-sheet grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {equipment.map((entry) => (
            <QrSticker
              key={entry.id}
              url={qrTokenUrl(publicEnv.NEXT_PUBLIC_APP_URL, entry.qr_token)}
              name={entry.name}
              inventoryLabel={t("inventory", { number: entry.inventory_number })}
              siteName={siteNames.get(entry.site_id) ?? null}
              footer={`${common("appName")} · ${t("scanHint")}`}
            />
          ))}
        </section>
      )}
    </>
  );
}
