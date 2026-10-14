import type { MetadataRoute } from "next";
import { getMessages } from "@/lib/messages";

export default function manifest(): MetadataRoute.Manifest {
  const { meta } = getMessages("en");
  return {
    name: meta.siteName,
    short_name: "Moonpatch",
    description: meta.description,
    start_url: "/",
    display: "standalone",
    background_color: "#3a2a1f",
    theme_color: "#3a2a1f",
    icons: [
      { src: "/img/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/img/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/mark.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
