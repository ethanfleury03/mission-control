from __future__ import annotations

import argparse
import logging
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests import Response
from requests.exceptions import ConnectionError, HTTPError, SSLError, Timeout
from tqdm import tqdm

from config import CONFIG, OUTPUT_DIR
from fetch_places import RAW_COLUMNS
from utils import extract_emails, normalize_url, read_rows_csv, setup_logging, write_rows_csv


ENRICHMENT_COLUMNS = [
    "email",
    "all_emails",
    "contact_page",
    "website_status",
    "website_status_code",
    "website_final_url",
    "has_https",
    "page_title",
    "meta_description",
]

ENRICHED_COLUMNS = RAW_COLUMNS + ENRICHMENT_COLUMNS
CONTACT_KEYWORDS = ("contact", "about", "team", "staff", "service", "services", "appointment", "quote")
CONTACT_PATHS = ("/contact", "/contact-us", "/about", "/about-us", "/team", "/services")


def fetch_page(session: requests.Session, url: str) -> Response:
    headers = {"User-Agent": CONFIG.user_agent}
    response = session.get(url, headers=headers, timeout=CONFIG.website_timeout_seconds, allow_redirects=True)
    response.raise_for_status()
    return response


def parse_page(response: Response) -> tuple[BeautifulSoup, list[str], str, str]:
    soup = BeautifulSoup(response.text or "", "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    description = ""
    meta = soup.find("meta", attrs={"name": re.compile("^description$", re.IGNORECASE)})
    if meta and meta.get("content"):
        description = str(meta.get("content")).strip()
    emails = extract_emails(response.text)
    return soup, emails, title, description


def same_domain(base_url: str, candidate_url: str) -> bool:
    base_host = urlparse(base_url).netloc.lower().removeprefix("www.")
    candidate_host = urlparse(candidate_url).netloc.lower().removeprefix("www.")
    return bool(base_host and candidate_host and base_host == candidate_host)


def discover_contact_urls(base_url: str, soup: BeautifulSoup) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    def add_url(url: str) -> None:
        absolute = urljoin(base_url, url)
        parsed = urlparse(absolute)
        clean = parsed._replace(fragment="").geturl()
        if clean not in seen and same_domain(base_url, clean):
            seen.add(clean)
            urls.append(clean)

    for path in CONTACT_PATHS:
        add_url(path)

    for link in soup.find_all("a", href=True):
        text = link.get_text(" ", strip=True).lower()
        href = str(link.get("href") or "")
        haystack = f"{text} {href}".lower()
        if any(keyword in haystack for keyword in CONTACT_KEYWORDS):
            add_url(href)

    return urls


def blank_enrichment(status: str = "") -> dict[str, Any]:
    return {
        "email": "",
        "all_emails": "",
        "contact_page": "",
        "website_status": status,
        "website_status_code": "",
        "website_final_url": "",
        "has_https": "",
        "page_title": "",
        "meta_description": "",
    }


def status_from_exception(exc: Exception) -> str:
    if isinstance(exc, Timeout):
        return "timeout"
    if isinstance(exc, SSLError):
        return "ssl_error"
    if isinstance(exc, ConnectionError):
        return "connection_error"
    if isinstance(exc, HTTPError):
        return "http_error"
    return "unknown_error"


def enrich_row(row: dict[str, Any], session: requests.Session, logger: logging.Logger) -> dict[str, Any]:
    enriched = dict(row)
    website = normalize_url(row.get("website"))
    if not website:
        enriched.update(blank_enrichment("no_website"))
        return enriched

    emails: set[str] = set()
    contact_page = ""
    title = ""
    description = ""
    status = "ok"
    status_code = ""
    final_url = ""

    try:
        homepage_response = fetch_page(session, website)
        status_code = str(homepage_response.status_code)
        final_url = homepage_response.url
        soup, homepage_emails, title, description = parse_page(homepage_response)
        emails.update(homepage_emails)

        pages_to_visit = discover_contact_urls(final_url, soup)[: max(0, CONFIG.max_website_pages - 1)]
        for candidate_url in pages_to_visit:
            if len(emails) > 0 and contact_page:
                break
            try:
                response = fetch_page(session, candidate_url)
                contact_soup, page_emails, page_title, page_description = parse_page(response)
                emails.update(page_emails)
                if not title:
                    title = page_title
                if not description:
                    description = page_description
                if page_emails or any(keyword in candidate_url.lower() for keyword in ("contact", "about", "team")):
                    contact_page = response.url
                _ = contact_soup
            except Exception as exc:
                logger.info("Contact-page fetch failed for %s: %s", candidate_url, exc)

        if not contact_page and pages_to_visit:
            contact_page = pages_to_visit[0]
    except Exception as exc:
        status = status_from_exception(exc)
        logger.info("Website enrichment failed for %s: %s", website, exc)

    sorted_emails = sorted(emails)
    enriched.update(
        {
            "email": sorted_emails[0] if sorted_emails else "",
            "all_emails": ";".join(sorted_emails),
            "contact_page": contact_page,
            "website_status": status,
            "website_status_code": status_code,
            "website_final_url": final_url,
            "has_https": "true" if final_url.startswith("https://") else ("false" if final_url else ""),
            "page_title": title,
            "meta_description": description,
        }
    )
    return enriched


def enrich_file(input_path: Path | str, output_path: Path | str) -> list[dict[str, Any]]:
    logger = setup_logging()
    rows = read_rows_csv(input_path)
    enriched_rows: list[dict[str, Any]] = []
    session = requests.Session()

    for row in tqdm(rows, desc="Enriching websites"):
        try:
            enriched_rows.append(enrich_row(row, session, logger))
        except Exception as exc:
            logger.exception("Unexpected enrichment failure for row %s: %s", row, exc)
            fallback = dict(row)
            fallback.update(blank_enrichment("unknown_error"))
            enriched_rows.append(fallback)
        time.sleep(CONFIG.website_sleep_seconds)

    write_rows_csv(output_path, enriched_rows, ENRICHED_COLUMNS)
    logger.info("Wrote %s enriched leads to %s", len(enriched_rows), output_path)
    return enriched_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich raw business leads by visiting each website.")
    parser.add_argument("--input", default=str(OUTPUT_DIR / "raw_leads.csv"), help="Input raw leads CSV.")
    parser.add_argument("--output", default=str(OUTPUT_DIR / "enriched_leads.csv"), help="Output enriched leads CSV.")
    args = parser.parse_args()
    enrich_file(args.input, args.output)


if __name__ == "__main__":
    main()
