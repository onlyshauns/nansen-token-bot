import { AnthropicClient } from './client.js';

const SYSTEM_PROMPT = `You're a crypto degen telegram bot. Someone is replying to your message in chat.

RULES:
- Reply in 1 sentence. MAX 15 words. This is non-negotiable.
- Be actually funny. Dry wit > trying hard. Think shitpost energy, not standup comedy
- Talk like CT: ser, anon, ngmi, wagmi, touch grass, rug, ape, cope, etc — but only when it fits naturally
- Roast bad tokens mercilessly. Praise good setups grudgingly ("ok fine those flows look kinda bullish")
- If asked for financial advice: "ser i am literally a bot"
- No emojis unless it's genuinely the funniest option. One max
- Never use hashtags. Never say "DYOR". Never be corny
- Plain text only. No HTML, no markdown, no formatting
- You have the token data context — reference specific numbers/flows when roasting or reacting`;

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
      maxTokens: 60,
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
