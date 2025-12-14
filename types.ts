export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  attachments?: {
    type: 'image' | 'video';
    data: string; // base64 or URL
    mimeType?: string;
  }[];
  citations?: GroundingMetadata;  // Citations from File Search
}

export enum ViewMode {
  WIDGET = 'WIDGET',
  EXPANDED = 'EXPANDED',
  HIDDEN = 'HIDDEN'
}

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
  documentName?: string;  // Resource name in store (for deletion)
  status?: 'uploading' | 'indexing' | 'ready' | 'failed';
  error?: string;
  metadata?: DocumentMetadata[];  // Custom metadata for filtering
}

export interface FileSearchStore {
  name: string; // Resource name (e.g., fileSearchStores/123)
  displayName: string;
  documentCount?: number;
  totalSizeBytes?: number;
}

// Citation from File Search grounding
export interface GroundingChunk {
  retrievedContext?: {
    uri: string;
    title: string;
  };
  web?: {
    uri: string;
    title: string;
  };
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  groundingSupports?: Array<{
    segment: { startIndex: number; endIndex: number; text: string };
    groundingChunkIndices: number[];
    confidenceScores: number[];
  }>;
  searchEntryPoint?: { renderedContent: string };
  webSearchQueries?: string[];
}

export interface GoogleOperation {
  name: string;
  metadata?: {
    '@type': string;
    state: 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  };
  done?: boolean;
  error?: {
    code: number;
    message: string;
  };
  response?: any;
}

export interface LiveConfig {
  model: string;
  systemInstruction?: string;
  generationConfig?: {
    responseModalities?: "audio" | "image" | "text";
    speechConfig?: {
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName?: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede";
        };
      };
    };
  };
  tools?: Array<{ googleSearch?: {} } | { codeExecution?: {} } | { fileSearch?: { fileSearchStoreNames: string[] } }>;
}

export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Screen Capture Types
export interface CapturedFrame {
  data: string;           // base64 without data URL prefix
  width: number;
  height: number;
  timestamp: number;
  isKeyFrame: boolean;    // true for first frame or significant change
  similarity?: number;    // 0-1, similarity to previous frame
}

export interface ScreenCaptureConfig {
  /** Min capture interval in ms (max FPS = 1000/minInterval) */
  minIntervalMs: number;
  /** Max capture interval in ms (min FPS = 1000/maxInterval) */
  maxIntervalMs: number;
  /** Idle timeout before switching to slower FPS */
  idleTimeoutMs: number;
  /** Similarity threshold (0-1). Skip frame if similarity > threshold */
  diffThreshold: number;
  /** JPEG quality (0-1) or 'auto' for content-adaptive */
  jpegQuality: number | 'auto';
  /** Number of sample points for frame comparison */
  diffSampleSize: number;
}

export const DEFAULT_SCREEN_CAPTURE_CONFIG: ScreenCaptureConfig = {
  minIntervalMs: 500,      // Max 2 FPS during activity
  maxIntervalMs: 2000,     // Min 0.5 FPS when idle  
  idleTimeoutMs: 3000,     // 3s without activity = idle
  diffThreshold: 0.95,     // Skip if 95% similar
  jpegQuality: 0.75,
  diffSampleSize: 100      // Sample 100 pixels for comparison
};