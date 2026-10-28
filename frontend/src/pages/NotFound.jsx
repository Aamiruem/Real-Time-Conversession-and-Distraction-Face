import Link from "@/components/Link";
import { SiteHeader } from "@/components/SiteChrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="container hero">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="lead">The page you are looking for doesn&apos;t exist or has moved.</p>
        <Link className="btn" href="/">
          Back to home
        </Link>
      </main>
    </>
  );
}
