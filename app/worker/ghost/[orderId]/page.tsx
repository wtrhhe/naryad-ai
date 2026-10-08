import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GHOST_MIN_ALIGNMENT_KEY, parseMinAlignment } from "@/lib/ghost/settings";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { AfterPhotoFlow, type ReferencePhoto } from "./after-photo-flow";

const PHOTO_STATUSES = new Set(["accepted", "in_progress", "paused", "done", "rework"]);
const SIGNED_URL_SECONDS = 15 * 60;
const MAX_REFERENCES = 6;

export async function generateMetadata() {
  const t = await getTranslations("ghost.camera");
  return { title: t("title") };
}

export default async function GhostAfterPhotoPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const employee = await requireRole("worker");
  if (!z.uuid().safeParse(orderId).success) notFound();
  const t = await getTranslations("ghost.after");
  const supabase = await createSupabaseServerClient();
  const [orderResult, photosResult, settingResult] = await Promise.all([
    supabase.from("work_orders").select("id, number, status").eq("id", orderId).maybeSingle(),
    supabase
      .from("photos")
      .select("id, storage_path")
      .eq("work_order_id", orderId)
      .eq("kind", "before")
      .order("taken_at", { ascending: true, nullsFirst: false })
      .limit(MAX_REFERENCES),
    supabase.from("settings").select("value").eq("key", GHOST_MIN_ALIGNMENT_KEY).maybeSingle(),
  ]);
  const order = orderResult.data;
  if (!order) notFound();
  const backHref = `/worker/orders/${order.id}`;
  const beforePhotos = photosResult.data ?? [];
  const signed =
    beforePhotos.length > 0
      ? await supabase.storage.from("photos").createSignedUrls(
          beforePhotos.map((photo) => photo.storage_path),
          SIGNED_URL_SECONDS,
        )
      : { data: [] };
  const urls = new Map(
    (signed.data ?? []).flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
  const references: ReferencePhoto[] = beforePhotos.flatMap((photo) => {
    const url = urls.get(photo.storage_path);
    return url ? [{ id: photo.id, url }] : [];
  });

  return (
    <>
      <PageHeader title={t("title", { number: order.number })} />
      {PHOTO_STATUSES.has(order.status) ? (
        <AfterPhotoFlow
          orderId={order.id}
          employeeId={employee.id}
          references={references}
          threshold={parseMinAlignment(settingResult.data?.value)}
          backHref={backHref}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="border-border rounded-lg border-2 p-4 text-lg">{t("notAllowed")}</p>
          <Link href={backHref} className={buttonVariants({ variant: "secondary", block: true })}>
            {t("back")}
          </Link>
        </div>
      )}
    </>
  );
}
