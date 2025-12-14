
import React, { useState, useEffect, useRef } from 'react';
import { 
    Minimize2, 
    Send, 
    Sparkles, 
    Mic,
    MicOff,
    Radio,
    Loader2,
    Power,
    Camera,
    X,
    Crop,
    Image as ImageIcon,
    Film,
    GripHorizontal,
    ChevronLeft,
    ChevronRight,
    FileText
} from 'lucide-react';
import { Message, ViewMode } from '../types';
import ReactMarkdown from 'react-markdown';
import { useLiveAPI } from '../contexts/LiveAPIContext';
import { useDocumentContext } from '../contexts/DocumentContext';
import DocumentPanel from './DocumentPanel';
import WhiteboardPanel from './WhiteboardPanel';

interface ChatWidgetProps {
  messages: Message[];
  onSendMessage: (text: string, snapshot?: string, mode?: 'text' | 'image' | 'video') => void;
  isScreenSharing: boolean;
  isLoading?: boolean;
  onStartSnipping: () => void;
  isSnipping: boolean;
  pendingSnapshot: string | null;
  onClearSnapshot: () => void;
  onAnimateImage: (imageUrl: string) => void;
  onImageCaptured?: (base64: string) => void;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ 
  messages, 
  onSendMessage, 
  isScreenSharing,
  isLoading = false,
  onStartSnipping,
  isSnipping,
  pendingSnapshot,
  onClearSnapshot,
  onAnimateImage,
  onImageCaptured
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.WIDGET);
  const [page, setPage] = useState(0); // 0=Chat, 1=Whiteboard, 2=KnowledgeBase
  const [inputValue, setInputValue] = useState('');
  const [genMode, setGenMode] = useState<'text' | 'image' | 'video'>('text');
  
  // Resizing State
  const [size, setSize] = useState({ width: 400, height: 600 });
  const [isResizing, setIsResizing] = useState(false);
  
  // Drag/Swipe State
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  
  const { status, connect, disconnect, startRecording, stopRecording, isRecording, error: liveApiError, clearError, streamingText, isStreaming } = useLiveAPI();
  const { settings } = useDocumentContext();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (viewMode === ViewMode.EXPANDED && page === 0) {
      scrollToBottom();
    }
  }, [messages, viewMode, isLoading, page, streamingText]);

  // Switch to chat page if a snapshot is taken
  useEffect(() => {
    if (pendingSnapshot) {
        setPage(0);
        if (viewMode === ViewMode.WIDGET) {
            setViewMode(ViewMode.EXPANDED);
        }
    }
  }, [pendingSnapshot]);

  // Handle Click Outside to Minimize
  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      // If we are actively snipping (cropping screen), do not minimize
      if (isSnipping) return;
      
      // If widget is open, check if click is outside
      if (viewMode === ViewMode.EXPANDED && widgetRef.current) {
         const target = event.target as Node;
         const isOutside = !widgetRef.current.contains(target);
         
         // Also ensure we aren't clicking on a modal or overlay that might be portal'd out (not applicable here but good practice)
         if (isOutside) {
            setViewMode(ViewMode.WIDGET);
         }
      }
    };

    // Use pointerdown to capture touches and clicks effectively
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [viewMode, isSnipping]);

  // --- RESIZING LOGIC ---
  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!isResizing) return;
          const newWidth = Math.max(350, Math.min(800, window.innerWidth - e.clientX - 16));
          const newHeight = Math.max(400, Math.min(window.innerHeight - 32, window.innerHeight - e.clientY - 16));
          
          setSize({ width: newWidth, height: newHeight });
      };
      
      const handleMouseUp = () => {
          setIsResizing(false);
      };

      if (isResizing) {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isResizing]);

  // --- DRAG / SWIPE LOGIC ---
  
  const handlePointerDown = (e: React.PointerEvent) => {
      // Don't drag if snipping or if interacting with a specific control
      if (isSnipping) return;
      
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input') || target.closest('canvas')) return;

      dragStartX.current = e.clientX;
      dragStartY.current = e.clientY;
      setIsDragging(true);
      
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging || dragStartX.current === null || dragStartY.current === null) return;

      const dx = e.clientX - dragStartX.current;
      const dy = e.clientY - dragStartY.current;

      // Lock direction: if vertical scroll is dominant, cancel horizontal drag
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          setIsDragging(false);
          setDragOffset(0);
          dragStartX.current = null;
          dragStartY.current = null;
          return;
      }

      // Resistance at edges (Left of Page 0, Right of Page 2)
      if ((page === 0 && dx > 0) || (page === 2 && dx < 0)) {
          setDragOffset(dx * 0.2); 
      } else {
          setDragOffset(dx);
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (!isDragging) return;
      
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      const threshold = 80; // px to trigger swipe

      // Next Page (Drag Left)
      if (dragOffset < -threshold && page < 2) {
          setPage(p => p + 1);
      } 
      // Prev Page (Drag Right)
      else if (dragOffset > threshold && page > 0) {
          setPage(p => p - 1);
      }
      
      setDragOffset(0);
      dragStartX.current = null;
      dragStartY.current = null;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    
    onSendMessage(inputValue, pendingSnapshot || undefined, genMode);
    setInputValue('');
    setGenMode('text'); 
  };

  const toggleConnection = () => {
      if (status === 'connected' || status === 'connecting') {
          disconnect();
      } else {
          connect();
      }
  };

  const toggleMic = async () => {
      if (status === 'disconnected') {
          connect();
          return;
      }
      
      if (isRecording) {
          stopRecording();
      } else {
          await startRecording();
      }
  };

  // --- RENDER: MINIMIZED STATE (WIDGET MODE) ---
  if (viewMode === ViewMode.WIDGET) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in zoom-in duration-300">
        <button 
          onClick={() => setViewMode(ViewMode.EXPANDED)}
          className="w-16 h-16 rounded-[20px] bg-black/80 backdrop-blur-xl border border-white/10 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] flex items-center justify-center hover:scale-105 hover:shadow-[0_0_30px_rgba(124,58,237,0.6)] transition-all duration-300 cursor-pointer group relative overflow-hidden"
        >
          {/* Animated Background Glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-pink-600/20 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Futuristic Icon */}
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 relative z-10 text-white" xmlns="http://www.w3.org/2000/svg">
            {/* Outer Ring */}
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" className="opacity-20" />
            
            {/* Rotating Arcs - Contra-rotation around SVG center */}
            <path 
              d="M12 3C7.03 3 3 7.03 3 12" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              className="opacity-60 group-hover:rotate-90 transition-transform duration-[1.5s] ease-in-out" 
              style={{ transformOrigin: '12px 12px' }}
            />
            <path 
              d="M12 21C16.97 21 21 16.97 21 12" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              className="opacity-60 group-hover:-rotate-90 transition-transform duration-[1.5s] ease-in-out" 
              style={{ transformOrigin: '12px 12px' }}
            />
            
            {/* Central Core */}
            <path d="M12 8L14 12L12 16L10 12L12 8Z" fill="currentColor" className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] group-hover:animate-pulse" />
          </svg>

          {status === 'connected' && (
            <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse border border-black/50"></span>
          )}
        </button>
      </div>
    );
  }

  // --- RENDER: EXPANDED STATE ---
  return (
    <div 
        ref={widgetRef}
        className={`absolute bottom-4 right-4 z-50 flex flex-col rounded-xl overflow-hidden shadow-[var(--c-shaLG)] border border-[var(--c-borPri)] glass-panel animate-in zoom-in duration-200 ${isSnipping ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
        style={{ 
            width: size.width, 
            height: size.height,
            transition: isResizing ? 'none' : 'width 0.2s, height 0.2s'
        }}
    >
      {/* Resize Handle (Top Left) */}
      <div 
        className="absolute top-0 left-0 w-6 h-6 z-50 cursor-nw-resize flex items-start justify-start p-1 opacity-0 hover:opacity-100 transition-opacity"
        onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
        }}
      >
          <div className="w-3 h-3 border-t-2 border-l-2 border-[var(--c-texSec)] rounded-tl-sm" />
      </div>

      {/* Header */}
      <div 
        className="h-[54px] px-4 flex items-center justify-between border-b border-[var(--c-borPri)] bg-[var(--c-bacSec)]/80 shrink-0 z-10 cursor-move"
        onPointerDown={handlePointerDown}
      >
        <div className="flex items-center gap-3 ml-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors ${
                status === 'connected' ? 'bg-green-600' : 'bg-gradient-to-br from-[var(--c-bluTexAccPri)] to-purple-600'
            }`}>
                <Sparkles className="w-4 h-4" />
            </div>
            <div>
                <h3 className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 tracking-wide">JAN</h3>
                <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <span className="text-[10px] text-[var(--c-texSec)] uppercase tracking-wider font-medium">
                        {status === 'connected' ? 'Neural Link Active' : 'Just Another Neuralnet'}
                    </span>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1">
            <button
                onClick={toggleConnection}
                className={`p-2 rounded-md transition-colors ${
                    status === 'connected' 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                }`}
                title={status === 'connected' ? 'Disconnect' : 'Connect Live API'}
            >
                <Power className="w-4 h-4" />
            </button>
          <button 
            onClick={() => setViewMode(ViewMode.WIDGET)}
            className="p-2 rounded-md hover:bg-[var(--c-bacTer)] text-[var(--c-texSec)] hover:text-[var(--c-texPri)] transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 overflow-hidden relative touch-pan-y select-none cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Navigation Bars (Left/Right) */}
        {/* Left Nav */}
        {page > 0 && (
            <div 
                className="absolute left-0 top-1/4 bottom-1/4 w-8 z-30 flex items-center justify-start pl-1 cursor-pointer group"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setPage(p => p - 1); }}
            >
                <div className="w-1 h-16 bg-white/10 rounded-full group-hover:h-24 group-hover:w-8 group-hover:bg-black/60 group-hover:backdrop-blur-md transition-all duration-300 flex items-center justify-center overflow-hidden border border-transparent group-hover:border-white/10 shadow-lg">
                    <ChevronLeft className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform -translate-x-2 group-hover:translate-x-0" />
                </div>
            </div>
        )}

        {/* Right Nav */}
        {page < 2 && (
            <div 
                className="absolute right-0 top-1/4 bottom-1/4 w-8 z-30 flex items-center justify-end pr-1 cursor-pointer group"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setPage(p => p + 1); }}
            >
                <div className="w-1 h-16 bg-white/10 rounded-full group-hover:h-24 group-hover:w-8 group-hover:bg-black/60 group-hover:backdrop-blur-md transition-all duration-300 flex items-center justify-center overflow-hidden border border-transparent group-hover:border-white/10 shadow-lg">
                    <ChevronRight className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-x-2 group-hover:translate-x-0" />
                </div>
            </div>
        )}

        <div 
            className="flex h-full w-full transition-transform will-change-transform"
            style={{
                transform: `translateX(calc(-${page * 100}% + ${dragOffset}px))`,
                transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
        >
            {/* Page 0: Chat */}
            <div className="min-w-full h-full flex flex-col relative">
                <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[var(--c-bacPri)]/50 overscroll-contain">
                     {/* Chat Messages Rendering (Same as before) */}
                     {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-60">
                            <Sparkles className="w-12 h-12 text-[var(--c-texTer)] mb-4" />
                            <p className="text-[var(--c-texSec)] text-sm">
                                Connect for real-time voice/video, or just type to chat.
                            </p>
                            <p className="text-[var(--c-texDis)] text-xs mt-2">
                                Swipe left for Whiteboard & Knowledge Base
                            </p>
                        </div>
                    )}
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`} onPointerDown={(e) => e.stopPropagation()}>
                             <div className={`flex gap-2 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-1 text-[10px] font-bold ${msg.role === 'user' ? 'bg-[var(--c-texTer)] text-[var(--c-bacPri)]' : 'bg-[var(--c-bluTexAccPri)] text-white'}`}>{msg.role === 'user' ? 'U' : 'AI'}</div>
                                <div className={`flex flex-col gap-2`}>
                                    {msg.attachments?.map((att, idx) => (
                                        <div key={idx} className="relative rounded-lg overflow-hidden border border-[var(--c-borStr)] bg-black">
                                            {att.type === 'image' ? (
                                                <div className="group relative">
                                                    <img src={att.data} alt="attachment" className="max-w-full max-h-[200px] object-contain" />
                                                    {msg.role === 'model' && (
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <button onClick={() => onAnimateImage(att.data)} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg transform hover:scale-105 transition-all"><Film className="w-3 h-3" />Animate with Veo</button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <video src={att.data} controls className="max-w-full max-h-[200px]" />
                                            )}
                                        </div>
                                    ))}
                                    {msg.text && (
                                        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm select-text cursor-auto ${msg.role === 'user' ? 'bg-[var(--c-bacTer)] text-[var(--c-texPri)] rounded-tr-sm' : 'bg-transparent text-[var(--c-texPri)] -ml-2'}`}>
                                            {msg.role === 'user' ? msg.text : <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{msg.text}</ReactMarkdown></div>}
                                        </div>
                                    )}
                                    {/* Citations Display */}
                                    {settings.displayCitations && msg.citations?.groundingChunks && msg.citations.groundingChunks.length > 0 && (
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
                                </div>
                             </div>
                        </div>
                    ))}
                    {/* Streaming bubble - shows live transcript from Live API */}
                    {isStreaming && streamingText && (
                        <div className="flex flex-col items-start">
                            <div className="flex gap-2 max-w-[90%] flex-row">
                                <div className="w-6 h-6 rounded-full bg-[var(--c-bluTexAccPri)] text-white flex-shrink-0 flex items-center justify-center mt-1 text-[10px] font-bold animate-pulse">
                                    <Radio className="w-3 h-3" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed text-[var(--c-texPri)] -ml-2">
                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <ReactMarkdown>{streamingText}</ReactMarkdown>
                                        </div>
                                        <span className="inline-block w-1.5 h-4 bg-[var(--c-bluTexAccPri)] ml-0.5 animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {isLoading && (
                        <div className="flex flex-col items-start"><div className="flex gap-2 max-w-[90%] flex-row"><div className="w-6 h-6 rounded-full bg-[var(--c-bluTexAccPri)] text-white flex-shrink-0 flex items-center justify-center mt-1 text-[10px] font-bold">AI</div><div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed text-[var(--c-texPri)] -ml-2"><Loader2 className="w-4 h-4 animate-spin" /></div></div></div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Page 1: Whiteboard */}
            <div className="min-w-full h-full relative">
                 <WhiteboardPanel onCaptureImage={(base64) => {
                     if (onImageCaptured) {
                         onImageCaptured(base64);
                     }
                 }} />
            </div>

            {/* Page 2: Knowledge Base */}
            <div className="min-w-full h-full relative" onPointerDown={(e) => e.stopPropagation()}>
                <DocumentPanel />
            </div>
        </div>
      </div>

      {/* Footer Input Area (Shared) */}
      <div className="bg-[var(--c-bacSec)] border-t border-[var(--c-borPri)] flex flex-col z-10">
        {pendingSnapshot && (
            <div className="px-4 pt-3 pb-0 flex items-center gap-2">
                <div className="relative group">
                    <img src={pendingSnapshot} alt="Snippet" className="h-12 rounded border border-[var(--c-borStr)]" />
                    <button onClick={onClearSnapshot} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                </div>
                <span className="text-[10px] text-[var(--c-texDis)]">Image attached</span>
            </div>
        )}

        {/* Error Banner */}
        {liveApiError && (
          <div className="mx-4 mb-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
            <span className="text-red-400 text-xs flex-1">{liveApiError}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="p-4 pb-2">
            <div className="flex items-center gap-2">
                <button 
                    onClick={toggleMic} 
                    disabled={status === 'connecting'} 
                    className={`p-3 rounded-full transition-all flex-shrink-0 ${
                        isRecording 
                            ? 'bg-red-500 text-white animate-pulse' 
                            : 'bg-[var(--c-bacTer)] text-[var(--c-texPri)] hover:bg-[var(--c-bacEle)]'
                    } ${status === 'connecting' ? 'opacity-50 cursor-wait' : ''}`}
                    title={status === 'disconnected' ? "Go Live" : "Toggle Microphone"}
                >
                    <Mic className="w-5 h-5" />
                </button>
                <button onClick={onStartSnipping} disabled={!isScreenSharing} className={`p-3 rounded-full transition-colors flex-shrink-0 ${isSnipping ? 'bg-[var(--c-bluTexAccPri)] text-white' : 'bg-[var(--c-bacTer)] text-[var(--c-texPri)]'} ${!isScreenSharing ? 'opacity-50 cursor-not-allowed' : ''}`}><Crop className="w-5 h-5" /></button>
                <form onSubmit={handleSubmit} className={`flex-1 flex items-center gap-2 bg-[var(--c-bacPri)] border rounded-xl px-3 py-2 ${genMode === 'image' ? 'border-purple-500' : genMode === 'video' ? 'border-pink-500' : 'border-[var(--c-borStr)]'}`}>
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={genMode === 'image' ? "Describe image..." : genMode === 'video' ? "Describe video..." : "Type message..."} className="flex-1 bg-transparent text-sm text-[var(--c-texPri)] outline-none min-w-0" disabled={isLoading} />
                    <div className="flex items-center gap-1 border-l border-[var(--c-borStr)] pl-2">
                        <button type="button" onClick={() => setGenMode(genMode === 'image' ? 'text' : 'image')} className={`p-1.5 rounded ${genMode === 'image' ? 'text-purple-400' : 'text-[var(--c-texDis)]'}`}><ImageIcon className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setGenMode(genMode === 'video' ? 'text' : 'video')} className={`p-1.5 rounded ${genMode === 'video' ? 'text-pink-400' : 'text-[var(--c-texDis)]'}`}><Film className="w-4 h-4" /></button>
                    </div>
                    <button type="submit" disabled={!inputValue.trim() || isLoading} className={`p-1.5 rounded-lg ${inputValue.trim() ? 'text-[var(--c-bluTexAccPri)]' : 'text-[var(--c-texDis)]'}`}><Send className="w-4 h-4" /></button>
                </form>
            </div>
        </div>
        <div className="pb-3 flex justify-center gap-2">
            {[0, 1, 2].map((p) => (
                <button key={p} onClick={() => setPage(p)} className={`w-1.5 h-1.5 rounded-full transition-colors ${page === p ? 'bg-[var(--c-texPri)]' : 'bg-[var(--c-borStr)] hover:bg-[var(--c-texSec)]'}`} />
            ))}
        </div>
      </div>
    </div>
  );
};

export default ChatWidget;
