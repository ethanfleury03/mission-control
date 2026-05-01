# Lead List Generator

A small internal CSV pipeline for building lead lists from business search terms and locations.

The flow is intentionally simple:

```text
searches.csv -> raw_leads.csv -> enriched_leads.csv -> final_leads.csv
```

It is not a CRM, not a cold-email sender, and not a massive database. It fetches business listings from a configurable Places/Maps-style API provider, enriches websites for contact information, deduplicates rows, and exports a clean CSV for tools like HubSpot, Instantly, Smartlead, Apollo, Clay, or Google Sheets.

## Install

Use Python 3.11+.

```bash
cd lead-list-generator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Configure `.env`

The first provider path is RapidAPI-style. Fill these values once you choose a provider:

```env
PLACES_PROVIDER=rapidapi
RAPIDAPI_KEY=your_key_here
RAPIDAPI_HOST=local-business-data.p.rapidapi.com
RAPIDAPI_ENDPOINT=/search
RAPIDAPI_LANGUAGE=en
RAPIDAPI_REGION=us
RAPIDAPI_EXTRACT_EMAILS_AND_CONTACTS=false
```

The bundled parser is currently set up for RapidAPI's **Local Business Data / GET Search** endpoint. It sends a combined query such as `dentist in Toronto ON` with `limit`, `language`, `region`, and `extract_emails_and_contacts=false`.

Rate limits and timeouts are also controlled in `.env`:

```env
REQUEST_TIMEOUT_SECONDS=15
WEBSITE_TIMEOUT_SECONDS=10
API_SLEEP_SECONDS=1
WEBSITE_SLEEP_SECONDS=0.5
MAX_WEBSITE_PAGES=3
MAX_RETRIES=3
USER_AGENT=Mozilla/5.0 LeadListGenerator/1.0
```

## Prepare Input

Create `input/searches.csv` with:

```csv
query,location,max_results
dentist,Toronto ON,25
roofing contractor,Dallas TX,25
commercial printer,Chicago IL,25
```

An example file is included at `input/searches.example.csv`.

For Arrow-style prospecting, start with `input/arrow-label-searches.csv`:

```csv
query,location,max_results
digital label printer,Chicago IL,10
label converter,Chicago IL,10
packaging printer,Chicago IL,10
commercial label printing,Dallas TX,10
flexographic label printer,Dallas TX,10
label manufacturer,Toronto ON,10
packaging converter,Toronto ON,10
```

## Demo Mode

Run the pipeline without a real API key:

```bash
python scripts/run_pipeline.py --input input/searches.example.csv --output output/final_leads.csv --demo
```

Demo mode writes five fake raw leads, runs website enrichment where possible, deduplicates them, and creates `output/final_leads.csv`.

## Run With a Real Provider

After `.env` is configured:

```bash
python scripts/run_pipeline.py --input input/searches.csv --output output/final_leads.csv
```

For the Arrow starter search:

```bash
python scripts/run_pipeline.py --input input/arrow-label-searches.csv --output output/final_leads.csv
```

Start small. A good first live input is:

```csv
query,location,max_results
dentist,Toronto ON,10
```

Review the CSV manually before scaling up.

## Run Individual Steps

Fetch only:

```bash
python scripts/fetch_places.py --input input/searches.csv --output output/raw_leads.csv
```

Fetch demo data only:

```bash
python scripts/fetch_places.py --input input/searches.example.csv --output output/raw_leads.csv --demo
```

Enrich only:

```bash
python scripts/enrich_websites.py --input output/raw_leads.csv --output output/enriched_leads.csv
```

Dedupe only:

```bash
python scripts/dedupe.py --input output/enriched_leads.csv --output output/final_leads.csv
```

## Output Files

`output/raw_leads.csv` contains API listings:

- business name, category, address, city, state, postal code, country
- phone, website, rating, review count
- latitude, longitude, place ID, maps URL
- source query, source location, provider, fetched timestamp

`output/enriched_leads.csv` adds website fields:

- primary email, all emails, contact page
- website status, status code, final URL, HTTPS flag
- page title and meta description

`output/final_leads.csv` is the deduplicated clean export.

## RapidAPI Parser Notes

RapidAPI providers do not all return the same JSON shape. The current code supports common shapes and includes safe placeholder parsing.

When connecting a specific provider, update:

- `scripts/fetch_places.py`
- `build_rapidapi_request()` for endpoint and query parameters
- `extract_items_from_response()` if the result list is nested unusually
- `parse_place()` for provider-specific field names

Keep the standard output schema unchanged so enrichment and dedupe continue to work.

## Error Handling and Logs

The pipeline should not die because one query or website fails.

- API calls retry with exponential backoff.
- Failed API queries are logged and skipped.
- `403 Forbidden` usually means the RapidAPI app is not subscribed to the selected API.
- `429 Too Many Requests` means the current plan or rate limit was hit.
- Website timeouts/SSL/connection errors are recorded in `website_status`.
- Logs are written to `logs/pipeline.log`.

## Deduplication

Rows are deduplicated in this order:

1. `place_id`
2. normalized website domain
3. normalized phone number
4. normalized business name + address

When duplicates exist, the row with the highest completeness score wins:

- phone: +2
- website: +2
- email: +3
- rating: +1
- review count: +1
- address: +1

## Known Limitations

- A real Places API endpoint must be selected and mapped before live fetching.
- Website enrichment is intentionally shallow and synchronous.
- JavaScript-heavy websites may not expose emails without a browser crawler.
- Email extraction can miss obfuscated emails and should be reviewed.
- No CRM upload, cold-email sending, scheduling, or database storage is included.

## Compliance Note

Use responsibly. Follow applicable data, privacy, anti-spam, platform, and email laws and policies. Do not collect or use data in a way that violates provider terms or customer expectations.
