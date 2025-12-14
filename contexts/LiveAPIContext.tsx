import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { GenAILiveClient } from '../lib/genai-live-client';
import { AudioRecorder } from '../lib/audio-recorder';
import { AudioStreamer } from '../lib/audio-streamer';
import { LiveStatus, LiveConfig } from '../types';
import { useDocumentContext } from './DocumentContext';

/** Represents a completed model turn with text transcript */
export interface CompletedTurn {
  id: string;
  text: string;
  timestamp: number;
}

interface LiveAPIContextType {
  client: GenAILiveClient | null;
  status: LiveStatus;
  connect: () => void;
  disconnect: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  isRecording: boolean;
  error: string | null;
  clearError: () => void;
  /** Streaming text from Live API (transcript of current turn) */
  streamingText: string;
  /** Whether the model is currently generating a response */
  isStreaming: boolean;
  /** Last completed turn - changes when a turn finishes, use to add messages */
  lastCompletedTurn: CompletedTurn | null;
}

const LiveAPIContext = createContext<LiveAPIContextType | undefined>(undefined);

export const LiveAPIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<LiveStatus>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastCompletedTurn, setLastCompletedTurn] = useState<CompletedTurn | null>(null);
  const clientRef = useRef<GenAILiveClient | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamingTextRef = useRef(''); // Ref for callback access
  const turnIdRef = useRef(0); // Counter for unique turn IDs
  
  // Access the active RAG store to configure the AI
  const { activeStore, documents } = useDocumentContext();

  // Helper to get a clean key
  const getApiKey = () => process.env.API_KEY?.replace(/["']/g, "").trim();

  // Re-initialize client when store changes or on mount
  useEffect(() => {
    // IMPORTANT: Google Search and File Search cannot be used together
    // Prioritize File Search when RAG documents are available
    const hasRagDocs = activeStore && documents.some(d => d.status === 'ready');
    
    const tools: LiveConfig['tools'] = hasRagDocs
      ? [{ fileSearch: { fileSearchStoreNames: [activeStore.name] } }]
      : [{ googleSearch: {} }];

    const systemInstruction = `
    You are a versatile AI Screen Agent with access to a File Search knowledge base.
    
    PRIMARY INSTRUCTIONS:
    1.  **File Search First**: If the user asks a question, ALWAYS check your File Search tool first if documents are available.
    2.  **Citations**: When you use information from File Search, you MUST cite the source document name. For example: "According to [Document Name]...".
    3.  **Screen Context**: You can see the user's screen. Use this context to answer questions about what is visible.
    4.  **Response Style**: Be concise, helpful, and friendly. Use Markdown formatting.
    `;

    const config: LiveConfig = {
      model: "models/gemini-2.5-flash-native-audio-preview-09-2025",
      systemInstruction: systemInstruction,
      generationConfig: {
        responseModalities: "audio",
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede"
            }
          }
        }
      },
      tools: tools
    };

    // Cleanup previous client if exists
    if (clientRef.current) {
        clientRef.current.disconnect();
    }

    clientRef.current = new GenAILiveClient(config);
    
    clientRef.current.on('open', () => {
      setStatus('connected');
      startRecording();
    });

    clientRef.current.on('close', () => {
      setStatus('disconnected');
      stopRecording();
    });

    clientRef.current.on('content', (modelTurn: any) => {
      // Handle Audio
      const audioParts = modelTurn.parts.filter((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('audio'));
      audioParts.forEach((part: any) => {
          if (audioStreamerRef.current) {
              const binaryString = atob(part.inlineData.data);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
              }
              audioStreamerRef.current.addPCM16(bytes);
          }
      });
    });
    
    // Handle streaming text (transcript)
    clientRef.current.on('textDelta', (delta: string) => {
      setIsStreaming(true);
      streamingTextRef.current += delta;
      setStreamingText(streamingTextRef.current);
    });
    
    // Handle turn completion
    clientRef.current.on('turnComplete', () => {
      const finalText = streamingTextRef.current;
      if (finalText) {
        // Create a new completed turn object (triggers useEffect in consumers)
        turnIdRef.current++;
        setLastCompletedTurn({
          id: `live-turn-${turnIdRef.current}`,
          text: finalText,
          timestamp: Date.now()
        });
      }
      // Reset streaming state
      streamingTextRef.current = '';
      setStreamingText('');
      setIsStreaming(false);
    });

    // If we were connected, reconnect to apply new config (optional, but cleaner to stay disconnected until user action)
    if (status === 'connected') {
        setStatus('disconnected');
        stopRecording();
    }

    return () => {
      disconnect();
    };
  }, [activeStore, documents]); // Re-run when RAG store is ready or docs update

  const connect = () => {
    const key = getApiKey();
    if (!key) {
        console.error("API Key missing or invalid");
        return;
    }
    setStatus('connecting');
    clientRef.current?.connect(key);
  };

  const disconnect = () => {
    clientRef.current?.disconnect();
    stopRecording();
    setStatus('disconnected');
  };

  const startRecording = async () => {
    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }
        if (!audioStreamerRef.current) {
            audioStreamerRef.current = new AudioStreamer(audioContextRef.current);
        }
        if (!audioRecorderRef.current) {
            audioRecorderRef.current = new AudioRecorder();
            audioRecorderRef.current.on('data', (data: ArrayBuffer) => {
                const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
                clientRef.current?.sendRealtimeInput([{
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64
                }]);
            });
        }

        await audioRecorderRef.current.start();
        setIsRecording(true);
        setError(null);
    } catch (err: any) {
        console.error("Failed to start recording", err);
        // Show user-friendly error message
        const message = err?.message?.includes('secure context')
          ? err.message
          : 'Failed to access microphone. Please check permissions.';
        setError(message);
    }
  };

  const clearError = () => setError(null);

  const stopRecording = () => {
    audioRecorderRef.current?.stop();
    audioStreamerRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <LiveAPIContext.Provider value={{ 
      client: clientRef.current, 
      status, 
      connect, 
      disconnect,
      startRecording,
      stopRecording,
      isRecording,
      error,
      clearError,
      streamingText,
      isStreaming,
      lastCompletedTurn
    }}>
      {children}
    </LiveAPIContext.Provider>
  );
};

export const useLiveAPI = () => {
  const context = useContext(LiveAPIContext);
  if (!context) throw new Error('useLiveAPI must be used within LiveAPIProvider');
  return context;
};