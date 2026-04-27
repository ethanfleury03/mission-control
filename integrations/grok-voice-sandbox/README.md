# Grok Voice Sandbox

Quick local sandbox for testing `grok-voice-think-fast-1.0` against the current Arrow cold-calling prompt.

## What it does

- connects directly to xAI's realtime voice endpoint
- loads the Arrow cold-caller prompt from this folder
- lets you type turns in the terminal
- streams the assistant text back live
- saves assistant audio for each turn as `.wav`
- optionally auto-plays each turn on macOS with `afplay`

## Setup

1. Add your xAI API key to `.env.local`

```bash
XAI_API_KEY=your_key_here
```

2. Run the sandbox

```bash
npm run grok:voice:test
```

Optional flags:

```bash
npm run grok:voice:test -- --voice rex
npm run grok:voice:test -- --voice ara --auto-play
npm run grok:voice:test -- --verbose
```

## Commands

- `/help`
- `/scenario 1`
- `/scenario 2`
- `/quit`

## Recommended first test flow

1. `/scenario 1`
2. `/scenario 2`
3. `/scenario 3`
4. `/scenario 4`
5. `/scenario 5`

Then compare:

- latency
- tone consistency
- interruption feel
- wrong-person handling
- objection handling
- whether it loops back

## Files

- [arrow-cold-call-grok-prompt.md](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/grok-voice-sandbox/arrow-cold-call-grok-prompt.md)
- [arrow-test-scenarios.json](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/grok-voice-sandbox/arrow-test-scenarios.json)
- [output](/opt/openclaw_stack/workspace/workspace-mission-control-agent/mission-control/integrations/grok-voice-sandbox/output)
