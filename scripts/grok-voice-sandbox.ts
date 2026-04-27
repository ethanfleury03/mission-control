import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

type Options = {
  model: string;
  voice: string;
  promptFile: string;
  scenariosFile: string;
  audioDir: string;
  autoPlay: boolean;
  verbose: boolean;
};

type Scenario = {
  id: string;
  name: string;
  prompt: string;
};

type RealtimeEvent = {
  type?: string;
  delta?: string;
  text?: string;
  transcript?: string;
  response?: { status?: string };
  error?: { message?: string };
  [key: string]: unknown;
};

const DEFAULT_OPTIONS: Options = {
  model: 'grok-voice-think-fast-1.0',
  voice: 'rex',
  promptFile: path.resolve('integrations/grok-voice-sandbox/arrow-cold-call-grok-prompt.md'),
  scenariosFile: path.resolve('integrations/grok-voice-sandbox/arrow-test-scenarios.json'),
  audioDir: path.resolve('integrations/grok-voice-sandbox/output'),
  autoPlay: false,
  verbose: false,
};

function parseArgs(argv: string[]): Options {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--model' && next) {
      options.model = next;
      i += 1;
    } else if (arg === '--voice' && next) {
      options.voice = next;
      i += 1;
    } else if (arg === '--prompt-file' && next) {
      options.promptFile = path.resolve(next);
      i += 1;
    } else if (arg === '--scenarios-file' && next) {
      options.scenariosFile = path.resolve(next);
      i += 1;
    } else if (arg === '--audio-dir' && next) {
      options.audioDir = path.resolve(next);
      i += 1;
    } else if (arg === '--auto-play') {
      options.autoPlay = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    }
  }

  return options;
}

function printHelpAndExit(): never {
  console.log(`Grok Voice Sandbox

Usage:
  npx tsx scripts/grok-voice-sandbox.ts [options]

Options:
  --model <name>          Voice model (default: grok-voice-think-fast-1.0)
  --voice <name>          Voice id (default: rex)
  --prompt-file <path>    Prompt markdown file
  --scenarios-file <path> Scenario JSON file
  --audio-dir <path>      Directory for saved wav files
  --auto-play             Auto-play assistant audio if afplay is available
  --verbose               Print raw event types as they arrive
  -h, --help              Show this help
`);
  process.exit(0);
}

async function maybeLoadEnvFiles() {
  if (process.env.XAI_API_KEY) return;

  for (const envPath of ['.env.local', '.env']) {
    try {
      const raw = await fs.readFile(path.resolve(envPath), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      // ignore missing env files
    }
  }
}

async function loadPrompt(promptFile: string) {
  return fs.readFile(promptFile, 'utf8');
}

async function loadScenarios(scenariosFile: string): Promise<Scenario[]> {
  const raw = await fs.readFile(scenariosFile, 'utf8');
  return JSON.parse(raw) as Scenario[];
}

function pcm16ToWav(pcmData: Buffer, sampleRate = 24000, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

async function saveAudioTurn(audioDir: string, turn: number, audioChunks: Buffer[]) {
  if (audioChunks.length === 0) return null;
  await fs.mkdir(audioDir, { recursive: true });
  const pcm = Buffer.concat(audioChunks);
  const wav = pcm16ToWav(pcm);
  const filename = path.join(audioDir, `turn-${String(turn).padStart(2, '0')}.wav`);
  await fs.writeFile(filename, wav);
  return filename;
}

async function maybeAutoPlay(filePath: string | null, autoPlay: boolean) {
  if (!filePath || !autoPlay) return;
  if (process.platform !== 'darwin') return;
  await new Promise<void>((resolve) => {
    const child = spawn('afplay', [filePath], { stdio: 'ignore' });
    child.on('error', () => resolve());
    child.on('exit', () => resolve());
  });
}

function printScenarios(scenarios: Scenario[]) {
  console.log('\nSaved test scenarios:');
  for (const scenario of scenarios) {
    console.log(`  /scenario ${scenario.id}  ${scenario.name}`);
  }
  console.log('');
}

function createSessionPayload(options: Options, prompt: string) {
  return {
    type: 'session.update',
    session: {
      voice: options.voice,
      instructions: prompt,
      turn_detection: { type: 'server_vad' },
    },
  };
}

async function sendUserTurn(ws: WebSocket, text: string) {
  ws.send(
    JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }),
  );
  ws.send(JSON.stringify({ type: 'response.create' }));
}

async function waitForAssistantTurn(ws: WebSocket, options: Options, turn: number) {
  let assistantText = '';
  const audioChunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const raw =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : Array.isArray(data)
              ? Buffer.concat(data).toString('utf8')
              : data instanceof ArrayBuffer
                ? Buffer.from(data).toString('utf8')
                : Buffer.from(data as ArrayBufferLike).toString('utf8');
      const event = JSON.parse(raw) as RealtimeEvent;

      if (options.verbose && event.type) {
        console.log(`\n[event] ${event.type}`);
      }

      if (event.type === 'response.text.delta' || event.type === 'response.output_text.delta') {
        const delta = typeof event.delta === 'string' ? event.delta : '';
        assistantText += delta;
        process.stdout.write(delta);
        return;
      }

      if (
        (event.type === 'response.audio_transcript.delta' || event.type === 'response.output_audio_transcript.delta') &&
        typeof event.delta === 'string'
      ) {
        assistantText += event.delta;
        process.stdout.write(event.delta);
        return;
      }

      if (
        (event.type === 'response.audio_transcript.done' || event.type === 'response.output_audio_transcript.done') &&
        typeof event.transcript === 'string' &&
        !assistantText
      ) {
        assistantText = event.transcript;
        process.stdout.write(event.transcript);
        return;
      }

      if (event.type === 'response.output_audio.delta' && typeof event.delta === 'string') {
        audioChunks.push(Buffer.from(event.delta, 'base64'));
        return;
      }

      if (event.type === 'error') {
        ws.off('message', onMessage);
        reject(new Error(event.error?.message || 'Unknown realtime error'));
        return;
      }

      if (event.type === 'response.done') {
        ws.off('message', onMessage);
        resolve();
      }
    };

    ws.on('message', onMessage);
  });

  process.stdout.write('\n');
  const savedAudio = await saveAudioTurn(options.audioDir, turn, audioChunks);
  await maybeAutoPlay(savedAudio, options.autoPlay);

  return { assistantText: assistantText.trim(), savedAudio };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await maybeLoadEnvFiles();

  if (!process.env.XAI_API_KEY) {
    throw new Error('Missing XAI_API_KEY. Add it to .env.local or export it in your shell.');
  }

  const prompt = await loadPrompt(options.promptFile);
  const scenarios = await loadScenarios(options.scenariosFile);

  console.log('Grok Voice Sandbox');
  console.log(`Model: ${options.model}`);
  console.log(`Voice: ${options.voice}`);
  console.log(`Prompt: ${options.promptFile}`);
  console.log(`Audio output: ${options.audioDir}`);
  console.log('');
  console.log('Commands: /help, /scenario <id>, /quit');
  printScenarios(scenarios);

  const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(options.model)}`, {
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    } as Record<string, string>,
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', () => reject(new Error('Failed to connect to xAI realtime endpoint.')));
  });

  ws.send(JSON.stringify(createSessionPayload(options, prompt)));

  const rl = readline.createInterface({ input, output });
  let turn = 1;

  try {
    while (true) {
      const line = (await rl.question('you> ')).trim();
      if (!line) continue;

      if (line === '/quit' || line === '/exit') break;

      if (line === '/help') {
        console.log('Type normal text to send a turn.');
        console.log('Use /scenario <id> to paste a saved test scenario.');
        console.log('Use /quit to exit.');
        continue;
      }

      let text = line;
      if (line.startsWith('/scenario ')) {
        const id = line.replace('/scenario ', '').trim();
        const scenario = scenarios.find((item) => item.id === id);
        if (!scenario) {
          console.log(`No scenario found for id "${id}".`);
          continue;
        }
        text = scenario.prompt;
        console.log(`\n[scenario] ${scenario.name}`);
        console.log(text);
      }

      await sendUserTurn(ws, text);
      process.stdout.write('agent> ');
      const result = await waitForAssistantTurn(ws, options, turn);
      if (result.savedAudio) {
        console.log(`[saved audio] ${result.savedAudio}`);
      }
      turn += 1;
    }
  } finally {
    rl.close();
    ws.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
