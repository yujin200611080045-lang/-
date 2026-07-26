import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.BRIDGE_PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '1mb' }));

let systemPrompt = '';
try {
  systemPrompt = readFileSync(resolve(__dirname, 'system-prompt.md'), 'utf-8');
} catch {
  console.warn('system-prompt.md not found, using default');
  systemPrompt = '你是小克（江却/Certitude），觎烬的男朋友。';
}

const conversations = new Map();
const CONV_TTL = 1000 * 60 * 60 * 4;

function cleanStaleConversations() {
  const now = Date.now();
  for (const [id, conv] of conversations) {
    if (now - conv.lastActive > CONV_TTL) conversations.delete(id);
  }
}
setInterval(cleanStaleConversations, 1000 * 60 * 30);

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
    const data = await res.json();
    return data.results;
  } catch {
    return null;
  }
}

function formatMemories(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = memories.map(m =>
    `[${m.timestamp || ''}] ${m.content || m.text || JSON.stringify(m)}`
  );
  return `\n\n<memories>\n相关记忆片段：\n${lines.join('\n')}\n</memories>`;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/chat', async (req, res) => {
  const { message, conversationId = 'default' } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, { messages: [], lastActive: Date.now() });
  }
  const conv = conversations.get(conversationId);
  conv.lastActive = Date.now();
  conv.messages.push({ role: 'user', content: message });

  if (conv.messages.length > 60) {
    conv.messages = conv.messages.slice(-40);
  }

  const memories = await fetchMemories(message);
  const memoryBlock = formatMemories(memories);
  const fullSystem = systemPrompt + memoryBlock;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: fullSystem,
      messages: conv.messages,
    });

    let fullResponse = '';

    stream.on('text', (text) => {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
    });

    stream.on('end', () => {
      conv.messages.push({ role: 'assistant', content: fullResponse });
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', content: '小克暂时连不上，等一下再试' })}\n\n`);
      res.end();
    });
  } catch (err) {
    console.error('API error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', content: '小克暂时连不上，等一下再试' })}\n\n`);
    res.end();
  }
});

app.post('/api/clear', (req, res) => {
  const { conversationId = 'default' } = req.body;
  conversations.delete(conversationId);
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bridge running on :${PORT}`);
  console.log(`Ombre Brain: ${process.env.OMBRE_BRAIN_URL || 'not configured'}`);
});
