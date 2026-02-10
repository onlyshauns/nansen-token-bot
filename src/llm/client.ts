/**
 * Minimal Anthropic Claude client using native fetch().
 * No SDK dependency — matches the project's fetch-based HTTP pattern.
 */

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: AnthropicMessage[];
}

interface AnthropicResponse {
  content: Array<{ type: 'text'; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicClient {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createMessage(
    systemPrompt: string,
    messages: AnthropicMessage[],
    opts: { model?: string; maxTokens?: number } = {}
  ): Promise<string> {
    const model = opts.model || 'claude-3-5-haiku-latest';
    const maxTokens = opts.maxTokens || 150;

    const body: AnthropicRequest = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    };

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(`Anthropic API ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const textBlock = data.content.find((c) => c.type === 'text');
    return textBlock?.text || '';
  }
}
