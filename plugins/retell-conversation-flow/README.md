# Retell Conversation Flow Plugin

This plugin gives Codex a workspace-local way to create, inspect, validate, list, and update Retell AI conversation flows.

## What it includes

- A Codex skill for Retell flow work
- A local CLI for Retell's conversation-flow API
- Marketplace wiring at [marketplace.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/.agents/plugins/marketplace.json)

## Requirements

- `RETELL_API_KEY` must be available to the CLI
- The CLI will automatically read `.env.local`, `.env.development.local`, or `.env` from the current repo if the key is not already exported
- Retell API docs used for this plugin:
  - [Create Conversation Flow](https://docs.retellai.com/api-references/create-conversation-flow)
  - [Update Conversation Flow](https://docs.retellai.com/api-references/update-conversation-flow)
  - [Get Conversation Flow](https://docs.retellai.com/api-references/get-conversation-flow)
  - [List Conversation Flows](https://docs.retellai.com/api-references/list-conversation-flows)
  - [Conversation Flow Overview](https://docs.retellai.com/build/conversation-flow/overview)
  - [Agent Versioning](https://docs.retellai.com/agent/version)

## CLI examples

```bash
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs validate --input /tmp/flow.json
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs validate --mode update --input /tmp/flow-patch.json
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs create --input /tmp/flow.json
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs update --conversation-flow-id conversation_flow_123 --input /tmp/flow.json
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs get --conversation-flow-id conversation_flow_123
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs list --limit 20
node plugins/retell-conversation-flow/scripts/retell-flow-cli.mjs delete --conversation-flow-id conversation_flow_123
```

## Notes

- Retell documents `model_choice`, `nodes`, and `start_speaker` as required when creating a conversation flow.
- Retell documents `version` as an optional query parameter on updates.
- Retell's versioning docs say published versions cannot be changed and only the latest version can be changed.
- Retell conversation-flow endpoints live on `https://api.retellai.com`, not the `/v2` call API base.
