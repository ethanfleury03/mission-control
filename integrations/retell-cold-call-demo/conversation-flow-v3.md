# Arrow Systems Conversation Flow V3

This document captures the rep-guided Retell conversation-flow v3 rebuild created on April 24, 2026 for internal demo evaluation.

## Live object IDs

- Recommended demo agent: `agent_116dfdec8727eb1da6d5d3d8a3`
- Conversation flow: `conversation_flow_c8cb3e685e49`
- Flow model: `gpt-5.4`
- Legacy v2 flow: `conversation_flow_942dd6bbaf78`
- Legacy prompt agent: `agent_6c8d946ce386930457d2e72aa9`
- Legacy prompt LLM: `llm_b146b8861db8f3961ee1e2b97a2c`

## Goal

- Keep the experience fully mocked for internal review.
- Sound like a real Arrow rep using the sales rep's approved public language.
- Get to the right-person question quickly.
- Establish relevance before the meeting ask.
- Keep pricing, claims, and material compatibility inside approved guardrails.
- Use curated KB content from `arrsys.com` for product and industry answers.
- Keep scheduling deterministic with five fixed mock slots only.

## Dynamic variable contract

All values remain strings.

- `prospect_first_name`
- `company_name`
- `industry_segment`
- `contact_role`
- `suspected_pain`
- `current_equipment_hint`
- `reason_for_call`

Default values configured on the flow:

- `prospect_first_name=""`
- `company_name=""`
- `industry_segment="unknown"`
- `contact_role="unknown"`
- `suspected_pain="unknown"`
- `current_equipment_hint="unknown"`
- `reason_for_call="Arrow Systems helps teams bring short-run label and packaging production in-house."`

Prompting rule used throughout the flow:

- Ignore variables when they are empty or equal to `"unknown"`.

## Messaging baseline

Approved opening pattern:

- `Hi [name], my name is Sasha and I'm calling from Arrow Systems. We are a manufacturer of digital label printing and finishing equipment.`

Approved simple company explanation:

- `We are a manufacturer of digital printing and finishing solutions for labels and packaging. Our equipment helps manufacturers produce short runs efficiently in a practical, cost-effective way.`

Core value themes:

- short runs
- bringing work in-house
- practical efficiency
- better control
- improved turnaround

Blocked claim areas:

- ROI or payback claims
- competitor comparisons
- financing talk
- lead-time guarantees
- support guarantees
- machine performance guarantees
- blanket compatibility claims like `can print on any material`

Allowed material statement:

- Arrow can print on most pre-coated papers and films
- substrate fit should be confirmed through testing

Allowed pricing behavior:

- only when asked directly
- printers: roughly `$75,000` to `$600,000`
- finishers: roughly `$10,000` to `$200,000+`
- no ink pricing in v3

## Knowledge base layout

### KB 1: Arrow Company ICP

- ID: `knowledge_base_ade786b454005132`
- Purpose: company explanation, qualification, value framing, gatekeeper handling

### KB 2: Arrow Products

- ID: `knowledge_base_0526c2e496fbed0c`
- Purpose: product explanations, machine categories, pricing context, substrate guardrails

### KB 3: Arrow Industries

- ID: `knowledge_base_7c1416f760cdb54a`
- Purpose: industry-fit examples and use-case relevance

## Main path

### 1. Opening and qualification

- `start_intro`
  - approved public opener
  - explicit exits for `No, wrong person` and early `not interested` replies so the intro does not replay
  - right-person check for printing-equipment decisions
- `discovery_current_state`
  - one question about current setup or outsource/in-house status
- `value_bridge`
  - one reflection plus one production outcome tied to what they said
- `meeting_ask`
  - low-pressure fifteen-minute call request only after relevance exists

### 2. Mock scheduling

- `offer_slots_round_1`
  - Tuesday, April 28, 2026 at 11:00 AM ET
  - Wednesday, April 29, 2026 at 2:00 PM ET
- `offer_slots_round_2`
  - Thursday, April 30, 2026 at 10:30 AM ET
  - Friday, May 1, 2026 at 1:30 PM ET
- `offer_slots_round_3`
  - Monday, May 4, 2026 at 3:00 PM ET
- Confirmations remain slot-specific end nodes:
  - `confirm_tuesday_11`
  - `confirm_wednesday_2`
  - `confirm_thursday_1030`
  - `confirm_friday_130`
  - `confirm_monday_3`

## Global nodes

- `ai_disclosure`
  - honest AI disclosure only when asked
- `wrong_person`
  - asks first for a better phone number or email for the person who handles printing-equipment decisions
- `gatekeeper`
  - short reason-for-call answer with explicit routing ask
- `call_screening`
  - one-sentence name-and-reason response
- `busy_not_now`
  - acknowledges timing and moves straight to slot options
- `send_info_capture_email`
  - asks for the best email path
- `send_info_callback_round_1`
- `send_info_callback_round_2`
- `send_info_callback_round_3`
  - ask for callback times using only the fixed slots
- `already_have_solution`
  - asks how short-run jobs are handled and what could still improve
- `outsource_today`
  - now uses a fixed short line for lower latency: asks whether bringing short runs in-house has been considered
- `budget_objection`
  - asks for budget range without ROI or payback framing
- `price_question`
  - approved direct pricing answer only when asked
- `price_pushback`
  - handles repeated turnkey-price pressure without inventing a bundle total
- `material_capability_question`
  - approved substrate-compatibility answer that stays forward-moving instead of restarting discovery
- `machine_spec_question`
  - direct handling for web width, print width, speed, resolution, and other spec questions
- `proof_request`
  - transparent answer for case-study, reference, or documented-proof requests
- `not_sure_relevance`
  - one short industry example followed by a fit check
- `first_decline_soft_close`
  - one final low-pressure attempt
- `second_decline_close`
  - exact two-no close
- `remove_me`
  - immediate opt-out end
- `voicemail`
  - updated Sasha voicemail with `sasha@arrsys.com`
- `product_question`
  - plain-English equipment explanation plus one fit question
- `industry_question`
  - concise industry-fit answer

## Voice and agent attachment

- Draft voice agent reused: `agent_116dfdec8727eb1da6d5d3d8a3`
- Agent now points to flow `conversation_flow_c8cb3e685e49`
- Voice remains:
  - `openai-Coral`
  - `voice_speed=0.92`
  - `enable_dynamic_voice_speed=false`
  - `responsiveness=0.78`
  - `interruption_sensitivity=0.28`
  - `enable_backchannel=false`
  - `begin_message_delay_ms=260`
  - `normalize_for_speech=true`

Retell returned `voicemail_message=null` on the live agent response, so voicemail handling is enforced through the flow's `voicemail` end node instead of relying on the agent-level field.

## Saved v3 test suite

- `test_case_55e776901d5a` - Qualified prospect books a slot
- `test_case_f2ec7139f6a7` - Wrong person routes to operations
- `test_case_80c828fbd5b3` - Gatekeeper screens the call
- `test_case_f8951e6be032` - Prospect asks what Arrow does
- `test_case_1225eb0a03e3` - Prospect already has a printer
- `test_case_7353e8e8287f` - Prospect outsources today
- `test_case_50ad7732c8e4` - Budget objection
- `test_case_fa88c87a54cf` - Direct price question
- `test_case_c64f1710124b` - Send me some information
- `test_case_d9bce6701ede` - Too busy right now
- `test_case_8194252092ec` - Prospect asks if caller is AI
- `test_case_6a561724dead` - Material capability question
- `test_case_7feb3167b787` - Voicemail detection
- `test_case_737fe15e26b7` - Opt out request

### Automated verification status

- `test_batch_2faa993c395e`
  - full initial v3 suite
  - result: `9` pass, `1` fail, `4` error
  - exposed loops around busy handling, repeated product-detail requests, proof requests, pricing pushback, and gatekeeper send-info behavior
- `test_batch_44855d713763`
  - targeted rerun after the first patch set
  - individual runs showed:
    - `Too Busy Right Now` passed
    - `Material Capability Question` passed
    - `Prospect Asks What Arrow Does` passed
    - `Direct Price Question` still needed a stronger exit
    - `Gatekeeper Screens The Call` still needed a send-info path
- `test_batch_4314f2761c3f`
  - targeted rerun after the second patch set
  - individual runs showed both `Direct Price Question` and `Gatekeeper Screens The Call` passing
- `test_batch_8f907c5a8a01`
  - first full-suite rerun after the loop-handling patches
  - result: `10` pass, `2` fail, `2` error
- `test_batch_64d486551681`
  - targeted rerun after tightening the opener handoff and budget path
  - `Budget Objection` passed
  - `Direct Price Question` still needed one more qualifying-question patch
- `test_batch_12490a868bf9`
  - final targeted rerun for `Direct Price Question`
  - result: `1` pass, `0` fail, `0` error
- `test_batch_5c6cf8a74413`
  - latest full-suite rerun from the final patched flow
  - still running at snapshot time, with `6` cases already marked pass and `0` fails / `0` errors so far

## Remaining manual QA before any publish decision

- Listen through the draft in the Retell UI.
- Confirm the opener sounds like Arrow publicly.
- Confirm the company explanation stays concrete and simple.
- Confirm the caller does not pitch AI, ROI, or unsupported material claims.
- Confirm pricing only appears when asked directly.
- Confirm send-info asks for the email path first and callback time second.
- Confirm opt-out and second-decline closes happen immediately.
