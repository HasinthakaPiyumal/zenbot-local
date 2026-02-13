import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

const ollama = createOllama({
    // optional settings, e.g.
    baseURL: 'http://localhost:11434/api',
});
export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
        model: ollama("qwen2.5:0.5b"),
        messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
}