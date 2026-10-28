import { DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: "FocusLink",
    description: DESCRIPTION,
    start_url: "/app",
    display: "standalone",
    background_color: "#0b1120",
    theme_color: "#0b1120",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
