import type common from "./messages/ru/common.json";
import type auth from "./messages/ru/auth.json";
import type nav from "./messages/ru/nav.json";
import type shell from "./messages/ru/shell.json";
import type { Locale } from "./i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      common: typeof common;
      auth: typeof auth;
      nav: typeof nav;
      shell: typeof shell;
    };
  }
}
