import { GoogleGenAI } from "@google/genai";
import { LiveConfig } from '../types';

export class GenAILiveClient {
  private client: GoogleGenAI | null = null;
  private session: any = null;
  private config: LiveConfig;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: LiveConfig) {
    this.config = config;
  }

  on(event: string, fn: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(fn);
  }

  off(event: string, fn: Function) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      this.listeners.set(event, callbacks.filter((c) => c !== fn));
    }
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  async connect(apiKey: string) {
    if (!apiKey) throw new Error("API Key required");
    this.client = new GoogleGenAI({ apiKey });

    const responseModality = this.config.generationConfig?.responseModalities?.toUpperCase() || 'AUDIO';
    
    const connectConfig = {
        responseModalities: [responseModality],
        speechConfig: this.config.generationConfig?.speechConfig,
        systemInstruction: this.config.systemInstruction,
        tools: this.config.tools
    };

    this.session = await this.client.live.connect({
      model: this.config.model,
      // Type assertion needed due to SDK type strictness with modality strings
      config: connectConfig as any,
      callbacks: {
        onopen: () => this.emit('open'),
        onmessage: (msg: any) => {
          if (msg.serverContent?.modelTurn) {
            // Emit full content for audio handling
            this.emit('content', msg.serverContent.modelTurn);
            
            // Extract and emit text parts separately for transcript streaming
            const textParts = msg.serverContent.modelTurn.parts?.filter(
              (p: any) => p.text && typeof p.text === 'string'
            );
            if (textParts?.length > 0) {
              const textDelta = textParts.map((p: any) => p.text).join('');
              this.emit('textDelta', textDelta);
            }
          }
          if (msg.serverContent?.turnComplete) {
            this.emit('turnComplete');
          }
          if (msg.toolCall) {
            this.emit('toolCall', msg.toolCall);
          }
        },
        onclose: (e: any) => this.emit('close', e),
        onerror: (e: any) => this.emit('error', e),
      }
    });
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  sendText(text: string) {
    this.session?.send({ parts: [{ text }] }, true);
  }

  sendRealtimeInput(chunks: { mimeType: string; data: string }[]) {
    chunks.forEach(chunk => {
      this.session?.sendRealtimeInput({
        media: {
          mimeType: chunk.mimeType,
          data: chunk.data
        }
      });
    });
  }

  sendToolResponse(toolResponse: any) {
    this.session?.sendToolResponse(toolResponse);
  }
}