---
name: retell-flow-ops
description: Use when creating, validating, inspecting, listing, or updating Retell AI conversation flows. Runs the local Retell flow CLI against official Retell conversation-flow endpoints.
---

# Retell Flow Ops

Use this skill when the user wants Codex to create or update a Retell AI conversational flow, inspect an existing flow, or validate a flow payload before sending it to Retell.

## Workflow

1. Find the flow spec in the workspace first. Prefer existing JSON or docs in the repo before inventing structure.
2. Convert markdown or prose flow designs into a JSON payload that matches Retell's conversation-flow API.
3. Validate the payload with:

```bash
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs validate --input <path-to-json>
```

4. Create a new flow with:

```bash
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs create --input <path-to-json>
```

5. Update an existing flow with:

```bash
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs update --conversation-flow-id <flow-id> --input <path-to-json>
```

6. Inspect or list flows when needed:

```bash
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs get --conversation-flow-id <flow-id>
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs list --limit 20
```

7. Delete a flow only when the user explicitly asks:

```bash
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs delete --conversation-flow-id <flow-id>
```

## Rules

- Require `RETELL_API_KEY` in the environment before calling Retell. The CLI will also auto-load `.env.local`, `.env.development.local`, or `.env` from the repo root if present.
- When creating a flow, ensure the payload includes `model_choice`, `nodes`, and `start_speaker`.
- When validating an update-only patch, use `validate --mode update`.
- On updates, use `--version` only when the user explicitly wants a specific flow version.
- Retell documents that published versions cannot be changed and only the latest version can be changed, so be careful when the user asks to mutate an older published agent or flow.
- Prefer concise payload edits instead of rebuilding the entire graph when only one section changed.
- Use the conversation-flow endpoints on `https://api.retellai.com`, not the `/v2` call API base.

## Helpful local context

- Existing Retell material in this repo lives under [integrations/retell-cold-call-demo](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/README.md).
- The workspace also already has a Retell helper at [lib/phone/retell.ts](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/lib/phone/retell.ts).
