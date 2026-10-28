import { Link as RouterLink } from "react-router";

/** App link with an `href` prop: client-side navigation for app routes, a plain <a> for #anchors and external URLs. */
export default function Link({ href, ...props }) {
  if (/^(https?:|mailto:)/.test(href) || href.includes("#")) return <a href={href} {...props} />;
  return <RouterLink to={href} {...props} />;
}
