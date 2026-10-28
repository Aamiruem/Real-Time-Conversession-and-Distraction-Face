import { ImageResponse } from "next/og";
import { FEATURES, SITE_NAME } from "@/lib/site";

// A unique 1200×630 social preview per feature page, generated at build time.
export const alt = `${SITE_NAME} feature`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export default async function Image({ params }) {
  const { slug } = await params;
  const f = FEATURES.find((x) => x.slug === slug) ?? FEATURES[0];
  const [headline, sub] = f.metaTitle.split(" – ");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: 72, color: "#e2e8f0",
          background: "linear-gradient(135deg, #0c4a6e 0%, #0b1120 45%, #2e1065 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 800 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, border: "8px solid #38bdf8", display: "flex",
                        alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#a78bfa" }} />
          </div>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 96 }}>{f.icon}</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>{headline}</div>
          {sub && <div style={{ fontSize: 44, color: "#38bdf8", fontWeight: 700 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, color: "#94a3b8" }}>
          {f.metaDescription.length > 110 ? `${f.metaDescription.slice(0, 110).replace(/\s+\S*$/, "")}…` : f.metaDescription}
        </div>
      </div>
    ),
    size,
  );
}
