/**
 * contextService.ts
 * 
 * Unified context builder that all input surfaces (Snippet, Sketch, Chat)
 * use to construct model requests with consistent RAG grounding.
 * 
 * This is the single source of truth for:
 * - Building multimodal content parts
 * - Attaching File Search tools when documents are available
 * - Constructing system instructions
 */

import { Message, UploadedDocument, FileSearchStore } from '../types';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type ContextSource = 'snippet' | 'sketch' | 'chat' | 'live';

export interface ContextInput {
  /** The user's query or prompt */
  query: string;
  
  /** Source surface for telemetry/instruction tuning */
  source: ContextSource;
  
  /** Screen capture image (base64) – from snippet or live frame */
  screenImage?: string;
  
  /** Sketch/whiteboard export (base64) */
  sketchImage?: string;
  
  /** Additional file attachments (images, etc.) */
  attachments?: Array<{
    type: 'image' | 'video';
    data: string;
    mimeType?: string;
  }>;
  
  /** Conversation history for multi-turn context */
  history?: Message[];
  
  /** RAG store reference – injected from DocumentContext */
  ragStore?: FileSearchStore | null;
  
  /** Documents in the store – to check if any are ready */
  documents?: UploadedDocument[];
  
  /** Metadata filter for File Search (e.g., 'author="John"' or 'year > 2020') */
  metadataFilter?: string;
}

export interface ContextualRequest {
  /** Multimodal parts array for the model */
  parts: ContentPart[];
  
  /** Tools to attach (googleSearch, fileSearch) */
  tools: ModelTool[];
  
  /** System instruction tailored to the context */
  systemInstruction: string;
  
  /** Metadata about what context was included */
  metadata: {
    hasScreenContext: boolean;
    hasSketchContext: boolean;
    hasRagContext: boolean;
    historyLength: number;
    source: ContextSource;
  };
}

export interface ContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface ModelTool {
  googleSearch?: Record<string, never>;
  fileSearch?: {
    fileSearchStoreNames: string[];
    metadataFilter?: string;  // Filter syntax: https://google.aip.dev/160
  };
  codeExecution?: Record<string, never>;
}

// ─────────────────────────────────────────────────────────────────
// System Instructions by Source
// ─────────────────────────────────────────────────────────────────

const BASE_INSTRUCTION = `You are JAN, an intelligent AI assistant with multimodal capabilities.

CORE CAPABILITIES:
- **Visual Understanding**: You can analyze images including screen captures and sketches.

RESPONSE GUIDELINES:
- Be concise and direct
- Use Markdown formatting
`;

const SOURCE_INSTRUCTIONS: Record<ContextSource, string> = {
  snippet: `
CONTEXT: The user has captured a specific region of their screen to ask about.
- Focus your analysis on the captured snippet
- Reference visual elements you observe
- If the snippet contains code, provide specific line-by-line feedback
`,
  
  sketch: `
CONTEXT: The user has drawn a sketch/diagram and wants your input.
- Interpret the sketch as a visual concept or wireframe
- Offer constructive feedback on the design
- Suggest improvements or alternatives if appropriate
`,
  
  chat: `
CONTEXT: Standard conversational interaction.
- Maintain conversation continuity with history
- Be helpful and proactive
`,
  
  live: `
CONTEXT: Real-time voice/video session.
- Responses should be conversational and natural
- You can see the user's screen in real-time
- Keep responses concise for audio playback
`
};

// ─────────────────────────────────────────────────────────────────
// Context Builder
// ─────────────────────────────────────────────────────────────────

/**
 * Builds a unified contextual request from any input surface.
 * All surfaces call this function, ensuring consistent RAG integration.
 */
export function buildContextualRequest(input: ContextInput): ContextualRequest {
  const parts: ContentPart[] = [];
  const tools: ModelTool[] = [];
  
  // ── 1. Visual Context ──────────────────────────────────────────
  
  // Screen capture (snippet or live frame)
  if (input.screenImage) {
    const cleanBase64 = cleanBase64Data(input.screenImage);
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: cleanBase64
      }
    });
  }
  
  // Sketch/whiteboard export
  if (input.sketchImage) {
    const cleanBase64 = cleanBase64Data(input.sketchImage);
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: cleanBase64
      }
    });
  }
  
  // Additional attachments
  if (input.attachments?.length) {
    for (const attachment of input.attachments) {
      if (attachment.type === 'image') {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType || 'image/jpeg',
            data: cleanBase64Data(attachment.data)
          }
        });
      }
      // Video attachments could be handled differently (e.g., frame extraction)
    }
  }
  
  // ── 2. Conversation History ────────────────────────────────────
  
  let historyContext = '';
  if (input.history?.length) {
    const recentHistory = input.history.slice(-6); // Last 6 messages
    historyContext = 'Previous conversation:\n';
    recentHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      historyContext += `${role}: ${msg.text}\n`;
    });
    historyContext += '\n';
  }
  
  // ── 3. User Query ──────────────────────────────────────────────
  
  parts.push({
    text: `${historyContext}User Request: ${input.query}`
  });
  
  // ── 4. Tools (RAG or Search - mutually exclusive) ─────────────
  
  // Check if File Search (RAG) is available
  const hasReadyDocs = input.documents?.some(d => d.status === 'ready') ?? false;
  const hasRagContext = !!(input.ragStore && hasReadyDocs);
  
  // IMPORTANT: Google Search and File Search cannot be used together
  // Prioritize File Search when RAG documents are available
  if (hasRagContext && input.ragStore) {
    const fileSearchTool: ModelTool['fileSearch'] = {
      fileSearchStoreNames: [input.ragStore.name]
    };
    
    // Add metadata filter if provided (e.g., 'author="John"' or 'year > 2020')
    if (input.metadataFilter) {
      fileSearchTool.metadataFilter = input.metadataFilter;
      console.log('[ContextService] Using metadata filter:', input.metadataFilter);
    }
    
    tools.push({ fileSearch: fileSearchTool });
  } else {
    // Fall back to Google Search when no RAG documents
    tools.push({ googleSearch: {} });
  }
  
  // ── 5. System Instruction ──────────────────────────────────────
  
  let systemInstruction = BASE_INSTRUCTION;
  systemInstruction += SOURCE_INSTRUCTIONS[input.source] || '';
  
  // Add tool-specific instructions
  if (hasRagContext) {
    systemInstruction += `
KNOWLEDGE BASE ACTIVE: You have access to ${input.documents?.filter(d => d.status === 'ready').length || 0} indexed document(s) via File Search.
- Use File Search to answer questions about the uploaded documents
- When citing documents, format as: "(Source: [Document Name])"
- If the question is unrelated to uploaded documents, answer from your general knowledge
`;
  } else {
    systemInstruction += `
WEB SEARCH ACTIVE: You have access to Google Search for current information.
- Use web search for current events, facts, or information you're unsure about
- Cite sources when using web results
`;
  }
  
  // ── 6. Build Response ──────────────────────────────────────────
  
  return {
    parts,
    tools,
    systemInstruction,
    metadata: {
      hasScreenContext: !!input.screenImage,
      hasSketchContext: !!input.sketchImage,
      hasRagContext,
      historyLength: input.history?.length || 0,
      source: input.source
    }
  };
}

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────

/**
 * Strips data URL prefix from base64 string if present
 */
function cleanBase64Data(data: string): string {
  const commaIndex = data.indexOf(',');
  if (commaIndex !== -1) {
    return data.substring(commaIndex + 1);
  }
  return data;
}

/**
 * Helper to check if RAG is available
 */
export function isRagAvailable(
  store: FileSearchStore | null | undefined,
  documents: UploadedDocument[] | undefined
): boolean {
  return !!(store && documents?.some(d => d.status === 'ready'));
}
