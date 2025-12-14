import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { Message, UploadedDocument, FileSearchStore, GroundingMetadata } from '../types';
import { buildContextualRequest, ContextInput, ContextSource, ContextualRequest } from './contextService';

// Sanitize the API key to remove quotes or whitespace
const getApiKey = () => process.env.API_KEY?.replace(/["']/g, "").trim() || "";
const apiKey = getApiKey();

// Initialize the client
const ai = new GoogleGenAI({ apiKey });

// ─────────────────────────────────────────────────────────────────
// Unified Chat Request Options
// ─────────────────────────────────────────────────────────────────

export interface ChatRequestOptions {
  /** User's query text */
  query: string;
  
  /** Source surface (snippet, sketch, chat) */
  source?: ContextSource;
  
  /** Screen capture (base64) */
  screenImage?: string;
  
  /** Sketch export (base64) */
  sketchImage?: string;
  
  /** Conversation history */
  history?: Message[];
  
  /** RAG store reference */
  ragStore?: FileSearchStore | null;
  
  /** Documents in RAG store */
  documents?: UploadedDocument[];
  
  /** Metadata filter for File Search (e.g., 'author="John"') */
  metadataFilter?: string;
  
  /** Additional attachments */
  attachments?: Array<{
    type: 'image' | 'video';
    data: string;
    mimeType?: string;
  }>;
}

/** Response with text and optional citations */
export interface ChatResponse {
  text: string;
  citations?: GroundingMetadata;
}

/**
 * Unified chat response generator.
 * All surfaces (snippet, sketch, plain chat) call this function.
 * RAG is automatically wired when documents are available.
 * Returns text and optional citations from File Search.
 */
export const generateChatResponse = async (options: ChatRequestOptions): Promise<ChatResponse> => {
  try {
    const modelId = 'gemini-2.5-flash'; // Stable version with File Search support
    
    // Build unified context request
    const contextInput: ContextInput = {
      query: options.query,
      source: options.source || 'chat',
      screenImage: options.screenImage,
      sketchImage: options.sketchImage,
      attachments: options.attachments,
      history: options.history,
      ragStore: options.ragStore,
      documents: options.documents,
      metadataFilter: options.metadataFilter
    };
    
    const contextRequest: ContextualRequest = buildContextualRequest(contextInput);
    
    // Log context metadata for debugging
    console.log('[GeminiService] Context metadata:', contextRequest.metadata);
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: contextRequest.parts as any
      },
      config: {
        systemInstruction: contextRequest.systemInstruction,
        tools: contextRequest.tools as any
      }
    });
    
    // Extract citations/grounding metadata if available
    const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;
    
    if (groundingMetadata?.groundingChunks?.length) {
      console.log('[GeminiService] Citations found:', groundingMetadata.groundingChunks.length);
    }

    return {
      text: response.text || "I couldn't generate a response.",
      citations: groundingMetadata
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Sorry, I encountered an error processing your request." };
  }
};

/**
 * Legacy compatibility wrapper for existing callers.
 * @deprecated Use generateChatResponse(options) instead
 */
export const generateChatResponseLegacy = async (
  history: Message[],
  currentInput: string,
  imageData?: string,
  fileSearchStoreId?: string
): Promise<string> => {
  const response = await generateChatResponse({
    query: currentInput,
    source: imageData ? 'snippet' : 'chat',
    screenImage: imageData,
    history
  });
  return response.text;
};

// ─────────────────────────────────────────────────────────────────
// Image Generation Options
// ─────────────────────────────────────────────────────────────────

export interface ImageGenOptions {
  /** Text prompt describing the desired image */
  prompt: string;
  
  /** Reference image to base generation on (sketch, screen capture) */
  referenceImage?: string;
  
  /** RAG store for context (future use) */
  ragStore?: FileSearchStore | null;
  
  /** Documents for context */
  documents?: UploadedDocument[];
}

/**
 * Image generation with context awareness.
 * Uses Gemini 2.0 Flash with native image output.
 */
export const generateImage = async (options: ImageGenOptions | string): Promise<string> => {
  try {
    // Handle legacy string-only calls
    const opts: ImageGenOptions = typeof options === 'string' 
      ? { prompt: options } 
      : options;
    
    const parts: any[] = [];
    
    // Add reference image if provided (sketch or screen capture)
    if (opts.referenceImage) {
      const cleanBase64 = opts.referenceImage.split(',')[1] || opts.referenceImage;
      const mimeType = opts.referenceImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64
        }
      });
      console.log('[ImageGen] Including reference image context');
    }
    
    // Add the prompt with context awareness
    const contextualPrompt = opts.referenceImage 
      ? `Based on the provided reference image, create a polished, professional version: ${opts.prompt}`
      : opts.prompt;
    
    parts.push({ text: contextualPrompt });
    
    console.log('[ImageGen] Generating with prompt:', contextualPrompt.substring(0, 100));
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',  // Model that supports native image output
      contents: {
        parts: parts
      },
      config: {
        responseModalities: ['IMAGE', 'TEXT'] as any  // Enable image output
      }
    });

    // Find the image part in the response
    const imagePart = response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith('image/')
    );
    
    if (imagePart && imagePart.inlineData) {
      return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
    }
    
    // If no inline image, check if there's a text response and log it for debugging
    const textPart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
    if (textPart) {
      console.log('[ImageGen] Model returned text instead of image:', textPart.text?.substring(0, 200));
    }
    
    throw new Error("No image returned from model. The model may not support image generation for this prompt.");
  } catch (error) {
    console.error("Image Gen Error:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────
// Video Generation Options
// ─────────────────────────────────────────────────────────────────

export interface VideoGenOptions {
  /** Text prompt describing the desired video */
  prompt: string;
  
  /** Reference image to animate (sketch, generated image, screen capture) */
  referenceImage?: string;
  
  /** RAG store for context (future use) */
  ragStore?: FileSearchStore | null;
  
  /** Documents for context */
  documents?: UploadedDocument[];
}

/**
 * Video generation with context awareness.
 * Uses Veo for text-to-video and image-to-video.
 */
export const generateVideo = async (options: VideoGenOptions | string, legacyImage?: string): Promise<string> => {
  try {
    // Handle legacy calls: generateVideo(prompt, image)
    const opts: VideoGenOptions = typeof options === 'string'
      ? { prompt: options, referenceImage: legacyImage }
      : options;
    
    console.log("[VideoGen] Starting Veo generation...", {
      hasReferenceImage: !!opts.referenceImage,
      promptPreview: opts.prompt.substring(0, 50)
    });
    
    // Prepare config
    const config: any = {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    };

    // Start Operation
    let operation;
    
    if (opts.referenceImage) {
      // Image-to-Video (Animation from sketch/image)
      const cleanBase64 = opts.referenceImage.split(',')[1] || opts.referenceImage;
      const mimeType = opts.referenceImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      
      console.log('[VideoGen] Using reference image for animation');
      operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',  // Latest Veo 3.1 with audio support
        prompt: opts.prompt || "Animate this design naturally with smooth motion",
        image: {
          imageBytes: cleanBase64,
          mimeType: mimeType, 
        },
        config
      });
    } else {
      // Text-to-Video
      operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',  // Latest Veo 3.1 with audio support
        prompt: opts.prompt,
        config
      });
    }

    // Poll for completion
    console.log("Polling Veo operation:", operation.name);
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5s poll
      operation = await ai.operations.getVideosOperation({ operation: operation });
      console.log("Veo Status:", operation.metadata?.state);
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No video URI returned");

    // Fetch the actual video bytes through the proxy download link
    // CRITICAL: Use the sanitized apiKey here
    console.log("Fetching video bytes from:", videoUri);
    const response = await fetch(`${videoUri}&key=${apiKey}`);
    
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    // Convert to base64 data URI for inline playback
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.error("Veo Gen Error:", error);
    throw error;
  }
};