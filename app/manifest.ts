import type { MetadataRoute } from "next";

const APP_NAME = "НарядAI";
const APP_BACKGROUND_COLOR = "#0B0F14";
const SHORTCUT_ICONS = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description:
      "Электронные наряды для смен горно-обогатительного комбината: выдача, исполнение и контроль работ с телефона прямо в цеху.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: APP_BACKGROUND_COLOR,
    theme_color: APP_BACKGROUND_COLOR,
    lang: "ru",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Новый наряд",
        short_name: "Новый наряд",
        url: "/master/orders/new",
        icons: SHORTCUT_ICONS,
      },
      { name: "Мои наряды", short_name: "Мои наряды", url: "/worker", icons: SHORTCUT_ICONS },
    ],
  };
}
