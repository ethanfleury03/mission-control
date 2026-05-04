from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from config import OUTPUT_DIR
from enrich_websites import ENRICHED_COLUMNS
from utils import extract_domain, normalize_phone, normalize_text, read_rows_csv, setup_logging, write_rows_csv


FINAL_COLUMNS = ENRICHED_COLUMNS


def completeness_score(row: dict[str, Any]) -> int:
    score = 0
    if row.get("phone"):
        score += 2
    if row.get("website"):
        score += 2
    if row.get("email"):
        score += 3
    if row.get("rating"):
        score += 1
    if row.get("review_count"):
        score += 1
    if row.get("address"):
        score += 1
    return score


def dedupe_key_candidates(row: dict[str, Any]) -> list[tuple[str, str]]:
    keys: list[tuple[str, str]] = []
    place_id = normalize_text(row.get("place_id"))
    domain = extract_domain(row.get("website"))
    phone = normalize_phone(row.get("phone"))
    name_address = f"{normalize_text(row.get('business_name'))}|{normalize_text(row.get('address'))}"

    if place_id:
        keys.append(("place_id", place_id))
    if domain:
        keys.append(("domain", domain))
    if phone:
        keys.append(("phone", phone))
    if name_address != "|":
        keys.append(("name_address", name_address))
    return keys


def merge_missing_fields(primary: dict[str, Any], secondary: dict[str, Any]) -> dict[str, Any]:
    merged = dict(primary)
    for column in FINAL_COLUMNS:
        if not merged.get(column) and secondary.get(column):
            merged[column] = secondary.get(column)
    return merged


def dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sorted_rows = sorted(rows, key=completeness_score, reverse=True)
    kept: list[dict[str, Any]] = []
    index: dict[tuple[str, str], int] = {}

    for row in sorted_rows:
        keys = dedupe_key_candidates(row)
        existing_indexes = [index[key] for key in keys if key in index]
        if existing_indexes:
            target_index = existing_indexes[0]
            kept[target_index] = merge_missing_fields(kept[target_index], row)
            for key in keys:
                index[key] = target_index
            continue

        kept.append(row)
        new_index = len(kept) - 1
        for key in keys:
            index[key] = new_index

    return kept


def dedupe_file(input_path: Path | str, output_path: Path | str) -> list[dict[str, Any]]:
    logger = setup_logging()
    rows = read_rows_csv(input_path)
    deduped = dedupe_rows(rows)
    write_rows_csv(output_path, deduped, FINAL_COLUMNS)
    logger.info("Deduped %s rows down to %s rows at %s", len(rows), len(deduped), output_path)
    return deduped


def main() -> None:
    parser = argparse.ArgumentParser(description="Deduplicate enriched lead rows into a final clean CSV.")
    parser.add_argument("--input", default=str(OUTPUT_DIR / "enriched_leads.csv"), help="Input enriched leads CSV.")
    parser.add_argument("--output", default=str(OUTPUT_DIR / "final_leads.csv"), help="Output final leads CSV.")
    args = parser.parse_args()
    dedupe_file(args.input, args.output)


if __name__ == "__main__":
    main()
