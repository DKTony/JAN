
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ScreenShare from './components/ScreenShare';
import ChatWidget from './components/ChatWidget';
import LandingPage from './components/LandingPage';
import { Message } from './types';
import { LiveAPIProvider, useLiveAPI } from './contexts/LiveAPIContext';
import { DocumentProvider, useDocumentContext } from './contexts/DocumentContext';
import { generateChatResponse, generateImage, generateVideo } from './services/geminiService';
import { useScreenCapture } from './lib/useScreenCapture';
import { CapturedFrame } from './types';

// Inner Component to access Context
const AppContent: React.FC = () => {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSnippingMode, setIsSnippingMode] = useState(false);
  const [pendingSnapshot, setPendingSnapshot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const manualCanvasRef = useRef<HTMLCanvasElement>(null); // For manual snapshots (snippets)
  const { client, status, streamingText, isStreaming, lastCompletedTurn } = useLiveAPI();
  const { activeStore, documents } = useDocumentContext();
  
  // Optimized screen capture with frame diffing and adaptive FPS
  const screenCaptureEnabled = status === 'connected' && isScreenSharing;
  
  const handleScreenFrame = useCallback((frame: CapturedFrame) => {
    if (client && frame.data) {
      client.sendRealtimeInput([{
        mimeType: 'image/jpeg',
        data: frame.data
      }]);
    }
  }, [client]);
  
  const { captureFrame: captureOptimizedFrame, isIdle, frameCount, skippedCount } = useScreenCapture({
    videoRef,
    enabled: screenCaptureEnabled,
    onFrame: handleScreenFrame,
    config: {
      minIntervalMs: 750,    // ~1.3 FPS during activity
      maxIntervalMs: 2000,   // 0.5 FPS when idle
      idleTimeoutMs: 3000,
      diffThreshold: 0.92,   // Skip if 92% similar
      jpegQuality: 0.75
    }
  });
  
  // Debug: Log capture stats periodically
  useEffect(() => {
    if (screenCaptureEnabled && frameCount > 0 && frameCount % 10 === 0) {
      console.log(`[ScreenCapture] Frames: ${frameCount}, Skipped: ${skippedCount}, Idle: ${isIdle}`);
    }
  }, [screenCaptureEnabled, frameCount, skippedCount, isIdle]);

  const [messages, setMessages] = useState<Message[]>([
    {
        id: 'init',
        role: 'model',
        text: 'Welcome! I can see your screen and access your Knowledge Base. Connect to Live API for real-time voice interaction, or type to chat. You can also visualize designs using the Image/Video tools.',
        timestamp: Date.now()
    }
  ]);

  // Handle completed turns from Live API (text transcript finalized)
  // Note: During streaming, ChatWidget shows streamingText from context
  useEffect(() => {
    if (lastCompletedTurn) {
      setMessages(prev => [...prev, {
        id: lastCompletedTurn.id,
        role: 'model',
        text: lastCompletedTurn.text,
        timestamp: lastCompletedTurn.timestamp
      }]);
    }
  }, [lastCompletedTurn]);

  const handleStreamReady = (stream: MediaStream) => {
    setIsScreenSharing(true);
  };

  const handleStreamStop = () => {
    setIsScreenSharing(false);
    setIsSnippingMode(false);
  };

  // Manual snapshot capture (for snippets and chat attachments)
  // Uses a separate canvas from the optimized capture loop
  const captureManualSnapshot = useCallback((): string | undefined => {
    if (!videoRef.current || !isScreenSharing) return undefined;
    const video = videoRef.current;
    
    // Create canvas on demand for manual captures
    let canvas = manualCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      manualCanvasRef.current = canvas;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8); 
  }, [isScreenSharing]);

  const handleSnippetCaptured = (base64: string) => {
    setPendingSnapshot(base64);
    setIsSnippingMode(false);
  };

  const handleSendMessage = async (text: string, snapshot?: string, mode: 'text' | 'image' | 'video' = 'text') => {
    // 1. Add User Message to UI
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      text,
      timestamp: Date.now(),
      // If there's a snapshot, attach it visually to the user message
      attachments: snapshot ? [{ type: 'image', data: snapshot }] : undefined
    };
    setMessages(prev => [...prev, userMsg]);
    
    // Clear pending snapshot UI after sending
    if (snapshot) setPendingSnapshot(null);

    if (mode === 'text' && status === 'connected' && client) {
        // Live API Mode (Text Only)
        client.sendText(text);
        if (snapshot) {
             const cleanBase64 = snapshot.split(',')[1];
             client.sendRealtimeInput([{
                mimeType: 'image/jpeg',
                data: cleanBase64
             }]);
        }
        return;
    }

    // Standard Chat / Image / Video Generation
    setIsLoading(true);
    try {
        let responseText = "";
        let attachments = undefined;

        if (mode === 'image') {
            // Image Generation with context awareness
            // Use snapshot (sketch or screen capture) as reference if available
            const referenceImage = snapshot || (isScreenSharing ? captureManualSnapshot() : undefined);
            
            console.log('[App] Image generation with context:', {
              hasReference: !!referenceImage,
              isSketch: referenceImage?.startsWith('data:image/png'),
              ragStoreReady: !!activeStore
            });
            
            const imageBase64 = await generateImage({
              prompt: text,
              referenceImage: referenceImage,
              ragStore: activeStore,
              documents: documents
            });
            responseText = referenceImage 
              ? "Here's a polished version based on your reference:" 
              : "Here is the generated design:";
            attachments = [{ type: 'image' as const, data: imageBase64 }];
        } 
        else if (mode === 'video') {
            // Video Generation with context awareness
            // Use snapshot (sketch or screen capture) as reference for animation
            const referenceImage = snapshot || (isScreenSharing ? captureManualSnapshot() : undefined);
            
            console.log('[App] Video generation with context:', {
              hasReference: !!referenceImage,
              isSketch: referenceImage?.startsWith('data:image/png'),
              ragStoreReady: !!activeStore
            });
            
            const videoUrl = await generateVideo({
              prompt: text,
              referenceImage: referenceImage,
              ragStore: activeStore,
              documents: documents
            });
            responseText = referenceImage 
              ? "Here's your animated visualization:" 
              : "Here is your generated video:";
            attachments = [{ type: 'video' as const, data: videoUrl }];
        }
        else {
            // Standard Chat (Gemini 2.5 Flash) - Unified Context Architecture
            // Determine source type and visual context
            const screenCapture = isScreenSharing ? captureManualSnapshot() : undefined;
            const isSnippetFlow = !!snapshot && !snapshot.startsWith('data:image/png'); // Snippets are JPEG
            const isSketchFlow = !!snapshot && snapshot.startsWith('data:image/png'); // Sketches are PNG
            
            // Log context for debugging
            console.log('[App] Sending to unified context service:', {
              hasSnapshot: !!snapshot,
              hasScreenCapture: !!screenCapture,
              isSnippet: isSnippetFlow,
              isSketch: isSketchFlow,
              ragStoreReady: !!activeStore,
              documentCount: documents.filter(d => d.status === 'ready').length
            });

            const chatResponse = await generateChatResponse({
                query: text,
                source: isSketchFlow ? 'sketch' : isSnippetFlow ? 'snippet' : 'chat',
                screenImage: isSnippetFlow ? snapshot : screenCapture,
                sketchImage: isSketchFlow ? snapshot : undefined,
                history: messages,
                ragStore: activeStore,
                documents: documents
            });
            
            responseText = chatResponse.text;
            
            // Store citations with the message if available
            if (chatResponse.citations?.groundingChunks?.length) {
              console.log('[App] Response includes citations:', chatResponse.citations.groundingChunks);
            }
            
            // Add message with citations
            setMessages(prev => [...prev, {
              id: uuidv4(),
              role: 'model',
              text: responseText,
              timestamp: Date.now(),
              attachments,
              citations: chatResponse.citations
            }]);
            return; // Early return since we already added the message
        }
        
        setMessages(prev => [...prev, {
            id: uuidv4(),
            role: 'model',
            text: responseText,
            timestamp: Date.now(),
            attachments
        }]);

    } catch (error) {
        console.error("Generation Error:", error);
        setMessages(prev => [...prev, {
            id: uuidv4(),
            role: 'model',
            text: "Sorry, I encountered an error generating content. Please try again.",
            timestamp: Date.now()
        }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleAnimateImage = async (imageUrl: string) => {
      setMessages(prev => [...prev, {
          id: uuidv4(),
          role: 'model',
          text: "Initializing Veo animation... This may take a moment.",
          timestamp: Date.now()
      }]);
      
      setIsLoading(true);
      try {
          // Use the unified video generation interface with context
          const videoUrl = await generateVideo({
            prompt: "Animate this scene cinematically with smooth, natural motion",
            referenceImage: imageUrl,
            ragStore: activeStore,
            documents: documents
          });
          setMessages(prev => [...prev, {
            id: uuidv4(),
            role: 'model',
            text: "Animation complete:",
            timestamp: Date.now(),
            attachments: [{ type: 'video', data: videoUrl }]
        }]);
      } catch (e) {
          console.error("Animation failed", e);
          setMessages(prev => [...prev, {
            id: uuidv4(),
            role: 'model',
            text: "Failed to animate image.",
            timestamp: Date.now()
        }]);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">

        {/* Layer 1: Video Feed */}
        <ScreenShare 
            onStreamReady={handleStreamReady} 
            onStreamStop={handleStreamStop}
            videoRef={videoRef}
            isSnipping={isSnippingMode}
            onSnippetCaptured={handleSnippetCaptured}
            onSnippetCancelled={() => setIsSnippingMode(false)}
        />

        {/* Layer 2: Chat Overlay */}
        <ChatWidget 
            messages={messages}
            onSendMessage={handleSendMessage}
            isScreenSharing={isScreenSharing}
            isLoading={isLoading}
            onStartSnipping={() => setIsSnippingMode(prev => !prev)}
            isSnipping={isSnippingMode}
            pendingSnapshot={pendingSnapshot}
            onClearSnapshot={() => setPendingSnapshot(null)}
            onAnimateImage={handleAnimateImage}
            onImageCaptured={handleSnippetCaptured} // Reuse the snippet capture handler
        />
    </div>
  );
};

const App: React.FC = () => {
    const [showLanding, setShowLanding] = useState(true);
    const [showApp, setShowApp] = useState(false);

    const handleEnterApp = () => {
        setShowLanding(false);
        setTimeout(() => setShowApp(true), 500);
    };

    return (
        <DocumentProvider>
            <LiveAPIProvider>
                <div className={`absolute inset-0 z-50 transition-opacity duration-1000 ease-in-out ${showLanding ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <LandingPage onEnter={handleEnterApp} />
                </div>

                <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ease-in-out ${showApp ? 'opacity-100' : 'opacity-0'}`}>
                    <AppContent />
                </div>
            </LiveAPIProvider>
        </DocumentProvider>
    );
};

export default App;
