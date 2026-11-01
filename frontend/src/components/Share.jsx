import { useEffect, useRef, useState } from "react";
import { BrandIcon } from "./BrandIcons";
import { Icon } from "./Icons";
import { SITE_NAME, TAGLINE } from "@/lib/site";

const MESSAGE = `${SITE_NAME} — ${TAGLINE}. Free, works on any device, no sign-up:`;

/**
 * "Share" button: copy the link or send it on WhatsApp, LinkedIn, X or email; "More apps…" opens the device's own
 * share sheet where the browser has one (phones). Shares the site's home page unless `path` is given.
 */
export function ShareButton({ path = "/", label = "Share", className = "btn ghost sm", align = "right" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  // read at click time: the page is pre-rendered without a window
  const url = () => new URL(path, window.location.origin).href;
  const text = encodeURIComponent(MESSAGE);
  const go = (href) => {
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
    } catch {
      window.prompt("Copy this link:", url()); // clipboard blocked (http, old browsers)
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="share" ref={box}>
      <button className={className} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <Icon name="share" size={16} /> <span className="btn-label">{label}</span>
      </button>
      {open && (
        <div className={`share-menu ${align}`} role="menu">
          <button role="menuitem" onClick={copy}>
            <Icon name={copied ? "copy" : "link"} size={17} /> {copied ? "Link copied" : "Copy link"}
          </button>
          <button role="menuitem" onClick={() => go(`https://wa.me/?text=${text}%20${encodeURIComponent(url())}`)}>
            <BrandIcon name="whatsapp" size={17} /> WhatsApp
          </button>
          <button
            role="menuitem"
            onClick={() => go(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url())}`)}
          >
            <BrandIcon name="linkedin" size={17} /> LinkedIn
          </button>
          <button
            role="menuitem"
            onClick={() => go(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url())}`)}
          >
            <span className="share-x" aria-hidden="true">
              𝕏
            </span>{" "}
            X / Twitter
          </button>
          <button
            role="menuitem"
            onClick={() => go(`mailto:?subject=${encodeURIComponent(SITE_NAME)}&body=${text}%20${encodeURIComponent(url())}`)}
          >
            <Icon name="mail" size={17} /> Email
          </button>
          {native && (
            <button
              role="menuitem"
              onClick={() => {
                navigator.share({ title: SITE_NAME, text: MESSAGE, url: url() }).catch(() => {});
                setOpen(false);
              }}
            >
              <Icon name="share" size={17} /> More apps…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
