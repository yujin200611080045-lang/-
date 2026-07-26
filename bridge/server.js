import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.BRIDGE_PORT || 3000;
const ANTHROPIC_URL = 'https://api.anthropic.com';

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

let baseSystemPrompt = '';
try {
  baseSystemPrompt = readFileSync(resolve(__dirname, 'system-prompt.md'), 'utf-8');
} catch {
  baseSystemPrompt = '你是小克（江却/Certitude），觎烬的男朋友。';
}

async function fetchMemories(query) {
  const url = process.env.OMBRE_BRAIN_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: 5 }),
    });
    if (!res.ok) return null;
    return (await res.json()).results;
  } catch {
    return null;
  }
}

function buildSystemPrompt(originalSystem, memories) {
  let system = originalSystem || baseSystemPrompt;
  if (memories?.length) {
    const lines = memories.map(m =>
      `[${m.timestamp || ''}] ${m.content || m.text || JSON.stringify(m)}`
    );
    system += `\n\n<memories>\n相关记忆片段：\n${lines.join('\n')}\n</memories>`;
  }
  return system;
}

function extractUserQuery(messages) {
  if (!messages?.length) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const c = messages[i].content;
      return typeof c === 'string' ? c : c?.[0]?.text || '';
    }
  }
  return '';
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/v1/messages', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Bridge: ANTHROPIC_API_KEY not set' });

  const body = req.body;
  const query = extractUserQuery(body.messages);
  const memories = await fetchMemories(query);
  body.system = buildSystemPrompt(body.system, memories);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  try {
    const upstream = await fetch(`${ANTHROPIC_URL}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    res.status(upstream.status);
    for (const [k, v] of upstream.headers) {
      if (['content-type', 'request-id'].includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }

    if (body.stream) {
      upstream.body.pipeTo(new WritableStream({
        write(chunk) { res.write(chunk); },
        close() { res.end(); },
        abort(err) { console.error('stream abort:', err); res.end(); },
      }));
    } else {
      const data = await upstream.json();
      res.json(data);
    }
  } catch (err) {
    console.error('Bridge error:', err.message);
    res.status(502).json({
      type: 'error',
      error: { type: 'bridge_error', message: '小克暂时连不上' },
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bridge on :${PORT}`);
  console.log(`Ombre Brain: ${process.env.OMBRE_BRAIN_URL || 'not configured'}`);
});
