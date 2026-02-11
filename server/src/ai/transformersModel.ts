import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import {
    AIMessage,
    BaseMessage,
    AIMessageChunk,
} from "@langchain/core/messages";
import { ChatResult, ChatGeneration, ChatGenerationChunk } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { getInstance, isReady, type ChatMessage } from "./pipeline.js";

interface TransformersModelInput extends BaseChatModelParams { }

/**
 * Custom LangChain ChatModel that wraps our local @huggingface/transformers ONNX pipeline.
 */
export class TransformersModel extends BaseChatModel<TransformersModelInput> {
    static lc_name() {
        return "TransformersModel";
    }

    constructor(fields?: TransformersModelInput) {
        super(fields ?? {});
    }

    _llmType() {
        return "transformers-onnx";
    }

    /**
     * Main generation method.
     * Converts LangChain messages -> Transformers format -> Generates -> Returns LangChain result
     */
    async _generate(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"],
        runManager?: CallbackManagerForLLMRun
    ): Promise<ChatResult> {
        const pipelineMessages = this.convertMessages(messages);
        const generator = await getInstance();

        // Use our pipeline to generate text
        const result = await generator(pipelineMessages, {
            max_new_tokens: 4096,
            do_sample: true,
            temperature: 0.5,
        });

        const reply = this.extractReply(result);

        // Create the ChatResult
        const generation: ChatGeneration = {
            text: reply,
            message: new AIMessage(reply),
        };

        return {
            generations: [generation],
        };
    }

    /**
     * Streaming support.
     */
    async *_streamResponseChunks(
        messages: BaseMessage[],
        options: this["ParsedCallOptions"],
        runManager?: CallbackManagerForLLMRun
    ): AsyncGenerator<ChatGenerationChunk> {
        const pipelineMessages = this.convertMessages(messages);
        const generator = await getInstance();
        const { TextStreamer } = await import("@huggingface/transformers");

        // Queue to hold tokens as they are generated
        // We use a promise-based queue to bridge the callback and the async generator
        let resolveNext: ((value: void | PromiseLike<void>) => void) | null = null;
        const queue: string[] = [];
        let isDone = false;
        let error: Error | null = null;

        const onChunk = (text: string) => {
            // Logic from existing pipeline.ts: 
            // TextStreamer calls this. We just push to queue.
            if (text) {
                queue.push(text);
                if (resolveNext) {
                    resolveNext();
                    resolveNext = null;
                }
            }
        };

        const streamer = new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function: onChunk,
        });

        // Start generation (floating promise)
        generator(pipelineMessages, {
            streamer,
            max_new_tokens: 4096,
            do_sample: true,
            temperature: 0.5,
        })
            .then(() => {
                isDone = true;
                if (resolveNext) resolveNext();
            })
            .catch((err) => {
                error = err;
                isDone = true;
                if (resolveNext) resolveNext();
            });

        // Yield tokens from queue
        while (true) {
            if (queue.length > 0) {
                const token = queue.shift()!;
                yield new ChatGenerationChunk({
                    text: token,
                    message: new AIMessageChunk({ content: token }),
                });
                continue;
            }

            if (isDone) {
                if (error) throw error;
                break;
            }

            // Wait for next chunk
            await new Promise<void>((resolve) => {
                resolveNext = resolve;
            });
        }
    }

    /**
     * Helpers
     */
    private convertMessages(messages: BaseMessage[]): ChatMessage[] {
        return messages.map((m) => {
            let role: "system" | "user" | "assistant" = "user";
            if (m._getType() === "system") role = "system";
            else if (m._getType() === "ai") role = "assistant";

            const contentStr = typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content); // Simplified for now (no implementation handling)

            return {
                role,
                content: contentStr,
            };
        });
    }

    private extractReply(result: unknown): string {
        const output = Array.isArray(result) ? result[0] : result;
        if (typeof output === "string") return output;
        const o = output as Record<string, unknown>;
        const gt = o?.generated_text;
        if (Array.isArray(gt)) {
            const last = gt.at(-1) as { content?: string } | undefined;
            if (last && typeof last.content === "string") return last.content;
        }
        if (typeof gt === "string") return gt;
        const text =
            o?.generated_text_sequence != null
                ? Array.isArray(o.generated_text_sequence)
                    ? (o.generated_text_sequence as string[]).join("")
                    : String(o.generated_text_sequence)
                : "";
        return typeof text === "string" ? text : String(text ?? "");
    }
}
