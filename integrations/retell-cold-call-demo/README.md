# Retell Cold Call Demo

This folder now tracks the legacy prompt-era demo, the earlier v2 conversation-flow rebuild, and the current v3 draft flow created on April 24, 2026.

## Recommended demo state

- Recommended voice agent: `agent_116dfdec8727eb1da6d5d3d8a3`
- Conversation flow: `conversation_flow_c8cb3e685e49`
- Flow model: `gpt-5.4`
- Voice: `openai-Coral`
- Voice tuning:
  - `voice_speed=0.92`
  - `enable_dynamic_voice_speed=false`
  - `responsiveness=0.78`
  - `interruption_sensitivity=0.28`
  - `enable_backchannel=false`
  - `begin_message_delay_ms=260`

## Why there is still a separate demo agent

- The original demo agent was `agent_6c8d946ce386930457d2e72aa9`.
- Retell would not let that existing agent switch from `retell-llm` to `conversation-flow` because that agent is already on version `2`.
- The API error was: `Cannot update response engine of agent version > 0`.
- Because of that platform limitation, the conversation-flow demo continues to live on the separate draft voice agent `agent_116dfdec8727eb1da6d5d3d8a3`.

## What changed in v3

- The opener now follows the rep-approved public wording: Sasha from Arrow Systems, immediately described as a manufacturer of digital label printing and finishing equipment.
- The flow is more explicit about the ideal target: operations or upper management handling printing-equipment decisions.
- Objections were rewritten around the rep guidance:
  - already have a printer
  - outsource today
  - budget concern
  - direct price question
  - send me information
- Pricing is now only given when asked directly, using the approved machine ranges.
- ROI, payback, competitor comparisons, financing, lead-time guarantees, support guarantees, and blanket substrate claims remain blocked.
- The flow now has extra loop-breakers for:
  - explicit opener exits for `No, wrong person` and early declines so the intro does not replay
  - direct machine-spec questions like web width, print width, speed, and resolution
  - material-compatibility questions
  - proof / case-study requests
  - repeated turnkey-pricing pushback
  - gatekeepers who prefer materials first
- The wrong-person branch now asks for a better phone number or email first, instead of starting with a generic routing question.
- The outsource follow-up branch is now a fixed line instead of a generated response so it speaks faster and more consistently during tests.

## Curated knowledge bases

- `knowledge_base_ade786b454005132` - `Arrow Company ICP`
- `knowledge_base_0526c2e496fbed0c` - `Arrow Products`
- `knowledge_base_7c1416f760cdb54a` - `Arrow Industries`

## Fixed mock meeting times

- Tuesday, April 28, 2026 at 11:00 AM ET
- Wednesday, April 29, 2026 at 2:00 PM ET
- Thursday, April 30, 2026 at 10:30 AM ET
- Friday, May 1, 2026 at 1:30 PM ET
- Monday, May 4, 2026 at 3:00 PM ET

## Test coverage

New v3 simulation cases:

- `test_case_55e776901d5a` - `Cold Call Demo V3 - Qualified Prospect Books Slot`
- `test_case_f2ec7139f6a7` - `Cold Call Demo V3 - Wrong Person Routes To Operations`
- `test_case_80c828fbd5b3` - `Cold Call Demo V3 - Gatekeeper Screens The Call`
- `test_case_f8951e6be032` - `Cold Call Demo V3 - Prospect Asks What Arrow Does`
- `test_case_1225eb0a03e3` - `Cold Call Demo V3 - Prospect Already Has A Printer`
- `test_case_7353e8e8287f` - `Cold Call Demo V3 - Prospect Outsources Today`
- `test_case_50ad7732c8e4` - `Cold Call Demo V3 - Budget Objection`
- `test_case_fa88c87a54cf` - `Cold Call Demo V3 - Direct Price Question`
- `test_case_c64f1710124b` - `Cold Call Demo V3 - Send Me Some Information`
- `test_case_d9bce6701ede` - `Cold Call Demo V3 - Too Busy Right Now`
- `test_case_8194252092ec` - `Cold Call Demo V3 - Prospect Asks If Caller Is AI`
- `test_case_6a561724dead` - `Cold Call Demo V3 - Material Capability Question`
- `test_case_7feb3167b787` - `Cold Call Demo V3 - Voicemail Detection`
- `test_case_737fe15e26b7` - `Cold Call Demo V3 - Opt Out Request`

Batch runs created during the v3 rebuild:

- `test_batch_2faa993c395e`
  - initial full-suite run on the first v3 draft
  - result: `9` pass, `1` fail, `4` error
- `test_batch_44855d713763`
  - targeted rerun after the first patch set
  - individual runs showed `Too Busy`, `Material Capability`, and `Prospect Asks What Arrow Does` passing, while `Gatekeeper` and `Direct Price Question` still needed one more patch
- `test_batch_4314f2761c3f`
  - second targeted rerun after the final price and gatekeeper patches
  - individual runs showed both `Gatekeeper` and `Direct Price Question` passing
- `test_batch_8f907c5a8a01`
  - first full-suite rerun after the loop-handling patches
  - result: `10` pass, `2` fail, `2` error
- `test_batch_64d486551681`
  - targeted rerun after tightening the opener handoff and budget path
  - `Budget Objection` passed and `Direct Price Question` still needed one more qualifying-question patch
- `test_batch_12490a868bf9`
  - final single-case rerun for `Direct Price Question`
  - result: `1` pass, `0` fail, `0` error
- `test_batch_5c6cf8a74413`
  - latest full-suite rerun from the final patched flow
  - still running at snapshot time, with `6` cases already marked pass and `0` fails / `0` errors so far

## How to test in Retell

1. Open the Retell dashboard and find agent `agent_116dfdec8727eb1da6d5d3d8a3`.
2. Use the draft version tied to flow `conversation_flow_c8cb3e685e49`.
3. Try the saved simulation cases or run manual prompts such as:
   - `We outsource labels today.`
   - `What do you guys do?`
   - `We already have a printer.`
   - `This is outside our budget.`
   - `What do your printers cost?`
   - `Send me some information.`
   - `Can your machines print on metallized film?`
   - `Are you AI?`
   - `Take me off your list.`

## Publish status

- The rebuilt v3 agent exists as a draft and has not been published from this workspace.
- Manual listen-pass is still recommended before any publish decision.
- The current repo snapshot reflects the live draft flow and agent attachment, not a published production version.

## Files in this folder

- [conversation-flow-v2.md](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/conversation-flow-v2.md)
- [conversation-flow-v3.md](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/conversation-flow-v3.md)
- [retell-agent-config.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-agent-config.json)
- [retell-flow-v3.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-flow-v3.json)
- [retell-test-cases-v3.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-test-cases-v3.json)
- [retell-test-case-results-v3.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-test-case-results-v3.json)
- [retell-batch-test-v3.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-batch-test-v3.json)
- [retell-llm-prompt.md](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/retell-cold-call-demo/retell-llm-prompt.md)
