import React, { useEffect, useRef, useState } from 'react';
import { Video, MonitorOff } from 'lucide-react';

interface ScreenShareProps {
  onStreamReady: (stream: MediaStream) => void;
  onStreamStop: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  isSnipping: boolean;
  onSnippetCaptured: (base64: string) => void;
  onSnippetCancelled: () => void;
}

interface Selection {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

const ScreenShare: React.FC<ScreenShareProps> = ({ 
  onStreamReady, 
  onStreamStop, 
  videoRef, 
  isSnipping,
  onSnippetCaptured,
  onSnippetCancelled
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const startShare = async () => {
    try {
      setError(null);
      
      // Check if mediaDevices API is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error(
          'Screen sharing requires a secure context (HTTPS or localhost). ' +
          'Please access this app via https:// or http://localhost'
        );
      }
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsSharing(true);
      onStreamReady(stream);

      stream.getVideoTracks()[0].onended = () => {
        stopShare();
      };

    } catch (err: any) {
      console.error("Error sharing screen:", err);
      // Show the specific error message if it's about secure context
      const message = err?.message?.includes('secure context') 
        ? err.message 
        : "Failed to share screen. Please try again.";
      setError(message);
    }
  };

  const stopShare = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsSharing(false);
    onStreamStop();
  };

  // --- Snipping Logic ---

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isSnipping || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setSelection({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
      isDragging: true
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSnipping || !selection?.isDragging || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setSelection(prev => prev ? ({
      ...prev,
      currentX: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      currentY: Math.max(0, Math.min(e.clientY - rect.top, rect.height))
    }) : null);
  };

  const handleMouseUp = () => {
    if (!isSnipping || !selection || !videoRef.current) return;
    
    // 1. Calculate selection rectangle
    const x = Math.min(selection.startX, selection.currentX);
    const y = Math.min(selection.startY, selection.currentY);
    const width = Math.abs(selection.currentX - selection.startX);
    const height = Math.abs(selection.currentY - selection.startY);

    // Ignore tiny accidental clicks
    if (width < 10 || height < 10) {
        setSelection(null);
        return;
    }

    // 2. Map to Video Resolution
    // HTML Video elements scale content with object-fit: contain. We need to map the DOM coordinates back to the source resolution.
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();

    // Calculate the displayed size of the video (handling letterboxing)
    const videoRatio = video.videoWidth / video.videoHeight;
    const elementRatio = rect.width / rect.height;
    
    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let renderLeft = 0;
    let renderTop = 0;

    if (elementRatio > videoRatio) {
        // Pillarboxed (black bars on sides)
        renderWidth = rect.height * videoRatio;
        renderLeft = (rect.width - renderWidth) / 2;
    } else {
        // Letterboxed (black bars on top/bottom)
        renderHeight = rect.width / videoRatio;
        renderTop = (rect.height - renderHeight) / 2;
    }

    // Adjust selection coordinates relative to the actual rendered video image
    const relativeX = x - renderLeft;
    const relativeY = y - renderTop;

    // Scale factors
    const scaleX = video.videoWidth / renderWidth;
    const scaleY = video.videoHeight / renderHeight;

    // Final Source Coordinates
    const sourceX = Math.max(0, relativeX * scaleX);
    const sourceY = Math.max(0, relativeY * scaleY);
    const sourceW = Math.min(width * scaleX, video.videoWidth - sourceX);
    const sourceH = Math.min(height * scaleY, video.videoHeight - sourceY);

    // 3. Draw to Canvas
    const canvas = document.createElement('canvas');
    canvas.width = sourceW;
    canvas.height = sourceH;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
        const base64 = canvas.toDataURL('image/jpeg', 0.9);
        onSnippetCaptured(base64);
    }

    setSelection(null);
  };

  // Escape key to cancel
  useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && isSnipping) {
              onSnippetCancelled();
              setSelection(null);
          }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
  }, [isSnipping, onSnippetCancelled]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-contain transition-opacity duration-500 ${isSharing ? 'opacity-100' : 'opacity-0'}`}
      />
      
      {/* Initial State UI */}
      {!isSharing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--c-bacPri)] text-[var(--c-texPri)]">
          <div className="w-16 h-16 rounded-full bg-[var(--c-bacTer)] flex items-center justify-center mb-6 shadow-[var(--c-shaMD)]">
            <MonitorOff className="w-8 h-8 text-[var(--c-texSec)]" />
          </div>
          <h2 className="text-2xl font-medium mb-2">Ready to Collaborate</h2>
          <p className="text-[var(--c-texSec)] mb-8 max-w-md text-center">
            Share your screen to let the AI assistant analyze your workflow and provide real-time context.
          </p>
          
          {error && <div className="mb-4 text-red-400 bg-red-900/20 px-4 py-2 rounded text-sm">{error}</div>}

          <button
            onClick={startShare}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--c-bluTexAccPri)] hover:bg-[var(--c-bluBacAccSec)] text-white font-medium rounded-lg transition-colors shadow-[var(--c-shaSM)]"
          >
            <Video className="w-5 h-5" />
            Start Screen Share
          </button>
        </div>
      )}
      
      {/* Snipping Overlay */}
      {isSharing && isSnipping && (
          <div 
            ref={overlayRef}
            className="absolute inset-0 z-50 cursor-crosshair bg-black/30"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Selection Box Visual */}
            {selection && (
                <div 
                    className="absolute border-2 border-[var(--c-bluTexAccPri)] bg-[var(--c-bluTexAccPri)]/10 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                    style={{
                        left: Math.min(selection.startX, selection.currentX),
                        top: Math.min(selection.startY, selection.currentY),
                        width: Math.abs(selection.currentX - selection.startX),
                        height: Math.abs(selection.currentY - selection.startY)
                    }}
                >
                    {/* Dimensions Label */}
                    <div className="absolute -top-6 left-0 bg-[var(--c-bluTexAccPri)] text-white text-[10px] px-1.5 py-0.5 rounded">
                        {Math.round(Math.abs(selection.currentX - selection.startX))} x {Math.round(Math.abs(selection.currentY - selection.startY))}
                    </div>
                </div>
            )}
            {/* Helper Text */}
            {!selection && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm pointer-events-none backdrop-blur-sm border border-white/10 animate-in fade-in slide-in-from-top-4">
                    Click and drag to capture a region (Esc to cancel)
                </div>
            )}
          </div>
      )}

      {/* Active Status Indicator */}
      {isSharing && !isSnipping && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full glass-panel text-xs font-medium text-[var(--c-texSec)] flex items-center gap-2 pointer-events-auto transition-opacity hover:opacity-100 opacity-40">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Sharing Screen
            <button onClick={stopShare} className="ml-2 hover:text-white underline">Stop</button>
        </div>
      )}
    </div>
  );
};

export default ScreenShare;