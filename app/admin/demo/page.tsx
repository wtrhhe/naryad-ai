import { getFormatter, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoControls } from "@/components/demo/demo-controls";
import {
  DEMO_BASELINE_KEY,
  DEMO_TEAM,
  DEMO_TIME_SCALE_KEY,
  parseTimeScale,
} from "@/lib/demo/scenario";

export async function generateMetadata() {
  const t = await getTranslations("demo");
  return { title: t("title") };
}

export default async function DemoPage() {
  await requireRole("admin");
  const [t, format, supabase] = await Promise.all([
    getTranslations("demo"),
    getFormatter(),
    createSupabaseServerClient(),
  ]);
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [DEMO_TIME_SCALE_KEY, DEMO_BASELINE_KEY]);
  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  const baseline = values.get(DEMO_BASELINE_KEY);
  const baselineLabel =
    typeof baseline === "string"
      ? format.dateTime(new Date(baseline), { dateStyle: "medium", timeStyle: "short" })
      : null;
  return (
    <>
      <PageHeader title={t("title")} />
      <p className="text-muted mb-6 max-w-2xl">
        {t("intro", { master: DEMO_TEAM.master, workers: DEMO_TEAM.workers.join(", ") })}
      </p>
      <div className="max-w-2xl">
        <DemoControls
          timeScale={parseTimeScale(values.get(DEMO_TIME_SCALE_KEY))}
          baselineLabel={baselineLabel}
        />
      </div>
    </>
  );
}
