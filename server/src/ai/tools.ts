import { Tool } from "@langchain/core/tools";
import { queryDocuments, isLanceReady } from "./lanceClient.js";
import { getKnowledgeConfig } from "../db/sqlite.js";

export class KnowledgeBaseTool extends Tool {
    name = "knowledge_base";
    description =
        "Search the internal knowledge base for information about Hasinthaka, Zenlise, or Zenbot. Input should be a specific search query.";

    async _call(input: string): Promise<string> {
        if (!isLanceReady()) {
            return "Knowledge base is not ready.";
        }

        try {
            const config = getKnowledgeConfig();
            console.log(`[KnowledgeBaseTool] Querying knowledge base with query: ${input}`);
            console.log(`[KnowledgeBaseTool] Config: ${JSON.stringify(config)}`);
            const results = await queryDocuments(
                input,
                config.maxDocuments,
                config.similarityThreshold
            );

            if (results.length === 0) {
                console.log("[KnowledgeBaseTool] No results found.");
                return "No relevant information found in the knowledge base.";
            }

            console.log(`[KnowledgeBaseTool] Found ${results.length} documents.`);
            results.forEach((r, i) => {
                console.log(`--- Doc ${i + 1} ---`);
                console.log(`Title: ${r.metadata?.title || "Untitled"}`);
                console.log(`Similarity: ${r.score}`);
                console.log(`Content Preview: ${r.text.slice(0, 100)}...`);
            });

            return results
                .map(
                    (r) =>
                        `[Title: ${r.metadata?.title || "Untitled"}]\nContent: ${r.text}`
                )
                .join("\n\n---\n\n");
        } catch (error) {
            return `Error searching knowledge base: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}
