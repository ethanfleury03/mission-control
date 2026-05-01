from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from tqdm import tqdm

from config import CONFIG, OUTPUT_DIR
from utils import coerce_int, current_timestamp, read_rows_csv, safe_get, setup_logging, write_rows_csv


RAW_COLUMNS = [
    "business_name",
    "category",
    "address",
    "city",
    "state",
    "postal_code",
    "country",
    "phone",
    "website",
    "rating",
    "review_count",
    "latitude",
    "longitude",
    "place_id",
    "maps_url",
    "source_query",
    "source_location",
    "source_provider",
    "fetched_at",
]


class ProviderRequestError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def blank_raw_row(query: str, location: str) -> dict[str, Any]:
    return {column: "" for column in RAW_COLUMNS} | {
        "source_query": query,
        "source_location": location,
        "source_provider": CONFIG.places_provider,
        "fetched_at": current_timestamp(),
    }


def generate_demo_leads() -> list[dict[str, Any]]:
    timestamp = current_timestamp()
    return [
        {
            "business_name": "Acme Dental Toronto",
            "category": "Dentist",
            "address": "100 Queen St W",
            "city": "Toronto",
            "state": "ON",
            "postal_code": "M5H 2N2",
            "country": "CA",
            "phone": "+1 416 555 0100",
            "website": "https://example.com",
            "rating": "4.7",
            "review_count": "132",
            "latitude": "43.6532",
            "longitude": "-79.3832",
            "place_id": "demo-acme-dental",
            "maps_url": "https://maps.example/demo-acme-dental",
            "source_query": "dentist",
            "source_location": "Toronto ON",
            "source_provider": "demo",
            "fetched_at": timestamp,
        },
        {
            "business_name": "Acme Dental Toronto",
            "category": "Dental Clinic",
            "address": "100 Queen Street West",
            "city": "Toronto",
            "state": "ON",
            "postal_code": "M5H 2N2",
            "country": "CA",
            "phone": "(416) 555-0100",
            "website": "https://www.example.com",
            "rating": "4.7",
            "review_count": "132",
            "latitude": "43.6532",
            "longitude": "-79.3832",
            "place_id": "demo-acme-dental",
            "maps_url": "https://maps.example/demo-acme-dental",
            "source_query": "dentist",
            "source_location": "Toronto ON",
            "source_provider": "demo",
            "fetched_at": timestamp,
        },
        {
            "business_name": "Dallas Roof Pros",
            "category": "Roofing Contractor",
            "address": "2500 Elm St",
            "city": "Dallas",
            "state": "TX",
            "postal_code": "75226",
            "country": "US",
            "phone": "+1 214 555 0188",
            "website": "https://www.iana.org",
            "rating": "4.4",
            "review_count": "89",
            "latitude": "32.7767",
            "longitude": "-96.7970",
            "place_id": "demo-dallas-roof-pros",
            "maps_url": "https://maps.example/demo-dallas-roof-pros",
            "source_query": "roofing contractor",
            "source_location": "Dallas TX",
            "source_provider": "demo",
            "fetched_at": timestamp,
        },
        {
            "business_name": "Windy City Commercial Print",
            "category": "Commercial Printer",
            "address": "200 W Madison St",
            "city": "Chicago",
            "state": "IL",
            "postal_code": "60606",
            "country": "US",
            "phone": "+1 312 555 0142",
            "website": "",
            "rating": "4.9",
            "review_count": "41",
            "latitude": "41.8781",
            "longitude": "-87.6298",
            "place_id": "demo-windy-city-print",
            "maps_url": "https://maps.example/demo-windy-city-print",
            "source_query": "commercial printer",
            "source_location": "Chicago IL",
            "source_provider": "demo",
            "fetched_at": timestamp,
        },
        {
            "business_name": "North Shore Print and Signs",
            "category": "Print Shop",
            "address": "88 Lakeshore Rd",
            "city": "Chicago",
            "state": "IL",
            "postal_code": "60601",
            "country": "US",
            "phone": "+1 773 555 0199",
            "website": "https://example.org",
            "rating": "4.2",
            "review_count": "22",
            "latitude": "41.8850",
            "longitude": "-87.6210",
            "place_id": "demo-north-shore-print",
            "maps_url": "https://maps.example/demo-north-shore-print",
            "source_query": "commercial printer",
            "source_location": "Chicago IL",
            "source_provider": "demo",
            "fetched_at": timestamp,
        },
    ]


def build_rapidapi_request(query: str, location: str, max_results: int) -> tuple[str, dict[str, str], dict[str, Any]]:
    if not CONFIG.has_rapidapi_credentials:
        raise RuntimeError("RapidAPI is not configured. Set RAPIDAPI_KEY and RAPIDAPI_HOST in .env, or run with --demo.")
    if not CONFIG.has_rapidapi_endpoint:
        raise RuntimeError(
            "RAPIDAPI_ENDPOINT is not configured. Paste the provider endpoint into .env, then adjust "
            "build_rapidapi_request()/parse_place() in scripts/fetch_places.py if needed."
        )

    endpoint = CONFIG.rapidapi_endpoint
    if endpoint.startswith("http"):
        url = endpoint
    else:
        url = f"https://{CONFIG.rapidapi_host}{endpoint if endpoint.startswith('/') else '/' + endpoint}"

    headers = {
        "X-RapidAPI-Key": CONFIG.rapidapi_key,
        "X-RapidAPI-Host": CONFIG.rapidapi_host,
        "User-Agent": CONFIG.user_agent,
        "Content-Type": "application/json",
    }
    params = {
        "query": f"{query} in {location}",
        "limit": max_results,
        "language": CONFIG.rapidapi_language,
        "region": CONFIG.rapidapi_region,
        "extract_emails_and_contacts": CONFIG.rapidapi_extract_emails_and_contacts,
    }
    return url, headers, params


@retry(
    retry=retry_if_exception_type((requests.Timeout, requests.ConnectionError)),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    stop=stop_after_attempt(CONFIG.max_retries),
    reraise=True,
)
def request_rapidapi(query: str, location: str, max_results: int) -> dict[str, Any]:
    url, headers, params = build_rapidapi_request(query, location, max_results)
    response = requests.get(url, headers=headers, params=params, timeout=CONFIG.request_timeout_seconds)
    if response.status_code == 401:
        raise ProviderRequestError("RapidAPI rejected the key. Check RAPIDAPI_KEY in .env.", status_code=401)
    if response.status_code == 403:
        raise ProviderRequestError(
            "RapidAPI returned 403 Forbidden. Subscribe this RapidAPI app to Local Business Data, then retry.",
            status_code=403,
        )
    if response.status_code == 429:
        raise ProviderRequestError(
            "RapidAPI returned 429 Too Many Requests. Wait for the rate limit to reset or reduce max_results.",
            status_code=429,
        )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        raise ProviderRequestError(f"RapidAPI request failed with HTTP {response.status_code}.", status_code=response.status_code) from exc
    payload = response.json()
    if not isinstance(payload, dict):
        raise ProviderRequestError("RapidAPI response was not a JSON object.")
    return payload


def extract_items_from_response(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("data", "results", "businesses", "places", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = extract_items_from_response(value)
            if nested:
                return nested

    if any(key in payload for key in ("business_id", "google_id", "place_id", "name", "phone_number", "full_address")):
        return [payload]

    stack: list[Any] = list(payload.values())
    while stack:
        value = stack.pop(0)
        if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            return value
        if isinstance(value, dict):
            stack.extend(value.values())
    return []


def parse_place(item: dict[str, Any], query: str, location: str) -> dict[str, Any]:
    row = blank_raw_row(query, location)
    coordinates = item.get("coordinates") if isinstance(item.get("coordinates"), dict) else {}
    gps = item.get("gps_coordinates") if isinstance(item.get("gps_coordinates"), dict) else {}
    address_obj = item.get("address") if isinstance(item.get("address"), dict) else {}

    row.update(
        {
            "business_name": item.get("business_name")
            or item.get("name")
            or item.get("title")
            or item.get("display_name")
            or "",
            "category": item.get("category")
            or item.get("type")
            or item.get("primary_category")
            or safe_get(item, "categories.0")
            or "",
            "address": item.get("address")
            if isinstance(item.get("address"), str)
            else item.get("full_address")
            or item.get("formatted_address")
            or safe_get(item, "location.address")
            or "",
            "city": item.get("city") or address_obj.get("city") or safe_get(item, "location.city") or "",
            "state": item.get("state") or address_obj.get("state") or safe_get(item, "location.state") or "",
            "postal_code": item.get("postal_code")
            or item.get("zip")
            or item.get("zipcode")
            or address_obj.get("postal_code")
            or address_obj.get("zipcode")
            or safe_get(item, "location.postal_code")
            or safe_get(item, "location.zipcode")
            or "",
            "country": item.get("country") or address_obj.get("country") or safe_get(item, "location.country") or "",
            "phone": item.get("phone")
            or item.get("phone_number")
            or item.get("telephone")
            or item.get("formatted_phone_number")
            or "",
            "website": item.get("website") or item.get("site") or item.get("url") or item.get("domain") or "",
            "rating": item.get("rating") or item.get("stars") or "",
            "review_count": item.get("review_count") or item.get("reviews") or item.get("user_ratings_total") or "",
            "latitude": item.get("latitude") or coordinates.get("latitude") or gps.get("latitude") or "",
            "longitude": item.get("longitude") or coordinates.get("longitude") or gps.get("longitude") or "",
            "place_id": item.get("place_id") or item.get("business_id") or item.get("google_id") or item.get("id") or "",
            "maps_url": item.get("maps_url") or item.get("google_maps_url") or item.get("place_link") or "",
        }
    )
    return row


def fetch_places_for_search(query: str, location: str, max_results: int, logger: logging.Logger) -> list[dict[str, Any]]:
    if CONFIG.places_provider != "rapidapi":
        raise RuntimeError(f"Unsupported PLACES_PROVIDER={CONFIG.places_provider!r}. Only rapidapi is implemented.")

    payload = request_rapidapi(query, location, max_results)
    items = extract_items_from_response(payload)
    rows = [parse_place(item, query, location) for item in items[:max_results]]
    logger.info("Fetched %s raw leads for %s in %s", len(rows), query, location)
    return rows


def fetch_from_search_file(input_path: Path | str, output_path: Path | str, demo: bool = False) -> list[dict[str, Any]]:
    logger = setup_logging()
    if demo:
        rows = generate_demo_leads()
        write_rows_csv(output_path, rows, RAW_COLUMNS)
        logger.info("Demo mode wrote %s raw leads to %s", len(rows), output_path)
        return rows

    searches = read_rows_csv(input_path)
    all_rows: list[dict[str, Any]] = []
    for search in tqdm(searches, desc="Fetching places"):
        query = (search.get("query") or "").strip()
        location = (search.get("location") or "").strip()
        max_results = coerce_int(search.get("max_results"), 100)
        if not query or not location:
            logger.warning("Skipping search row missing query/location: %s", search)
            continue
        try:
            all_rows.extend(fetch_places_for_search(query, location, max_results, logger))
        except ProviderRequestError as exc:
            logger.error("Skipped %s in %s: %s", query, location, exc)
            if exc.status_code in (401, 403, 429):
                logger.error("Stopping batch early because provider access/rate-limit must be fixed before more searches.")
                break
        except Exception as exc:
            logger.exception("Failed to fetch %s in %s: %s", query, location, exc)
        time.sleep(CONFIG.api_sleep_seconds)

    write_rows_csv(output_path, all_rows, RAW_COLUMNS)
    logger.info("Wrote %s raw leads to %s", len(all_rows), output_path)
    return all_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch raw business leads from a Places-style API provider.")
    parser.add_argument("--input", default="input/searches.csv", help="Input searches CSV.")
    parser.add_argument("--output", default=str(OUTPUT_DIR / "raw_leads.csv"), help="Output raw leads CSV.")
    parser.add_argument("--demo", action="store_true", help="Generate fake sample leads instead of calling an API.")
    args = parser.parse_args()
    fetch_from_search_file(args.input, args.output, demo=args.demo)


if __name__ == "__main__":
    main()
