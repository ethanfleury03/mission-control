# Arrow Systems Conversation Flow V2

This document captures the rebuilt Retell conversation-flow demo created on April 20, 2026 for internal boss-facing evaluation.

## Live object IDs

- Recommended demo agent: `agent_116dfdec8727eb1da6d5d3d8a3`
- Conversation flow: `conversation_flow_942dd6bbaf78`
- Legacy prompt agent: `agent_6c8d946ce386930457d2e72aa9`
- Legacy prompt LLM: `llm_b146b8861db8f3961ee1e2b97a2c`

## Important Retell limitation

- The original agent could not be converted in place because Retell rejected the response-engine swap with: `Cannot update response engine of agent version > 0`.
- Because of that, the v2 rebuild lives as a new voice agent instead of reusing the old agent ID.

## Goal

- Keep the experience fully mocked for internal review.
- Sound like a real rep from Arrow Systems instead of a generic AI caller.
- Establish relevance before asking for time.
- Use curated KB content from `arrsys.com` for product and industry answers.
- Keep scheduling deterministic with five fixed demo slots only.

## Dynamic variable contract

All values are strings.

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

## Knowledge base layout

### KB 1: Arrow Company ICP

- ID: `knowledge_base_ade786b454005132`
- Purpose: company explanation, high-level fit, qualification, value framing
- Attached to: `start_intro`, `discovery_current_state`, `value_bridge`, `meeting_ask`, `gatekeeper`, `call_screening`

### KB 2: Arrow Products

- ID: `knowledge_base_0526c2e496fbed0c`
- Purpose: concrete product and category answers
- Attached to: `product_question`

### KB 3: Arrow Industries

- ID: `knowledge_base_7c1416f760cdb54a`
- Purpose: relevance examples, industry fit, objection support
- Attached to: `already_have_solution`, `not_sure_relevance`, `industry_question`

## Main path

### 1. Opening and qualification

- `start_intro`
  - reason-for-call opener
  - right-person check
  - no meeting ask yet
- `discovery_current_state`
  - one binary question about outsource vs in-house or known pain
- `value_bridge`
  - short reflection
  - one concrete value point based on the current state
- `meeting_ask`
  - only asks for a 15-minute call after relevance exists

### 2. Mock scheduling

- `offer_slots_round_1`
  - Tuesday 11:00 AM ET
  - Wednesday 2:00 PM ET
- `offer_slots_round_2`
  - Thursday 10:30 AM ET
  - Friday 1:30 PM ET
- `offer_slots_round_3`
  - Monday 3:00 PM ET
- Confirmations are implemented as slot-specific end nodes to keep the mock deterministic:
  - `confirm_tuesday_11`
  - `confirm_wednesday_2`
  - `confirm_thursday_1030`
  - `confirm_friday_130`
  - `confirm_monday_3`

## Global nodes

- `ai_disclosure`
  - honest AI disclosure only when asked
- `wrong_person`
  - asks once for the right contact path, then closes
- `gatekeeper`
  - one-sentence reason for call plus routing ask
- `call_screening`
  - short answer for “who is this / what is this regarding”
- `busy_not_now`
  - acknowledges timing and moves straight to fixed slot options
- `send_info`
  - agrees to send material, then tries to hold a fixed demo time
- `already_have_solution`
  - low-pressure fit check for current vendor/equipment objections
- `not_sure_relevance`
  - one short industry-specific example, then fit check
- `first_decline_soft_close`
  - one final low-pressure attempt
- `second_decline_close`
  - exact two-no close: `Understood — I won't keep pushing. Thanks for your time, have a good rest of your day.`
- `remove_me`
  - brief apology and immediate end
- `voicemail`
  - revised printing-equipment voicemail script
- `product_question`
  - KB-backed concrete answer about machines/categories
- `industry_question`
  - KB-backed industry fit answer

## Voice tuning

- Voice: `11labs-Adrian`
- Voice model: `eleven_turbo_v2`
- `voice_speed=0.94`
- `responsiveness=0.62`
- `interruption_sensitivity=0.45`
- `enable_dynamic_voice_speed=true`
- `enable_dynamic_responsiveness=false`
- `enable_backchannel=true`
- `backchannel_frequency=0.25`
- `backchannel_words=["right","got it","mm-hmm"]`
- `begin_message_delay_ms=900`
- `normalize_for_speech=true`

Pronunciation dictionary added for:

- Arrow Systems
- ArrowJet
- Anytron
- Aries
- Taurus
- Nova
- EZCut
- BOPP
- Tyvek
- Mylar
- Limitronic
- Gerber

Boosted keywords were also added for the same product and brand terms to help recognition.

## Saved test suite

- `test_case_54364fdc90ba` - Qualified prospect books a slot
- `test_case_1cc105f07c8b` - Busy prospect accepts callback slot
- `test_case_894948dbe70c` - Prospect asks what Arrow Systems sells
- `test_case_0a2b966510dc` - Prospect asks if caller is AI
- `test_case_760f8529f3eb` - Wrong person and gatekeeper
- `test_case_9cb80e8c7200` - Prospect already has vendor
- `test_case_f18110936b96` - Prospect asks for email info
- `test_case_b181016b0f08` - Prospect asks product question
- `test_case_4f20e11ea04f` - Prospect asks industry fit question
- `test_case_1df5923dd4c5` - Voicemail detection

Batch test run:

- `test_batch_4acdb38dabe5`
- Status: `complete`
- Result: `8` pass, `1` fail, `1` error

Follow-up rerun after patching the flow:

- `test_batch_0f9d0c9b81b8`
- Status: `complete`
- Result: `2` pass, `0` fail, `0` error
- AI disclosure now passes after the wording change to `I'm an AI assistant with Arrow Systems.`
- Product-question routing also passes after the forward-routing patch from `product_question` into `discovery_current_state`.

## Remaining manual QA before publish

- Listen through the 10 saved scenarios in the Retell UI.
- Compare the new v2 flow against the older prompt-based agent if desired.
- Verify the first line sounds like a real rep, not a mission-statement bot.
- Verify the agent never offers times before discovery except in the explicit busy or send-info objection branches.
- Verify the product and industry answers sound concrete and grounded in Arrow Systems equipment.
- Verify disclosure, opt-out, voicemail, and second-decline endings happen immediately and cleanly.
