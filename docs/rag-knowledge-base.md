# JAN Knowledge Base (RAG) Design

This document describes how JAN manages uploaded documents and integrates Google **File Search Stores** for Retrieval-Augmented Generation (RAG).

For a product overview and documentation map, start with [context.md](./context.md).

## 1. Objectives

- Allow users to upload documents (PDF, TXT, MD, CSV).
- Index documents into a Gemini File Search Store.
- Attach the store as a tool to Gemini Live sessions so the model can ground answers.
- Provide a simple UI for viewing document status and removing entries.

## 2. Data Model

Types: `types.ts`

```ts
export interface DocumentMetadata {
  key: string;
  stringValue?: string;
  numericValue?: number;
}

export interface ChunkingConfig {
  maxTokensPerChunk?: number;  // Default: 256
  maxOverlapTokens?: number;   // Default: 64
}

export interface UploadedDocument {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  fileSearchStoreId?: string;
  documentName?: string;  // Resource name for deletion
  status?: 'uploading' | 'indexing' | 'ready' | 'failed';
  error?: string;
  metadata?: DocumentMetadata[];  // Custom metadata for filtering
}

export interface FileSearchStore {
  name: string;
  displayName: string;
  documentCount?: number;
  totalSizeBytes?: number;
}

// Citation from File Search grounding
export interface GroundingChunk {
  retrievedContext?: { uri: string; title: string; };
  web?: { uri: string; title: string; };
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  groundingSupports?: Array<{
    segment: { startIndex: number; endIndex: number; text: string };
    groundingChunkIndices: number[];
    confidenceScores: number[];
  }>;
}
```

## 3. DocumentContext

File: `contexts/DocumentContext.tsx`

### 3.1 Store Initialization

On mount, JAN initializes a per-session File Search Store:

```ts
const ai = new GoogleGenAI({ apiKey });
const createResponse = await ai.fileSearchStores.create({
  config: { displayName: `Screen_Agent_Session_${Date.now()}` },
});

setActiveStore({ 
  name: createResponse.name, 
  displayName: ...,
  documentCount: 0,
  totalSizeBytes: 0
});
setStores(prev => [...prev, newStore]);  // Track in stores array
```

**Notes:**
- A fresh store is created for each app session.
- There is no persistence layer for reusing stores across sessions.
- `stores[]` array tracks all stores for multi-store management.
- `listStores()`, `createStore()`, `deleteStore()`, `selectStore()` provide CRUD operations.

### 3.2 Uploading and Indexing

`uploadDocument(file: File, options?: UploadOptions)` performs an end-to-end upload into the active store:

```ts
// UploadOptions interface
interface UploadOptions {
  displayName?: string;
  metadata?: DocumentMetadata[];    // Custom metadata for filtering
  chunkingConfig?: ChunkingConfig;  // Custom chunking parameters
}

// Build upload config with optional chunking and metadata
const uploadConfig = {
  displayName: options?.displayName || file.name,
  mimeType: file.type,
  ...(options?.chunkingConfig && {
    chunkingConfig: {
      whiteSpaceConfig: {
        maxTokensPerChunk: options.chunkingConfig.maxTokensPerChunk || 256,
        maxOverlapTokens: options.chunkingConfig.maxOverlapTokens || 64
      }
    }
  }),
  ...(options?.metadata?.length && {
    customMetadata: options.metadata.map(m => ({
      key: m.key,
      ...(m.stringValue !== undefined && { stringValue: m.stringValue }),
      ...(m.numericValue !== undefined && { numericValue: m.numericValue })
    }))
  })
};

const uploadResponse = await ai.fileSearchStores.uploadToFileSearchStore({
  fileSearchStoreName: activeStore.name,
  file,
  config: uploadConfig,
});

const fileData = (uploadResponse as any).file || uploadResponse;

const newDoc: UploadedDocument = {
  uri: fileData.uri,
  name: fileData.displayName || file.name,
  mimeType: fileData.mimeType,
  size: Number(fileData.sizeBytes) || file.size,
  status: 'ready',
};
```

- Once the SDK call resolves, the document is assumed to be fully indexed and marked `ready`.
- The document's `documentName` is stored for later deletion.
- **Optimistic updates**: Stats are updated immediately, then refreshed from API after 2s.
- Any thrown error results in a `failed` document with attached error message.

### 3.3 Deletion

`deleteDocument(documentName)` attempts to delete the document from the File Search Store via the REST API and then removes it from local state:

- Issues a `DELETE` to `v1beta/{documentName}`.
- Logs but tolerates 404s (already-deleted documents).
- Optimistically updates `documentCount` and `totalSizeBytes` on the active store.

## 4. DocumentPanel UI

File: `components/DocumentPanel.tsx`

Responsibilities:
- List documents with status chips (`Indexing`, `Ready`, `Failed`).
- Surface `error` messages from DocumentContext.
- Provide an Upload button:
  - Disabled while `isUploading` is true.
  - Disabled until `activeStore` is initialized.
- Provide a Delete (bin) icon per document which calls `deleteDocument(documentName)`.

Empty state:
- Shows a dashed border card inviting the user to upload PDFs to index.

## 5. Integration with Unified Context Architecture

### 5.1 contextService.ts (Shared RAG Layer)

File: `services/contextService.ts`

All input surfaces (snippet, sketch, chat) now use a unified context builder that automatically wires RAG:

```ts
// From contextService.ts
const hasReadyDocs = input.documents?.some(d => d.status === 'ready') ?? false;
const hasRagContext = !!(input.ragStore && hasReadyDocs);

if (hasRagContext && input.ragStore) {
  tools.push({
    fileSearch: {
      fileSearchStoreNames: [input.ragStore.name]
    }
  });
}
```

**Benefits:**
- RAG is automatically enabled across all surfaces when documents are ready
- System instructions adapt to include RAG-specific guidance
- Single place to modify RAG integration logic

### 5.2 LiveAPIContext (Voice/Video Sessions)

File: `contexts/LiveAPIContext.tsx`

Live sessions also wire File Search when documents are available:

```ts
const tools: LiveConfig['tools'] = [{ googleSearch: {} }];

if (activeStore && documents.some(d => d.status === 'ready')) {
  tools.push({
    fileSearch: {
      fileSearchStoreNames: [activeStore.name],
    },
  });
}
```

**Result:** Both REST and WebSocket paths now have consistent RAG grounding.

## 6. Failure Modes & Operational Notes

- **RAG Init Failed:** If `fileSearchStores.create` fails, `activeStore` remains null and DocumentPanel will show an error banner.
- **Upload/Indexing Failed:**
  - DocumentContext logs detailed errors (`message`, `stack`, `original`).
  - The specific document is marked `failed` and the global `error` field is set.
- **Store Lifecycle:** There is currently no clean-up for old stores  they are session-scoped and managed by the Gemini backend.

## 7. Future Enhancements

- Implement higher-level management of documents and stores (e.g., archival and retention policies).
- Support multi-tenant or persistent stores (e.g., named stores per project instead of per session).
- Surface RAG citations more prominently in the chat UI for both Live and HTTP responses.
- Add UI affordances for setting metadata filters when querying the knowledge base.

## 8. Citations Display

When File Search returns grounding metadata, it's displayed in ChatWidget:

```tsx
// In ChatWidget.tsx
{settings.displayCitations && msg.citations?.groundingChunks?.length > 0 && (
  <div className="mt-1 px-2 py-1.5 bg-blue-900/20 border border-blue-500/20 rounded-lg">
    <div className="flex items-center gap-1 text-[10px] text-blue-400 font-medium mb-1">
      <FileText className="w-3 h-3" />
      Sources
    </div>
    <div className="flex flex-wrap gap-1">
      {msg.citations.groundingChunks.map((chunk, idx) => (
        <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-300 rounded">
          {chunk.retrievedContext?.title || chunk.web?.title || `Source ${idx + 1}`}
        </span>
      ))}
    </div>
  </div>
)}
```

- `settings.displayCitations` toggle (persisted to localStorage via `updateSettings`).
- Citations show document titles from File Search or web sources from Google Search.
