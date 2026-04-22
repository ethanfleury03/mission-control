# Retell Cold Call Demo

This folder now tracks both the legacy prompt-era Arrow Systems demo and the rebuilt conversation-flow v2 draft created on April 20, 2026.

## Recommended demo state

- Recommended voice agent: `agent_116dfdec8727eb1da6d5d3d8a3`
- Agent name: `Arrow Systems Cold Call Demo V2`
- Conversation flow: `conversation_flow_942dd6bbaf78`
- Flow model: `gpt-4.1`
- Voice: `11labs-Adrian`
- Voice model: `eleven_turbo_v2`

## Why there is a new agent ID

- The original demo agent was `agent_6c8d946ce386930457d2e72aa9`.
- Retell would not let the existing agent switch from `retell-llm` to `conversation-flow` because that agent is already on version `2`.
- The API error was: `Cannot update response engine of agent version > 0`.
- Because of that platform limitation, the rebuild was created as a new draft voice agent instead of mutating the old agent in place.

## What was rebuilt

- The new v2 demo is a Retell Conversation Flow, not a single-prompt LLM.
- The opener is now reason-first and relevance-first, not meeting-first.
- Discovery happens before the calendar ask.
- Three curated knowledge bases were created from `arrsys.com` and attached to targeted nodes.
- The agent remains fully mocked: no live calendar, CRM, webhook, or external booking integration.
- The flow still uses only the five fixed demo slots and never invents other times.
- The demo voice was tuned for slower pacing, lighter interruption behavior, backchanneling, boosted keywords, and a pronunciation dictionary.

## Curated knowledge bases

- `knowledge_base_ade786b454005132` - `Arrow Company ICP`
- `knowledge_base_0526c2e496fbed0c` - `Arrow Products`
- `knowledge_base_7c1416f760cdb54a` - `Arrow Industries`

## Fixed mock meeting times

- Tuesday, April 21, 2026 at 11:00 AM ET
- Wednesday, April 22, 2026 at 2:00 PM ET
- Thursday, April 23, 2026 at 10:30 AM ET
- Friday, April 24, 2026 at 1:30 PM ET
- Monday, April 27, 2026 at 3:00 PM ET

## Test coverage

New v2 simulation cases:

- `test_case_54364fdc90ba` - `Cold Call Demo V2 - Qualified Prospect Books Slot`
- `test_case_1cc105f07c8b` - `Cold Call Demo V2 - Busy Prospect Accepts Callback Slot`
- `test_case_894948dbe70c` - `Cold Call Demo V2 - Prospect Asks What Arrow Systems Sells`
- `test_case_0a2b966510dc` - `Cold Call Demo V2 - Prospect Asks If Caller Is AI`
- `test_case_760f8529f3eb` - `Cold Call Demo V2 - Wrong Person And Gatekeeper`
- `test_case_9cb80e8c7200` - `Cold Call Demo V2 - Prospect Already Has Vendor`
- `test_case_f18110936b96` - `Cold Call Demo V2 - Prospect Asks For Email Info`
- `test_case_b181016b0f08` - `Cold Call Demo V2 - Prospect Asks Product Question`
- `test_case_4f20e11ea04f` - `Cold Call Demo V2 - Prospect Asks Industry Fit Question`
- `test_case_1df5923dd4c5` - `Cold Call Demo V2 - Voicemail Detection`

Batch run created from the 10 cases:

- `test_batch_4acdb38dabe5` - `complete` with `8` pass, `1` fail, `1` error

Follow-up verification after patching the flow:

- `test_batch_0f9d0c9b81b8` - targeted rerun for the AI disclosure and product-question cases
- Result: `2` pass, `0` fail, `0` error
- The two issues from the initial batch were cleared by the follow-up flow patch

Legacy simulation cases tied to the old prompt-based setup were deleted after the v2 suite was created.

## How to test in Retell

1. Open the Retell dashboard and find agent `agent_116dfdec8727eb1da6d5d3d8a3`.
2. Use the `Test LLM` or built-in voice testing UI against the draft version of that agent.
3. Try the saved simulation cases or run manual prompts such as:
   - `We outsource labels today.`
   - `What do you actually sell?`
   - `Are you a robot?`
   - `Send me something.`
   - `I already have a printer.`
   - `Do you do pharma or chemical labels?`
   - `Take me off your list.`

## Publish status

- The rebuilt v2 agent exists as a draft and has not been published from this workspace.
- The original plan called for publish only after a manual listen pass and QA review.
- Those listen/QA gates still need to happen in the Retell UI before a production-style publish.

## Files in this folder

- [conversation-flow-v2.md](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/conversation-flow-v2.md)
- [retell-agent-config.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-agent-config.json)
- [retell-llm-prompt.md](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-llm-prompt.md)
