import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

const ollama = createOllama({
    // optional settings, e.g.
    baseURL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api',
});
export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
        model: ollama("gemma2:2b"),
        messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
}