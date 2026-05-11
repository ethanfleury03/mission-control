# Outreach Deep Sync Bridge

Production-only read-only gateway for Mission Control Outreach CRM Deep Sync.

The service accepts Mission Control signed `deep_sync` requests, reads reconciled
Sasha, Mark, Aaron, and Jordan outreach `state.json` snapshots from Cloud
Storage, and returns strict `activitySnapshot` JSON. It does not call Gmail,
draft/send email, modify HubSpot, or write data anywhere.

Expected state object:

```json
{
  "contacts": {
    "person@example.com": {
      "touch_count": 1,
      "sent_at": "2026-05-01T14:00:00Z",
      "last_reply_at": "2026-05-02T15:00:00Z",
      "last_reply_snippet": "Sure, send more info.",
      "reply_status": "positive",
      "sent_thread_id": "gmail-thread-id"
    }
  }
}
```

Deploy with:

```bash
bash deploy/gcp/deploy-outreach-deep-sync.sh prod "$PROJECT_ID" us-central1
```

Refresh the state snapshots with:

```bash
bash deploy/gcp/upload-prod-outreach-state.sh "$PROJECT_ID"
```
