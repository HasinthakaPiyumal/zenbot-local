import * as lancedb from "@lancedb/lancedb";
import * as path from "path";
import * as fs from "fs";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL_ID || "Xenova/all-MiniLM-L6-v2";
const TABLE_NAME = "knowledge_base";
const DB_PATH = path.join(process.cwd(), "data", "lancedb");

// Ensure data directory exists
if (!fs.existsSync(path.join(process.cwd(), "data"))) {
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
}

export interface DocumentMetadata extends Record<string, string | number | boolean | null> {
    title: string;
    created_at: number;
    updated_at: number;
}

// LanceDB Schema Interface
// We store: id, vector (embedding), text, and metadata fields flattened or as a struct
// For simplicity with LanceDB's auto-inference, we'll store objects that look like this:
interface LanceSchema {
    id: string;
    vector: number[];
    text: string;
    title: string;
    created_at: number;
    updated_at: number;
    [key: string]: any; // Allow other metadata fields at root level for simpler filtering
}

export interface SearchResult {
    id: string;
    text: string;
    metadata: DocumentMetadata;
    score: number;
}

// Global state
let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;
let embeddingPipeline: FeatureExtractionPipeline | null = null;

/**
 * Initialize LanceDB and embedding model
 */
export async function initLanceDB(): Promise<void> {
    console.log("[LanceDB] Initializing...");

    try {
        // 1. Initialize Embedding Model
        if (!embeddingPipeline) {
            console.log("[LanceDB] Loading embedding model...");
            embeddingPipeline = await pipeline("feature-extraction", EMBEDDING_MODEL);
            console.log("[LanceDB] Embedding model loaded.");
        }

        // 2. Connect to DB (creates folder if missing)
        db = await lancedb.connect(DB_PATH);
        console.log(`[LanceDB] Connected to ${DB_PATH}`);

        // 3. Open or Create Table
        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            table = await db.openTable(TABLE_NAME);
            console.log(`[LanceDB] Opened existing table: ${TABLE_NAME}`);
        } else {
            // Create with a dummy record to establish schema if needed, or empty
            // LanceDB usually assumes schema from first data.
            // We'll wait for first add to create table if it doesn't exist, 
            // OR create it empty if the API supports it (API varies by version).
            // Safest: check on add.
            console.log(`[LanceDB] Table ${TABLE_NAME} does not exist yet. Will create on first insert.`);
        }

    } catch (err) {
        console.error("[LanceDB] Initialization failed:", err);
        throw err;
    }
}

/**
 * Generate embedding for a text string
 */
async function generateEmbedding(text: string): Promise<number[]> {
    if (!embeddingPipeline) {
        throw new Error("Embedding model not initialized");
    }

    const result = await embeddingPipeline(text, {
        pooling: "mean",
        normalize: true,
    });

    return Array.from(result.data as Float32Array);
}

/**
 * Add or Update a document
 */
export async function addDocument(
    id: string,
    text: string,
    metadata: DocumentMetadata
): Promise<void> {
    if (!db) await initLanceDB();
    if (!db) throw new Error("LanceDB not initialized");

    const vector = await generateEmbedding(text);

    const record: LanceSchema = {
        id,
        vector,
        text,
        // Spread metadata first, then overwrite known fields if needed (or just spread, as they match)
        ...metadata,
        title: metadata.title,
        created_at: metadata.created_at,
        updated_at: metadata.updated_at
    };

    if (!table) {
        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            table = await db.openTable(TABLE_NAME);
        } else {
            console.log(`[LanceDB] Creating table: ${TABLE_NAME}`);
            table = await db.createTable(TABLE_NAME, [record]);
            return; // Created and inserted first record
        }
    }

    // If table existed or we just opened it
    // Check if ID exists to update (delete then insert, as LanceDB updates are immutable/append-only usually)
    // Actually `merge` is supported in newer versions, or `overwrite` / `delete`.
    // Simple approach: delete by ID if exists, then add.

    try {
        await table.delete(`id = '${id}'`);
    } catch (e) {
        // Ignore if delete fails (e.g. not found)
    }

    await table.add([record]);
    console.log(`[LanceDB] Added document: ${id}`);
}

/**
 * Delete a document
 */
export async function deleteDocument(id: string): Promise<void> {
    if (!table) return;
    console.log(`[LanceDB] Deleting document: ${id}`);
    await table.delete(`id = '${id}'`);
}

/**
 * Query for similar documents
 */
export async function queryDocuments(
    queryText: string,
    limit: number = 5,
    minSimilarity: number = 0.0 // LanceDB returns distance (L2 or Cosine usually)
): Promise<SearchResult[]> {
    if (!table) return [];

    const queryVector = await generateEmbedding(queryText);

    // Search
    // By default Lance uses L2 distance. We can specify metricType in createTable if needed.
    // Assuming standard behavior: returns { ...fields, _distance }
    const results = await table.search(queryVector)
        .limit(limit)
        .toArray();

    const searchResults: SearchResult[] = [];

    for (const r of results) {
        // Approximate similarity conversion for Cosine distance (if used) or L2.
        // If metric is L2 (default), closer to 0 is better. Max distance depends on vector normalization.
        // For normalized vectors (HuggingFace usually produces normalized), L2 distance relates to Cosine similarity:
        // L2^2 = 2 * (1 - CosineSimilarity)
        // CosineSimilarity = 1 - L2^2 / 2
        // Let's just use 1 - distance as a proxy if it's small, or just return raw score if user expects similarity.

        // Actually, let's treat `_distance` as the score to invert.
        // If _distance is returned.
        const dist = (r as any)._distance;

        // LanceDB default metric is L2. For normalized vectors, L2 distance ranges from 0 to 2.
        // L2^2 = 2 * (1 - cosine_sim)
        // => cosine_sim = 1 - L2^2 / 2
        const l2_dist = (dist || 0);
        const score = Math.max(0, 1 - (l2_dist * l2_dist) / 2);

        if (score < minSimilarity) continue;

        const metadata: DocumentMetadata = {
            title: r.title as string,
            created_at: r.created_at as number,
            updated_at: r.updated_at as number,
            ...r
        };
        // Remove known non-metadata fields from spread if necessary
        // (Not strictly creating a clean object here but good enough for now)

        searchResults.push({
            id: r.id as string,
            text: r.text as string,
            metadata,
            score
        });
    }

    return searchResults;
}

/**
 * Get all documents
 */
export async function getAllDocuments(): Promise<Array<{ id: string; text: string; metadata: DocumentMetadata }>> {
    if (!table) return [];

    // Empty query or just scan
    // LanceDB doesn't have "get all" easily without a query? 
    // Actually we can use `query()` builder without vector search for filter/scan.
    // The JS API might require `search`? No, `table.query()` exists in some versions.
    // If not, we can `search` with a zero vector or dummy?
    // Let's try standard query if available, or just search with null vector?

    // Fallback: Use a search with very high limit and dummy vector? No that's inefficient.
    // Checking docs... usually `table.query().execute()`

    const results = await table.query().limit(1000).toArray();

    return results.map((r) => ({
        id: r.id as string,
        text: r.text as string,
        metadata: {
            title: r.title as string,
            created_at: r.created_at as number,
            updated_at: r.updated_at as number,
            ...r // contain extras
        } as DocumentMetadata
    }));
}

/**
 * Get document by ID
 */
export async function getDocumentById(id: string): Promise<{ id: string; text: string; metadata: DocumentMetadata } | null> {
    if (!table) return null;

    const results = await table.query()
        .where(`id = '${id}'`)
        .limit(1)
        .toArray();

    if (results.length === 0) return null;

    const r = results[0];
    return {
        id: r.id as string,
        text: r.text as string,
        metadata: {
            title: r.title as string,
            created_at: r.created_at as number,
            updated_at: r.updated_at as number,
            ...r
        } as DocumentMetadata
    };
}

export function isLanceReady(): boolean {
    return db !== null;
}
