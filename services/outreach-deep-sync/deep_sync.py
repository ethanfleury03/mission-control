#!/usr/bin/env python3
"""Read-only Sasha Outreach deep sync gateway for Mission Control.

This service intentionally reads a reconciled outreach state snapshot and returns
strict JSON only. It never drafts, sends, modifies Gmail, or writes HubSpot.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

AGENT_ID = "sasha-outreach"
DEFAULT_STATE_PATH = Path(__file__).resolve().parent / "state.json"
FORBIDDEN_KEYS = {
    "sentMessage",
    "draftMessage",
    "draftId",
    "sentMessageId",
    "gmailDraftId",
    "gmailMessageId",
}
VALID_STATUSES = {"positive", "out_of_office", "needs_review", "bounce", "stopped", "no_reply"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm_email(value: Any) -> str:
    return str(value or "").strip().lower()


def looks_like_email(value: str) -> bool:
    return "@" in value and "." in value.rsplit("@", 1)[-1]


def clamp_int(value: Any, lo: int = 0, hi: int = 20) -> int:
    try:
        n = int(value or 0)
    except Exception:
        n = 0
    return max(lo, min(hi, n))


def iso_or_null(value: Any) -> str | None:
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s).isoformat()
    except Exception:
        return str(value)


def clean_snippet(value: Any, limit: int = 1000) -> str:
    s = re.sub(r"\s+", " ", str(value or "")).strip()
    return s[:limit]


def metadata_access_token() -> str:
    req = Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    )
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["access_token"]


def read_gcs_json(uri: str) -> dict[str, Any]:
    if not uri.startswith("gs://"):
        raise ValueError("GCS URI must start with gs://")
    bucket_and_object = uri[5:]
    bucket, _, object_name = bucket_and_object.partition("/")
    if not bucket or not object_name:
        raise ValueError("GCS URI must include bucket and object")
    encoded_object = object_name.replace("/", "%2F")
    url = f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{encoded_object}?alt=media"
    token = metadata_access_token()
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_state(path: Path) -> dict[str, Any]:
    gcs_uri = os.environ.get("SASHA_OUTREACH_STATE_GCS_URI", "").strip()
    if gcs_uri:
        try:
            data = read_gcs_json(gcs_uri)
        except HTTPError as exc:
            if exc.code == 404:
                return {"contacts": {}, "threads": {}, "missingStateGcsUri": gcs_uri}
            raise
    elif path.exists():
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {"contacts": {}, "threads": {}, "missingStatePath": str(path)}
    if not isinstance(data, dict):
        raise ValueError("Sasha outreach state must be a JSON object")
    data.setdefault("contacts", {})
    data.setdefault("threads", {})
    return data


def extract_json_objects(text: str) -> list[Any]:
    found: list[Any] = []
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch not in "[{":
            continue
        try:
            obj, _ = decoder.raw_decode(text[i:])
            found.append(obj)
        except Exception:
            continue
    return found


def extract_contacts_from_payload(obj: Any) -> list[str]:
    emails: list[str] = []

    def walk(x: Any) -> None:
        if isinstance(x, dict):
            if "email" in x:
                e = norm_email(x.get("email"))
                if looks_like_email(e):
                    emails.append(e)
            if "contact" in x and isinstance(x.get("contact"), dict):
                e = norm_email(x["contact"].get("email"))
                if looks_like_email(e):
                    emails.append(e)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(obj)
    return emails


def parse_message(message: str) -> dict[str, Any]:
    parsed: dict[str, Any] = {"jobId": None, "callbackUrl": None, "contacts": []}
    for obj in extract_json_objects(message or ""):
        if isinstance(obj, dict):
            parsed["jobId"] = parsed["jobId"] or obj.get("jobId") or obj.get("job_id")
            parsed["callbackUrl"] = parsed["callbackUrl"] or obj.get("callbackUrl") or obj.get("callback_url")
            payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
            parsed["jobId"] = parsed["jobId"] or payload.get("jobId") or payload.get("job_id")
            parsed["contacts"].extend(extract_contacts_from_payload(obj))
    m = re.search(r"jobId\s*[:=]\s*['\"]?([A-Za-z0-9_.:-]+)", message or "")
    if m and not parsed["jobId"]:
        parsed["jobId"] = m.group(1)
    m = re.search(r"callbackUrl\s*[:=]\s*['\"]?(https?://[^\s'\"]+)", message or "")
    if m and not parsed["callbackUrl"]:
        parsed["callbackUrl"] = m.group(1)
    parsed["contacts"].extend(norm_email(x) for x in re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", message or "", re.I))
    seen = set()
    parsed["contacts"] = [x for x in parsed["contacts"] if x and not (x in seen or seen.add(x))]
    return parsed


def classify_contact(c: dict[str, Any]) -> tuple[str, bool, bool, bool, str, str]:
    reply_status = str(c.get("reply_status") or "").strip().lower()
    snippet = clean_snippet(c.get("last_reply_snippet") or c.get("stop_reason") or c.get("bounce_reason"), 2000).lower()
    stopped = bool(c.get("stopped"))
    positive = bool(c.get("positive_reply"))
    human = bool(c.get("human_review_required"))
    stop_reason = clean_snippet(c.get("stop_reason") or c.get("bounce_reason") or "", 250)
    has_reply_evidence = bool(c.get("last_reply_at") or c.get("last_reply_snippet") or c.get("last_reply_subject"))

    if positive:
        return "positive", True, False, False, "", "Marked positive/interested in Sasha outreach state."
    if reply_status in {"positive", "interested"}:
        return "positive", True, False, False, "", "Reply status indicates positive/interested."
    if reply_status in {"out_of_office", "ooo", "auto_reply"} or "out of office" in snippet or "automatic reply" in snippet:
        return "out_of_office", False, False, False, "", "Auto-reply or out-of-office evidence found."
    if reply_status in {"bounce", "bounced"} or "address not found" in snippet or "delivery has failed" in snippet or "undeliver" in snippet:
        return "bounce", False, False, True, stop_reason or "bounce/undeliverable", "Delivery failure/bounce evidence found."
    if stopped or any(x in snippet for x in ["unsubscribe", "remove me", "do not contact", "not interested", "no thanks"]):
        return "stopped", False, False, True, stop_reason or "stopped by reply/status", "Stop/unsubscribe/not-interested evidence found."
    sensitive_terms = ["pricing", "price", "quote", "legal", "contract", "complaint", "angry", "sensitive", "lawsuit", "attorney"]
    if has_reply_evidence and (
        human or reply_status in {"needs_review", "sensitive/needs-human", "sensitive", "unclear"} or any(x in snippet for x in sensitive_terms)
    ):
        return "needs_review", False, True, False, "", "Reply requires conservative human review."
    if has_reply_evidence:
        return "needs_review", False, True, False, "", "Reply exists but is not safely classifiable as positive/OOO/bounce/stop."
    return "no_reply", False, False, False, "", "Outbound exists and no meaningful reply evidence was found."


def contact_record(email: str, c: dict[str, Any] | None, unmatched: bool = False) -> dict[str, Any]:
    c = c or {}
    status, positive, human, stopped, stop_reason, reason = classify_contact(c) if c else ("no_reply", False, False, False, "", "No local outreach evidence found for this contact.")
    thread_id = c.get("sent_thread_id") or c.get("last_reply_thread_id")
    if not thread_id and isinstance(c.get("thread_ids"), list) and c.get("thread_ids"):
        thread_id = c["thread_ids"][0]
    occurred = iso_or_null(c.get("last_reply_at") or c.get("last_outbound_at") or c.get("sent_at")) or now_iso()
    rec: dict[str, Any] = {
        "email": norm_email(email),
        "touchCount": clamp_int(c.get("touch_count")),
        "lastOutboundAt": iso_or_null(c.get("last_outbound_at") or c.get("sent_at")),
        "nextFollowupAllowedAt": iso_or_null(c.get("next_followup_allowed_at")),
        "replyStatus": status,
        "lastReplyAt": iso_or_null(c.get("last_reply_at")),
        "lastReplySnippet": clean_snippet(c.get("last_reply_snippet") or c.get("bounce_reason") or c.get("stop_reason")),
        "positiveReply": positive,
        "humanReviewRequired": human,
        "stopped": stopped,
        "stopReason": stop_reason if stopped else "",
        "gmailThreadId": str(thread_id) if thread_id else None,
        "events": [{"type": "classification", "occurredAt": occurred, "summary": reason, "source": "sasha_state" if c else "openclaw"}],
    }
    if unmatched:
        rec["unmatched"] = True
    return rec


def build_snapshot(message: str = "", state_path: Path | None = None) -> dict[str, Any]:
    state_path = state_path or Path(os.environ.get("SASHA_OUTREACH_STATE_PATH") or DEFAULT_STATE_PATH)
    parsed = parse_message(message)
    state = load_state(state_path)
    contacts_state = state.get("contacts") or {}
    by_email = {norm_email(email): data for email, data in contacts_state.items() if norm_email(email)}

    requested = parsed.get("contacts") or []
    rows: list[dict[str, Any]] = []
    if requested:
        for email in requested:
            c = by_email.get(norm_email(email))
            rows.append(contact_record(email, c, unmatched=c is None))
    else:
        for email in sorted(by_email):
            rows.append(contact_record(email, by_email[email]))

    source = os.environ.get("SASHA_OUTREACH_STATE_GCS_URI") or str(state_path)
    snapshot = {
        "generatedAt": now_iso(),
        "sourceSummary": f"Checked Sasha outreach state at {source}; Gmail evidence is limited to fields already reconciled into state.json.",
        "contacts": rows,
    }
    return {
        "jobId": parsed.get("jobId") or f"local-{uuid.uuid4()}",
        "status": "completed",
        "agentId": AGENT_ID,
        "activitySnapshot": snapshot,
        "rawOutput": f"Read-only deep sync completed for {len(rows)} contact(s). No Gmail/HubSpot writes attempted.",
    }


def assert_no_forbidden_keys(obj: Any, path: str = "") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in FORBIDDEN_KEYS:
                raise ValueError(f"Forbidden output field present: {path + '.' if path else ''}{k}")
            assert_no_forbidden_keys(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            assert_no_forbidden_keys(v, f"{path}[{i}]")


def validate_response(obj: dict[str, Any]) -> None:
    assert_no_forbidden_keys(obj)
    snap = obj.get("activitySnapshot")
    if not isinstance(snap, dict):
        raise ValueError("Missing activitySnapshot object")
    contacts = snap.get("contacts")
    if not isinstance(contacts, list):
        raise ValueError("activitySnapshot.contacts must be a list")
    for i, c in enumerate(contacts):
        status = c.get("replyStatus")
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid replyStatus at contacts[{i}]: {status!r}")
        if not isinstance(c.get("touchCount"), int) or not (0 <= c["touchCount"] <= 20):
            raise ValueError(f"Invalid touchCount at contacts[{i}]")
        for key in ["lastOutboundAt", "nextFollowupAllowedAt", "lastReplyAt", "gmailThreadId"]:
            if key not in c:
                raise ValueError(f"Missing {key} at contacts[{i}]")


def dumps_strict(obj: dict[str, Any]) -> str:
    validate_response(obj)
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def sign_body(raw_body: str, secret: str, event_id: str, timestamp: str) -> str:
    signed = f"{event_id}.{timestamp}.{raw_body}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def webhook_secrets() -> list[str]:
    values = [
        os.environ.get("OUTREACH_CRM_WEBHOOK_SECRET") or "",
        *(os.environ.get("OUTREACH_CRM_WEBHOOK_SECRETS") or "").split(","),
    ]
    seen: set[str] = set()
    return [s for s in (v.strip() for v in values) if s and not (s in seen or seen.add(s))]


def verify_signature(raw_body: bytes, headers: Any, secret: str) -> bool:
    event_id = headers.get("x-arrow-event-id") or headers.get("X-Arrow-Event-Id")
    timestamp = headers.get("x-arrow-timestamp") or headers.get("X-Arrow-Timestamp")
    signature = headers.get("x-arrow-signature") or headers.get("X-Arrow-Signature")
    if not event_id or not timestamp or not signature:
        return False
    expected = sign_body(raw_body.decode("utf-8"), secret, event_id, timestamp)
    return hmac.compare_digest(expected, signature)


class DeepSyncHandler(BaseHTTPRequestHandler):
    server_version = "SashaOutreachDeepSync/1.0"

    def do_GET(self) -> None:  # noqa: N802
        if self.path in {"/healthz", "/"}:
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true,"service":"sasha-outreach-deep-sync"}')
            return
        self.send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length)
        secrets = webhook_secrets()
        if not secrets:
            self.send_json(503, {"ok": False, "error": "webhook_secret_unconfigured"})
            return
        if not any(verify_signature(raw, self.headers, secret) for secret in secrets):
            self.send_json(401, {"ok": False, "error": "invalid_signature"})
            return
        try:
            request_obj = json.loads(raw.decode("utf-8") or "{}")
            if request_obj.get("agentId") != AGENT_ID or request_obj.get("actionType") != "deep_sync":
                self.send_json(400, {"ok": False, "error": "unsupported_agent_or_action"})
                return
            prompt = "\n".join([
                str(request_obj.get("prompt") or ""),
                json.dumps(request_obj.get("payload") or {}, separators=(",", ":")),
            ])
            result = build_snapshot(prompt)
            if request_obj.get("jobId"):
                result["jobId"] = request_obj["jobId"]
            self.send_json(200, result, strict=True)
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": "deep_sync_failed", "message": str(exc)[:500]})

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}", file=sys.stderr)

    def send_json(self, code: int, obj: dict[str, Any], strict: bool = False) -> None:
        raw = dumps_strict(obj) if strict else json.dumps(obj, separators=(",", ":"))
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(raw.encode("utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sasha Outreach Mission Control read-only deep sync")
    parser.add_argument("--message", default="", help="Mission Control prompt or JSON request body")
    parser.add_argument("--state-path", default=os.environ.get("SASHA_OUTREACH_STATE_PATH") or str(DEFAULT_STATE_PATH))
    parser.add_argument("--serve", action="store_true", help="Run a signed HTTP gateway")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", os.environ.get("OUTREACH_CRM_DEEP_SYNC_PORT", "8080"))))
    args = parser.parse_args(argv)

    if args.serve:
        httpd = ThreadingHTTPServer((args.host, args.port), DeepSyncHandler)
        print(f"sasha-outreach deep sync gateway listening on http://{args.host}:{args.port}", file=sys.stderr)
        httpd.serve_forever()
        return 0

    result = build_snapshot(args.message, Path(args.state_path))
    print(dumps_strict(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
