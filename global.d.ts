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
import type board from "./messages/ru/board.json";
import type acoustic from "./messages/ru/acoustic.json";
import type ghost from "./messages/ru/ghost.json";
import type notifications from "./messages/ru/notifications.json";
import type reports from "./messages/ru/reports.json";
import type analytics from "./messages/ru/analytics.json";
import type offline from "./messages/ru/offline.json";
import type rating from "./messages/ru/rating.json";
import type review from "./messages/ru/review.json";
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
      board: typeof board;
      acoustic: typeof acoustic;
      ghost: typeof ghost;
      notifications: typeof notifications;
      reports: typeof reports;
      analytics: typeof analytics;
      offline: typeof offline;
      rating: typeof rating;
      review: typeof review;
    };
  }
}
