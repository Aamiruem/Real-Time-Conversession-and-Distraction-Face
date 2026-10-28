import { FEATURES, SITE_URL } from "@/lib/site";

export default function sitemap() {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...FEATURES.map((f) => ({
      url: `${SITE_URL}/features/${f.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    })),
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
