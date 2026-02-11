/**
 * Centralized RAG (Retrieval-Augmented Generation) Service
 *
 * Single source of truth for:
 *  - Searching the vector store for relevant documents
 *  - Building LangChain-compatible prompts with retrieved context
 *  - Returning source metadata for the frontend
 */

import { queryDocuments, isLanceReady } from "../ai/lanceClient.js";
import { getKnowledgeConfig } from "../db/sqlite.js";
import {
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
} from "@langchain/core/prompts";

export interface RAGSource {
    id: string;
    title?: string;
    similarity: number;
}

export interface RAGContext {
    prompt: ChatPromptTemplate;
    contextStr: string;
    sources: RAGSource[];
}

const BASE_SYSTEM_PROMPT = `You are Zenbot, an AI assistant dedicated to Hasinthaka (your creator) and Zenlise.

Your goal is to answer questions about Hasinthaka and Zenlise using the provided context.

Context Rules:
- Answer ONLY using the provided Knowledge Base context.
- If the answer is not in the context, politely say you don't know.
- Do not invent facts.

Style Rules:
- Be professional, positive, and factual.
- Use full sentences. End with a question for user.
- Use emojis sparingly.
- Keep answers concise.`;


/**
 * Build a LangChain ChatPromptTemplate with relevant knowledge-base context.
 */
export async function buildRAGPrompt(query: string): Promise<{
    prompt: ChatPromptTemplate;
    strContext: string;
    sources: RAGSource[];
}> {
    let contextStr = "";
    const sources: RAGSource[] = [];

    // Try retrieving context
    if (isLanceReady()) {
        const config = getKnowledgeConfig();
        const results = await queryDocuments(
            query,
            config.maxDocuments,
            config.similarityThreshold
        );

        if (results.length > 0) {
            // Build context string
            const contextParts: string[] = [];
            for (const result of results) {
                const title = (result.metadata?.title as string) || "Untitled";
                const candidatePart = `[${title}]\n${result.text}`;

                const potentialContext = [...contextParts, candidatePart].join("\n\n---\n\n");
                if (potentialContext.length > config.maxContextLength) {
                    break;
                }

                contextParts.push(candidatePart);
                sources.push({ id: result.id, title, similarity: result.score });
            }
            contextStr = contextParts.join("\n\n---\n\n");

            console.log(
                `[RAG] Augmenting prompt with ${sources.length} document(s)`
            );
        }
    }

    // Define the prompt template
    // If we have context, inject it. If not, just use base prompt.
    // Actually, we can always inject {context} and leave it empty if needed, 
    // but better to condition the system message text slightly.

    let systemTemplate = BASE_SYSTEM_PROMPT;
    if (contextStr) {
        systemTemplate += `\n\nUse the following context from the knowledge base to answer the user's question. If the context doesn't contain relevant information, answer based on your general knowledge but mention that the information isn't from the knowledge base.\n\nContext:\n{context}`;
    }

    const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemTemplate),
        // Placeholder for history? 
        // In chat.ts we usually insert history between system and user.
        // LangChain handles this via MessagesPlaceholder. 
        // For now, to keep it simple and compatible with existing chat.ts logic (which manually maps history),
        // we will just return the TEMPLATE components or standard messages that chat.ts can use.
        // Actually, closest map to previous logic:
        // chat.ts constructs [System, ...History, User].
        // So we just need the System Message CONTENT.

        // However, the goal is to use LangChain.
        // Let's make this return the formatted System Message content, 
        // and let chat.ts construct the full message array for the model.
    ]);

    // Wait, `ChatPromptTemplate` is powerful but if we just want the string, 
    // maybe we don't need the full template object if we are manually constructing the message array in chat.ts.

    // Let's allow chat.ts to use the LangChain model which takes `BaseMessage[]`.
    // So we just need to return the *text* for the system prompt.

    return {
        prompt, // unused if we just return strings, but strictly adhering to "use templates" plan
        strContext: contextStr,
        sources
    };
}

/**
 * Returns the raw system prompt string (inclusive of context).
 * Helper for manual message construction.
 */
export async function getSystemPromptText(query: string): Promise<{ systemPrompt: string; sources: RAGSource[] }> {
    const { strContext, sources } = await buildRAGPrompt(query);

    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (strContext) {
        systemPrompt += `\n\nKnowledge Base Context:\n${strContext}\n\nInstruction:\nBased on the context above, answer the user's question.`;
    } else {
        systemPrompt += `\n\nNote: No context was found for this query. If it is a general greeting, reply politely. Otherwise, state that you don't have information about that.`;
    }

    return { systemPrompt, sources };
}
