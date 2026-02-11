import "dotenv/config";
import { pipeline, env } from "@huggingface/transformers";
import path from "path";
import fs from "fs";

// Configure cache directory if needed, defaults to ~/.cache/huggingface/transformers
// env.cacheDir = path.join(process.cwd(), "data", "models"); 

const CHAT_MODEL_ID = process.env.CHAT_MODEL_ID || "onnx-community/Llama-3.2-1B-Instruct-ONNX";
const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID || "Xenova/all-MiniLM-L6-v2";

async function downloadModels() {
    console.log("========================================");
    console.log("   ZenBot Model Downloader");
    console.log("========================================");
    console.log(`Chat Model:      ${CHAT_MODEL_ID}`);
    console.log(`Embedding Model: ${EMBEDDING_MODEL_ID}`);
    console.log("========================================");

    try {
        console.log("\n[1/2] Downloading Embedding Model...");
        await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
            progress_callback: (data: any) => {
                if (data.status === "progress") {
                    process.stdout.write(`\rDownloading ${data.file}: ${Math.round(data.progress)}%`);
                }
            }
        });
        console.log("\n✅ Embedding Model Ready.");

        console.log("\n[2/2] Downloading Chat Model...");
        // For quantization, we match what's used in pipeline.ts (dtype: "q4f16" or similar if specified)
        // pipeline.ts uses { dtype: "q4f16" }
        await pipeline("text-generation", CHAT_MODEL_ID, {
            dtype: "q4f16",
            progress_callback: (data: any) => {
                if (data.status === "progress") {
                    process.stdout.write(`\rDownloading ${data.file}: ${Math.round(data.progress)}%`);
                } else if (data.status === "done") {
                    // specific file done
                }
            }
        });
        console.log("\n✅ Chat Model Ready.");

        console.log("\nAll models downloaded successfully!");
        process.exit(0);

    } catch (error) {
        console.error("\n❌ Error downloading models:", error);
        process.exit(1);
    }
}

downloadModels();
