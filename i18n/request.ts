import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, TIME_ZONE, resolveLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return {
    locale,
    timeZone: TIME_ZONE,
    messages: await loadMessages(locale),
  };
});
