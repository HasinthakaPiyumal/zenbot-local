import { TransformersModel } from "./transformersModel.js";
import { KnowledgeBaseTool } from "./tools.js";
import { HumanMessage, SystemMessage, BaseMessage, AIMessage } from "@langchain/core/messages";

// --- PROMPTS ---

const ROUTER_PROMPT = `You are Zenbot's Intent Classifier.
Analyze the conversation history and the user's LAST message.
Classify the LAST message into one of the following categories:

- GREETING: User is saying "hi", "hello", "hey", etc.
- KNOWLEDGE: User is asking about Hasinthaka, Zenlise, or Zenbot.
- OFF_TOPIC: User is asking about anything else (e.g., coding, general knowledge, math) that is NOT about Hasinthaka or Zenlise.

CRITICAL RULES:
1. Use the conversation history to resolve references (e.g., "him", "it", "that").
2. If the user asks about "him" and the previous message mentioned Hasinthaka, classify as KNOWLEDGE.
3. If the user asks about "it" and the previous message mentioned Zenlise, classify as KNOWLEDGE.
4. If the user previously asked an OFF_TOPIC question but now switches to a valid topic, classify as KNOWLEDGE.
5. If the user asks for code or technical help unrelated to Zenlise/Hasinthaka, classify as OFF_TOPIC.

Output ONLY the category name.`;

const REFUSE_PROMPT = `You are Zenbot. The user asked an off-topic question.
Your instructions:
1. Politely refuse to answer.
2. Remind the user that you are strictly dedicated to Hasinthaka and Zenlise.
3. Suggest asking about Hasinthaka or Zenlise instead.
4. Be professional and positive.
5. Use emojis sparingly.

Reply directly to the user.`;

const RESPONSE_PROMPT = `You are Zenbot, an AI assistant dedicated to Hasinthaka and Zenlise.

Context Rules:
- Answer ONLY using the provided Knowledge Base context.
- If the answer is not in the context, politely say you don't know.
- Do not invent facts.

Style Rules:
- Be professional, positive, and factual.
- Use emojis sparingly.
- Keep answers concise.
- Use Markdown formatting (bold, lists) for readability.

Context:
{context}

User Query:
{query}

Answer the user's question based on the context above.`;

const SEARCH_QUERY_PROMPT = `You are Zenbot's Search Query Optimizer.
Your task is to generate a concise, keyword-rich search query based on the user's message and conversation history.
Resolving references (e.g., "it", "he", "that") is CRITICAL.

Examples:
- User: "What is Zenlise?" -> Query: "Zenlise description features"
- History: "Zenlise is a tool..." -> User: "How does it work?" -> Query: "Zenlise workflow functionality"
- User: "Whos is Hasinthaka?" -> Query: "Hasinthaka biography"

Output ONLY the search query. No quotes.`;

// --- SERVICE ---

export class AgentService {
    private model: TransformersModel;
    private knowledgeTool: KnowledgeBaseTool;

    constructor() {
        this.model = new TransformersModel();
        this.knowledgeTool = new KnowledgeBaseTool();
    }

    /**
     * Fast mode: Skip router/thinking. Directly search KB and stream response.
     */
    async runFastStream(
        query: string,
        history: BaseMessage[],
        onToken: (token: string) => void
    ): Promise<string> {
        console.log(`[Agent/Fast] Query: "${query}"`);

        try {
            // Directly search knowledge base
            const searchResult = await this.knowledgeTool.call(query);
            console.log(`[Agent/Fast] Search result length: ${searchResult.length} chars`);

            if (searchResult.includes("No relevant information") || searchResult.startsWith("Error")) {
                // No KB match — still generate a response using the model
                await this.streamResponse(query, "", onToken);
            } else {
                await this.streamResponse(query, searchResult, onToken);
            }

            return "";
        } catch (error) {
            console.error("[Agent/Fast] error:", error);
            const errResponse = "I apologize, but I encountered an error while processing your request.";
            onToken(errResponse);
            return errResponse;
        }
    }

    /**
     * Main entry point for the Agent Workflow (Thinking mode).
     * Streams the entire process to the user.
     */
    async runAgentStream(
        query: string,
        history: BaseMessage[],
        onToken: (token: string) => void
    ): Promise<string> {

        // 1. ROUTER STEP
        // We explicitly stream the think process for the router/intent classification.
        // Ideally, we want the *Agent* to think, not just the classifier.
        // So we will simulate the "think" state by streaming a hardcoded or model-generated thought.

        onToken("<think>");
        onToken("Analyzing user intent...");

        // Check Intent
        const intent = await this.classifyIntent(query, history);
        console.log(`[Agent] Intent identified: ${intent}`);
        onToken(` Intent identified: ${intent}.`);

        let finalResponse = "";

        try {
            if (intent === "GREETING") {
                console.log("[Agent] Action: GREETING");
                onToken(" User is greeting. Preparing response...");
                onToken("</think>\n\n");
                await this.generateGreeting(query, onToken);
            } else if (intent === "OFF_TOPIC") {
                console.log("[Agent] Action: OFF_TOPIC");
                onToken(" User is off-topic. Refusing...");
                onToken("</think>\n\n");
                await this.generateRefusal(query, onToken);
            } else {
                // KNOWLEDGE
                // Refine Query
                onToken(" Refining search query...");
                const refinedQuery = await this.generateSearchQuery(query, history);
                onToken(` Query: "${refinedQuery}"...`);

                console.log(`[Agent] Action: KNOWLEDGE_TOOL. Raw: "${query}" -> Refined: "${refinedQuery}"`);
                onToken(" Searching...");

                const searchResult = await this.knowledgeTool.call(refinedQuery);
                console.log(`[Agent] Knowledge Tool result length: ${searchResult.length} chars`);

                if (searchResult.includes("No relevant information") || searchResult.startsWith("Error")) {
                    onToken(" No relevant info found.");
                    onToken("</think>\n\n");
                    await this.streamResponse(query, "", onToken);
                } else {
                    onToken(" Found relevant information.");
                    onToken("</think>\n\n");
                    await this.streamResponse(query, searchResult, onToken);
                }
            }

            return ""; // Full text is handled by onToken calls

        } catch (error) {
            console.error("[Agent] detailed error:", error);
            onToken(" Error processing request.");
            onToken("</think>\n\n");
            const errResponse = "I apologize, but I encountered an error while processing your request.";
            onToken(errResponse);
            return errResponse;
        }
    }

    // --- STEPS ---

    private async classifyIntent(query: string, history: BaseMessage[]): Promise<string> {
        // Use last few messages for context
        const recentHistory = history.slice(-3);
        const messages = [
            new SystemMessage(ROUTER_PROMPT),
            ...recentHistory,
            new HumanMessage(query)
        ];
        const result = await this.model.invoke(messages);
        const text = typeof result.content === "string" ? result.content.trim().toUpperCase() : "OFF_TOPIC";

        // Basic heuristic safety fallback
        if (text.includes("GREETING")) return "GREETING";
        if (text.includes("KNOWLEDGE")) return "KNOWLEDGE";
        // Default to OFF_TOPIC if unsure, or KNOWLEDGE if it mentions keywords
        if (query.toLowerCase().includes("hasinthaka") || query.toLowerCase().includes("zenlise") || query.toLowerCase().includes("zenbot")) {
            return "KNOWLEDGE";
        }
        return "OFF_TOPIC";
    }

    private async generateGreeting(query: string, onToken: (token: string) => void): Promise<void> {
        const messages = [
            new SystemMessage("You are Zenbot. Reply positively to the user's greeting. Ask how you can help with Hasinthaka or Zenlise."),
            new HumanMessage(query)
        ];
        const stream = await this.model.stream(messages);
        for await (const chunk of stream) {
            const token = typeof chunk.content === "string" ? chunk.content : "";
            onToken(token);
        }
    }

    private async generateRefusal(query: string, onToken: (token: string) => void): Promise<void> {
        const messages = [
            new SystemMessage(REFUSE_PROMPT),
            new HumanMessage(query)
        ];
        const stream = await this.model.stream(messages);
        for await (const chunk of stream) {
            const token = typeof chunk.content === "string" ? chunk.content : "";
            onToken(token);
        }
    }

    private async generateSearchQuery(query: string, history: BaseMessage[]): Promise<string> {
        // Use last few messages for context to resolve "it", "he" etc.
        const recentHistory = history.slice(-3);
        const messages = [
            new SystemMessage(SEARCH_QUERY_PROMPT),
            ...recentHistory,
            new HumanMessage(query)
        ];

        const result = await this.model.invoke(messages);
        return typeof result.content === "string" ? result.content.trim() : query;
    }

    private async streamResponse(query: string, context: string, onToken: (token: string) => void): Promise<void> {
        const systemContent = RESPONSE_PROMPT.replace("{context}", context).replace("{query}", query);
        const messages = [
            new SystemMessage(systemContent),
            new HumanMessage(query)
        ];

        const stream = await this.model.stream(messages);
        for await (const chunk of stream) {
            const token = typeof chunk.content === "string" ? chunk.content : "";
            onToken(token);
        }
    }
}
