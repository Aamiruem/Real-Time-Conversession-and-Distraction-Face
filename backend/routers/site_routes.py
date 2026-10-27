"""Public, search-engine-friendly pages: landing page, robots.txt, sitemap.xml and static assets.

Streamlit renders in JavaScript, which crawlers index poorly, so the marketing page is plain HTML.
SITE_URL is the public address (canonical / sitemap links), APP_URL is where the Streamlit app lives.
"""
from datetime import date
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from backend.config import settings

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
router = APIRouter(include_in_schema=False)


@lru_cache(maxsize=1)
def _landing() -> str:
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    for key, value in {"SITE_URL": settings.SITE_URL, "APP_URL": settings.APP_URL, "APP_NAME": settings.APP_NAME,
                       "YEAR": str(date.today().year)}.items():
        html = html.replace("{{" + key + "}}", value)
    return html


@router.get("/", response_class=HTMLResponse)
def landing():
    return HTMLResponse(_landing(), headers={"Cache-Control": "public, max-age=600"})


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots():
    return f"User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /ws/\nDisallow: /static/index.html\n\nSitemap: {settings.SITE_URL}/sitemap.xml\n"


@router.get("/sitemap.xml")
def sitemap():
    today = date.today().isoformat()
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{settings.SITE_URL}/</loc><lastmod>{today}</lastmod>"
        "<changefreq>weekly</changefreq><priority>1.0</priority></url>\n"
        "</urlset>\n"
    )
    return Response(xml, media_type="application/xml")
