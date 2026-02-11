import { useState, useEffect } from "react";
import {
  getKnowledgeDocuments,
  ingestDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  searchKnowledgeDocuments,
  getKnowledgeConfig,
  updateKnowledgeConfig,
  type KnowledgeDocument,
  type KnowledgeConfig,
  type SearchResult,
} from "../api";
import "./KnowledgeBase.css";

export function KnowledgeBase() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [config, setConfig] = useState<KnowledgeConfig>({
    maxDocuments: 3,
    similarityThreshold: 0.7,
    maxContextLength: 2000,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Add form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  
  // Edit modal state
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Filter state
  const [filter, setFilter] = useState("");

  useEffect(() => {
    loadDocuments();
    loadConfig();
  }, []);

  const loadDocuments = async () => {
    try {
      const docs = await getKnowledgeDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    }
  };

  const loadConfig = async () => {
    try {
      const cfg = await getKnowledgeConfig();
      setConfig(cfg);
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await ingestDocument({ title: title.trim(), content: content.trim() });
      setSuccess("Document added successfully!");
      setTitle("");
      setContent("");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add document");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await deleteKnowledgeDocument(id);
      setSuccess("Document deleted successfully!");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (doc: KnowledgeDocument) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content);
  };

  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await updateKnowledgeDocument(editingDoc.id, {
        title: editTitle.trim(),
        content: editContent.trim(),
      });
      setSuccess("Document updated successfully!");
      setEditingDoc(null);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update document");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError("");

    try {
      const results = await searchKnowledgeDocuments(searchQuery.trim(), 10);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search documents");
    } finally {
      setSearching(false);
    }
  };

  const handleConfigUpdate = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await updateKnowledgeConfig(config);
      setConfig(result.config);
      setSuccess("Configuration updated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update config");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(filter.toLowerCase()) ||
      doc.content.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="knowledge-base">
      <h2 className="knowledge-base__title">Knowledge Base Management</h2>

      {error && <div className="knowledge-base__error">{error}</div>}
      {success && <div className="knowledge-base__success">{success}</div>}

      <div className="knowledge-base__grid">
        {/* Add Document Form */}
        <section className="knowledge-base__section">
          <h3>Add Document</h3>
          <form onSubmit={handleAddDocument} className="knowledge-base__form">
            <div className="form-group">
              <label htmlFor="title">Title *</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="content">Content *</label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Document content"
                rows={6}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn--primary">
              {loading ? "Adding..." : "Add Document"}
            </button>
          </form>
        </section>

        {/* Configuration Panel */}
        <section className="knowledge-base__section">
          <h3>Configuration</h3>
          <div className="config-panel">
            <div className="form-group">
              <label htmlFor="maxDocs">
                Max Documents: {config.maxDocuments}
              </label>
              <input
                id="maxDocs"
                type="range"
                min="1"
                max="10"
                value={config.maxDocuments}
                onChange={(e) =>
                  setConfig({ ...config, maxDocuments: parseInt(e.target.value) })
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="threshold">
                Similarity Threshold: {config.similarityThreshold.toFixed(2)}
              </label>
              <input
                id="threshold"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.similarityThreshold}
                onChange={(e) =>
                  setConfig({ ...config, similarityThreshold: parseFloat(e.target.value) })
                }
              />
            </div>
            <div className="form-group">
              <label htmlFor="maxContext">Max Context Length</label>
              <input
                id="maxContext"
                type="number"
                min="500"
                max="5000"
                step="100"
                value={config.maxContextLength}
                onChange={(e) =>
                  setConfig({ ...config, maxContextLength: parseInt(e.target.value) })
                }
              />
            </div>
            <button onClick={handleConfigUpdate} disabled={loading} className="btn btn--primary">
              Save Configuration
            </button>
          </div>
        </section>
      </div>

      {/* Search Test */}
      <section className="knowledge-base__section">
        <h3>Test Search</h3>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search query..."
          />
          <button type="submit" disabled={searching} className="btn">
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
        {searchResults.length > 0 && (
          <div className="search-results">
            <h4>Results:</h4>
            {searchResults.map((result) => (
              <div key={result.id} className="search-result">
                <div className="search-result__header">
                  <strong>{(result.metadata?.title as string) || "Untitled"}</strong>
                  <span className="similarity-badge">
                    {(result.similarity * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="search-result__content">
                  {result.text.substring(0, 150)}...
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Documents List */}
      <section className="knowledge-base__section">
        <div className="section-header">
          <h3>Documents ({documents.length})</h3>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter documents..."
            className="filter-input"
          />
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="empty-state">
            {filter ? "No documents match your filter." : "No documents yet. Add your first document above!"}
          </div>
        ) : (
          <div className="documents-list">
            {filteredDocuments.map((doc) => (
              <div key={doc.id} className="document-card">
                <div className="document-card__header">
                  <h4>{doc.title}</h4>
                  <div className="document-card__actions">
                    <button onClick={() => handleEdit(doc)} className="btn btn--small">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="btn btn--small btn--danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="document-card__content">
                  {doc.content.substring(0, 200)}
                  {doc.content.length > 200 ? "..." : ""}
                </p>
                <div className="document-card__meta">
                  <span>Created: {new Date(doc.created_at).toLocaleDateString()}</span>
                  {doc.updated_at !== doc.created_at && (
                    <span>Updated: {new Date(doc.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit Modal */}
      {editingDoc && (
        <div className="modal-overlay" onClick={() => setEditingDoc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Document</h3>
            <form onSubmit={handleUpdateDocument} className="knowledge-base__form">
              <div className="form-group">
                <label htmlFor="edit-title">Title *</label>
                <input
                  id="edit-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-content">Content *</label>
                <textarea
                  id="edit-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setEditingDoc(null)} className="btn">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn btn--primary">
                  {loading ? "Updating..." : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
