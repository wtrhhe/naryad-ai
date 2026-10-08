import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
      <p className="text-accent font-mono text-6xl font-bold">{404}</p>
      <h1 className="text-2xl font-bold">{t("errors.notFound")}</h1>
      <Link href="/" className={buttonVariants({ block: true })}>
        {t("backHome")}
      </Link>
    </main>
  );
}
