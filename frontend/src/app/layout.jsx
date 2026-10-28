import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { DESCRIPTION, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} – ${TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "focus tracker",
    "attention detection",
    "distraction detection",
    "drowsiness detection",
    "AI speech coach",
    "public speaking confidence",
    "pronunciation practice",
    "fatigue prediction",
    "study focus app",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    title: `${SITE_NAME} – ${TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${SITE_NAME} – ${TAGLINE}`, description: DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
  formatDetection: { telephone: false },
};

export const viewport = { themeColor: "#0b1120", colorScheme: "dark" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
