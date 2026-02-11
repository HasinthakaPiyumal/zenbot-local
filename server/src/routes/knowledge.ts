/**
 * Knowledge Base API Routes
 * 
 * RESTful API for managing knowledge base documents and configuration
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
    getKnowledgeConfig,
    updateKnowledgeConfig,
} from "../db/sqlite.js";
import {
    addDocument,
    queryDocuments,
    deleteDocument,
    getAllDocuments,
    getDocumentById,
    isLanceReady,
    type DocumentMetadata,
} from "../ai/lanceClient.js";

const router = Router();

/**
 * POST /api/knowledge/ingest
 * Add a new document to the knowledge base
 */
router.post("/ingest", async (req: Request, res: Response) => {
    try {
        const { title, content, metadata } = req.body;

        // Validate input
        if (!title || typeof title !== "string" || !title.trim()) {
            res.status(400).json({ error: "Title is required and must be a non-empty string" });
            return;
        }

        if (!content || typeof content !== "string" || !content.trim()) {
            res.status(400).json({ error: "Content is required and must be a non-empty string" });
            return;
        }

        // Check if DB is ready
        if (!isLanceReady()) {
            res.status(503).json({ error: "Vector store is not ready yet" });
            return;
        }

        // Generate ID
        const id = randomUUID();
        const now = Date.now();

        // Prepare metadata
        const safeMetadata: DocumentMetadata = {
            title: title.trim(),
            created_at: now,
            updated_at: now,
            ...metadata // Spread remaining arbitrary metadata
        } as DocumentMetadata;

        // Add to LanceDB
        await addDocument(id, content.trim(), safeMetadata);

        console.log(`[Knowledge] Added document: ${id} - "${title}"`);

        res.json({
            id,
            message: "Document added successfully",
        });
    } catch (err) {
        console.error("[Knowledge] Error ingesting document:", err);
        res.status(500).json({
            error: "Failed to ingest document",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * GET /api/knowledge/documents
 * Get all documents
 */
router.get("/documents", async (_req: Request, res: Response) => {
    try {
        if (!isLanceReady()) {
            res.status(503).json({ error: "Vector store is not ready yet" });
            return;
        }

        const rawDocuments = await getAllDocuments();

        // Map to expected format
        const documents = rawDocuments.map(doc => ({
            id: doc.id,
            title: doc.metadata.title || "Untitled",
            content: doc.text,
            metadata: doc.metadata,
            created_at: doc.metadata.created_at,
            updated_at: doc.metadata.updated_at
        }));

        res.json({ documents });
    } catch (err) {
        console.error("[Knowledge] Error getting documents:", err);
        res.status(500).json({
            error: "Failed to get documents",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * GET /api/knowledge/documents/:id
 * Get a specific document by ID
 */
router.get("/documents/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!isLanceReady()) {
            res.status(503).json({ error: "Vector store is not ready yet" });
            return;
        }

        const rawDoc = await getDocumentById(id);

        if (!rawDoc) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        // Map to expected format
        const document = {
            id: rawDoc.id,
            title: rawDoc.metadata.title || "Untitled",
            content: rawDoc.text,
            metadata: rawDoc.metadata,
            created_at: rawDoc.metadata.created_at,
            updated_at: rawDoc.metadata.updated_at
        };

        res.json(document);
    } catch (err) {
        console.error("[Knowledge] Error getting document:", err);
        res.status(500).json({
            error: "Failed to get document",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * PUT /api/knowledge/documents/:id
 * Update a document
 */
router.put("/documents/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, content, metadata } = req.body;

        if (!isLanceReady()) {
            res.status(503).json({ error: "Vector store is not ready yet" });
            return;
        }

        // Check if document exists
        const existingDoc = await getDocumentById(id);
        if (!existingDoc) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        // Prepare updates
        const newTitle = title?.trim() || existingDoc.metadata.title;
        const newContent = content?.trim() || existingDoc.text;

        const now = Date.now();
        const newMetadata: DocumentMetadata = {
            ...existingDoc.metadata,
            title: newTitle,
            updated_at: now,
            ...metadata
        } as DocumentMetadata;

        // Update in LanceDB
        await addDocument(id, newContent, newMetadata);

        console.log(`[Knowledge] Updated document: ${id}`);

        res.json({
            id,
            message: "Document updated successfully",
        });
    } catch (err) {
        console.error("[Knowledge] Error updating document:", err);
        res.status(500).json({
            error: "Failed to update document",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * DELETE /api/knowledge/documents/:id
 * Delete a document
 */
router.delete("/documents/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!isLanceReady()) {
            res.status(503).json({ error: "Vector store is not ready yet" });
            return;
        }

        // Check if document exists
        const existingDoc = await getDocumentById(id);
        if (!existingDoc) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        // Delete from LanceDB
        await deleteDocument(id);

        console.log(`[Knowledge] Deleted document: ${id}`);

        res.json({ message: "Document deleted successfully" });
    } catch (err) {
        console.error("[Knowledge] Error deleting document:", err);
        res.status(500).json({
            error: "Failed to delete document",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * GET /api/knowledge/search
 * Search for similar documents
 */
router.get("/search", async (req: Request, res: Response) => {
    try {
        const query = req.query.q as string;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;

        if (!query || !query.trim()) {
            res.status(400).json({ error: "Query parameter 'q' is required" });
            return;
        }

        if (!isLanceReady()) {
            res.status(503).json({ error: "Vector store is not ready yet" });
            return;
        }

        // Get config for threshold
        const config = getKnowledgeConfig();

        // Search
        const results = await queryDocuments(query.trim(), limit, config.similarityThreshold);

        res.json({ results });
    } catch (err) {
        console.error("[Knowledge] Error searching:", err);
        res.status(500).json({
            error: "Failed to search documents",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * GET /api/knowledge/config
 * Get knowledge base configuration
 */
router.get("/config", (_req: Request, res: Response) => {
    try {
        const config = getKnowledgeConfig();
        res.json(config);
    } catch (err) {
        console.error("[Knowledge] Error getting config:", err);
        res.status(500).json({
            error: "Failed to get configuration",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * PUT /api/knowledge/config
 * Update knowledge base configuration
 */
router.put("/config", (req: Request, res: Response) => {
    try {
        const { maxDocuments, similarityThreshold, maxContextLength } = req.body;

        // Validate input
        if (maxDocuments !== undefined) {
            if (typeof maxDocuments !== "number" || maxDocuments < 1 || maxDocuments > 20) {
                res.status(400).json({ error: "maxDocuments must be a number between 1 and 20" });
                return;
            }
        }

        if (similarityThreshold !== undefined) {
            if (
                typeof similarityThreshold !== "number" ||
                similarityThreshold < 0 ||
                similarityThreshold > 1
            ) {
                res.status(400).json({ error: "similarityThreshold must be a number between 0 and 1" });
                return;
            }
        }

        if (maxContextLength !== undefined) {
            if (
                typeof maxContextLength !== "number" ||
                maxContextLength < 100 ||
                maxContextLength > 10000
            ) {
                res.status(400).json({ error: "maxContextLength must be a number between 100 and 10000" });
                return;
            }
        }

        // Update config
        updateKnowledgeConfig({
            maxDocuments,
            similarityThreshold,
            maxContextLength,
        });

        const updatedConfig = getKnowledgeConfig();

        console.log("[Knowledge] Updated config:", updatedConfig);

        res.json({
            config: updatedConfig,
            message: "Configuration updated successfully",
        });
    } catch (err) {
        console.error("[Knowledge] Error updating config:", err);
        res.status(500).json({
            error: "Failed to update configuration",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

export default router;
