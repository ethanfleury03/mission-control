from __future__ import annotations

import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

import pandas as pd

from config import LOGS_DIR, OUTPUT_DIR


EMAIL_RE = re.compile(r"(?<![\w.+-])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?![\w.+-])", re.IGNORECASE)


def ensure_output_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def setup_logging(name: str = "lead_list_generator") -> logging.Logger:
    ensure_output_dirs()
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.propagate = False

    if logger.handlers:
        return logger

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s")
    file_handler = logging.FileHandler(LOGS_DIR / "pipeline.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
    stream_handler.setLevel(logging.INFO)

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    return logger


def normalize_phone(value: Any) -> str:
    if value is None:
        return ""
    digits = re.sub(r"\D+", "", str(value))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def normalize_url(value: Any) -> str:
    if value is None:
        return ""
    url = str(value).strip()
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = f"https://{url}"
    return url


def extract_domain(value: Any) -> str:
    url = normalize_url(value)
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = re.sub(r"\s+", " ", str(value).strip().lower())
    return re.sub(r"[^a-z0-9 ]+", "", text).strip()


def extract_emails(text: Any) -> list[str]:
    if text is None:
        return []
    candidates = {match.group(1).strip().lower() for match in EMAIL_RE.finditer(str(text))}
    blocked_suffixes = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")
    return sorted(email for email in candidates if not email.endswith(blocked_suffixes))


def safe_get(data: Any, path: str | Iterable[str], default: Any = "") -> Any:
    if isinstance(path, str):
        keys = path.split(".")
    else:
        keys = list(path)
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list) and str(key).isdigit():
            index = int(str(key))
            current = current[index] if 0 <= index < len(current) else default
        else:
            return default
        if current is None:
            return default
    return current


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_rows_csv(path: Path | str, rows: list[dict[str, Any]], columns: list[str]) -> None:
    ensure_output_dirs()
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame(rows)
    for column in columns:
        if column not in frame.columns:
            frame[column] = ""
    frame = frame[columns].fillna("")
    frame.to_csv(output_path, index=False)


def read_rows_csv(path: Path | str) -> list[dict[str, Any]]:
    input_path = Path(path)
    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV does not exist: {input_path}")
    frame = pd.read_csv(input_path, dtype=str).fillna("")
    return frame.to_dict(orient="records")


def coerce_int(value: Any, default: int = 0) -> int:
    if value is None or value == "":
        return default
    try:
        return int(float(str(value).replace(",", "")))
    except ValueError:
        return default
