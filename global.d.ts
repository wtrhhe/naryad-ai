import type common from "./messages/ru/common.json";
import type auth from "./messages/ru/auth.json";
import type nav from "./messages/ru/nav.json";
import type shell from "./messages/ru/shell.json";
import type pwa from "./messages/ru/pwa.json";
import type workOrder from "./messages/ru/workOrder.json";
import type orderCreate from "./messages/ru/orderCreate.json";
import type workerApp from "./messages/ru/workerApp.json";
import type photos from "./messages/ru/photos.json";
import type admin from "./messages/ru/admin.json";
import type { Locale } from "./i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      common: typeof common;
      auth: typeof auth;
      nav: typeof nav;
      shell: typeof shell;
      pwa: typeof pwa;
      workOrder: typeof workOrder;
      orderCreate: typeof orderCreate;
      workerApp: typeof workerApp;
      photos: typeof photos;
      admin: typeof admin;
    };
  }
}
