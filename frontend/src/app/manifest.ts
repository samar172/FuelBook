import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FuelBook",
    short_name: "FuelBook",
    description:
      "Daily shift report, cash book, stock and credit ledger for petrol pumps.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    orientation: "portrait-primary",
    lang: "en-IN",
    dir: "ltr",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "New shift", short_name: "New shift", url: "/shifts/new" },
      { name: "Cash & Bank", short_name: "Cash", url: "/cash" },
      { name: "Dashboard", short_name: "Dashboard", url: "/dashboard" },
    ],
  };
}
