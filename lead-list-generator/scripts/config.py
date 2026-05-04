from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = PROJECT_ROOT / "input"
OUTPUT_DIR = PROJECT_ROOT / "output"
LOGS_DIR = PROJECT_ROOT / "logs"

load_dotenv(PROJECT_ROOT / ".env")


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class LeadListConfig:
    places_provider: str
    rapidapi_key: str
    rapidapi_host: str
    rapidapi_endpoint: str
    rapidapi_language: str
    rapidapi_region: str
    rapidapi_extract_emails_and_contacts: str
    request_timeout_seconds: int
    website_timeout_seconds: int
    api_sleep_seconds: float
    website_sleep_seconds: float
    max_website_pages: int
    max_retries: int
    user_agent: str

    @property
    def has_rapidapi_credentials(self) -> bool:
        return bool(
            self.rapidapi_key
            and self.rapidapi_key != "replace_me"
            and self.rapidapi_host
            and self.rapidapi_host != "replace_me"
        )

    @property
    def has_rapidapi_endpoint(self) -> bool:
        return bool(self.rapidapi_endpoint)


CONFIG = LeadListConfig(
    places_provider=os.getenv("PLACES_PROVIDER", "rapidapi").strip().lower(),
    rapidapi_key=os.getenv("RAPIDAPI_KEY", "").strip(),
    rapidapi_host=os.getenv("RAPIDAPI_HOST", "").strip(),
    rapidapi_endpoint=os.getenv("RAPIDAPI_ENDPOINT", "").strip(),
    rapidapi_language=os.getenv("RAPIDAPI_LANGUAGE", "en").strip(),
    rapidapi_region=os.getenv("RAPIDAPI_REGION", "us").strip(),
    rapidapi_extract_emails_and_contacts=os.getenv("RAPIDAPI_EXTRACT_EMAILS_AND_CONTACTS", "false").strip().lower(),
    request_timeout_seconds=_get_int("REQUEST_TIMEOUT_SECONDS", 15),
    website_timeout_seconds=_get_int("WEBSITE_TIMEOUT_SECONDS", 10),
    api_sleep_seconds=_get_float("API_SLEEP_SECONDS", 1.0),
    website_sleep_seconds=_get_float("WEBSITE_SLEEP_SECONDS", 0.5),
    max_website_pages=max(1, _get_int("MAX_WEBSITE_PAGES", 3)),
    max_retries=max(1, _get_int("MAX_RETRIES", 3)),
    user_agent=os.getenv("USER_AGENT", "Mozilla/5.0 LeadListGenerator/1.0").strip(),
)
