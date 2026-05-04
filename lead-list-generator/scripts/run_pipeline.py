from __future__ import annotations

import argparse
from pathlib import Path

from config import OUTPUT_DIR
from dedupe import dedupe_file
from enrich_websites import enrich_file
from fetch_places import fetch_from_search_file
from utils import setup_logging


def run_pipeline(input_path: Path | str, output_path: Path | str, demo: bool = False) -> None:
    logger = setup_logging()
    raw_path = OUTPUT_DIR / "raw_leads.csv"
    enriched_path = OUTPUT_DIR / "enriched_leads.csv"

    logger.info("Starting lead list pipeline%s", " in demo mode" if demo else "")
    fetch_from_search_file(input_path, raw_path, demo=demo)
    enrich_file(raw_path, enriched_path)
    dedupe_file(enriched_path, output_path)
    logger.info("Pipeline complete. Final leads written to %s", output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the full lead list generator pipeline.")
    parser.add_argument("--input", default="input/searches.csv", help="Input searches CSV.")
    parser.add_argument("--output", default=str(OUTPUT_DIR / "final_leads.csv"), help="Final output CSV.")
    parser.add_argument("--demo", action="store_true", help="Use fake sample leads instead of calling a real Places API.")
    args = parser.parse_args()
    run_pipeline(args.input, args.output, demo=args.demo)


if __name__ == "__main__":
    main()
