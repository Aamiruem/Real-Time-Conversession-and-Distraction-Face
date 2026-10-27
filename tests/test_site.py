def test_landing_page_seo(client):
    html = client.get("/").text
    assert "<title>" in html and 'name="description"' in html and 'rel="canonical"' in html
    assert '"@type": "SoftwareApplication"' in html and 'property="og:image"' in html and "{{" not in html


def test_robots_and_sitemap(client):
    assert "Sitemap:" in client.get("/robots.txt").text
    r = client.get("/sitemap.xml")
    assert r.headers["content-type"].startswith("application/xml") and "<urlset" in r.text
    assert client.get("/static/og-image.png").status_code == 200
