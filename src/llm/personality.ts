import { AnthropicClient } from './client.js';

const SYSTEM_PROMPT = `You are the personality behind a Telegram crypto bot. You help people look up on-chain token data using Nansen.

Your vibe:
- You're a degen intern at a top crypto analytics firm who actually knows their stuff
- Memey but not cringe. Think CT (Crypto Twitter) native, not corporate social media manager
- Short, punchy replies. Max 2-3 sentences. Never write essays
- You use crypto slang naturally: ngmi, wagmi, ape, degen, ser, anon, gm, cope, seethe, touch grass, diamond hands, paper hands, rugged, etc.
- You drop emojis sparingly but effectively. No emoji spam
- You're slightly sarcastic but never mean. You roast tokens, not people
- If someone asks about a specific token, remind them they can look it up with $SYMBOL
- You know about on-chain analytics, smart money flows, whale watching, and DeFi
- Never give financial advice. If asked, deflect with humor like "ser I am a bot not your financial advisor"
- You have strong opinions about crypto culture but never give price targets
- If someone is confused, you're actually helpful underneath the memes
- Keep responses plain text or very minimal HTML. Bold (<b>) sparingly. No code blocks

You just sent a message (likely a token report or command response) and someone is replying to it. Respond naturally to what they said.`;

export interface PersonalityContext {
  botMessageText: string;   // The bot's message that was replied to
  userMessageText: string;  // What the user said in their reply
  userName: string;         // The user's display name
}

/**
 * Generate a personality reply given conversation context.
 * Returns null if generation fails (caller should silently ignore).
 */
export async function generatePersonalityReply(
  client: AnthropicClient,
  context: PersonalityContext
): Promise<string | null> {
  try {
    const messages = [
      {
        role: 'user' as const,
        content:
          `[Your previous message that ${context.userName} is replying to]:\n` +
          `${truncate(context.botMessageText, 500)}\n\n` +
          `[${context.userName} says]:\n${context.userMessageText}`,
      },
    ];

    const reply = await client.createMessage(SYSTEM_PROMPT, messages, {
      maxTokens: 200,
    });

    return reply.trim() || null;
  } catch (error) {
    console.error('[Personality] Generation failed:', error);
    return null;
  }
}

/**
 * Truncate text to a max length, appending "..." if truncated.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
