import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentEmployee } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/roles";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (employee) {
    redirect(homeForRole(employee.role));
  }
  const [{ next }, t, common] = await Promise.all([
    searchParams,
    getTranslations("auth"),
    getTranslations("common"),
  ]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <p className="text-accent font-mono text-sm tracking-[0.3em] uppercase">
          {common("appName")}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted mt-1">{t("subtitle")}</p>
      </div>
      <LoginForm next={next ?? ""} />
      <p className="text-muted mt-10 text-sm">{common("tagline")}</p>
    </main>
  );
}
