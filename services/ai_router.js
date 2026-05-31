// services/ai_router.js
// Routes requests to Claude, GPT, or Gemini with streaming support

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Token cost per model (how many user tokens = 1 message)
const TOKEN_COST = {
  claude: 2,
  gpt: 1,
  gemini: 1,
};

/**
 * Stream AI response to Express res object (SSE)
 * @param {string} model - 'claude' | 'gpt' | 'gemini'
 * @param {Array} messages - [{role, content}]
 * @param {object} res - Express response
 */
export async function streamResponse(model, messages, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    switch (model) {
      case 'claude':
        await streamClaude(messages, res);
        break;
      case 'gpt':
        await streamGPT(messages, res);
        break;
      case 'gemini':
        await streamGemini(messages, res);
        break;
      default:
        throw new Error(`Unknown model: ${model}`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

async function streamClaude(messages, res) {
  const stream = anthropic.messages.stream({
    model: 'claude-3-haiku-20240307',
    max_tokens: 2048,
    system: 'أنت مساعد ذكي ومفيد. أجب باللغة التي يكتب بها المستخدم.',
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
    }
  }
}

async function streamGPT(messages, res) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    stream: true,
    messages: [
      { role: 'system', content: 'أنت مساعد ذكي ومفيد. أجب باللغة التي يكتب بها المستخدم.' },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }
}

async function streamGemini(messages, res) {
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Convert to Gemini format
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const lastMessage = messages[messages.length - 1].content;

  const result = await chat.sendMessageStream(lastMessage);
  for await (const chunk of result.stream) {
    const content = chunk.text();
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }
}

export { TOKEN_COST };
