import { useRef, useCallback, useEffect, useState } from 'react';
import { 
  CapturedFrame, 
  ScreenCaptureConfig, 
  DEFAULT_SCREEN_CAPTURE_CONFIG 
} from '../types';

interface UseScreenCaptureOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  onFrame?: (frame: CapturedFrame) => void;
  config?: Partial<ScreenCaptureConfig>;
}

interface UseScreenCaptureReturn {
  /** Manually capture a single frame */
  captureFrame: () => CapturedFrame | null;
  /** Current capture interval in ms */
  currentIntervalMs: number;
  /** Whether currently in idle mode (slower FPS) */
  isIdle: boolean;
  /** Frames captured this session */
  frameCount: number;
  /** Frames skipped due to similarity */
  skippedCount: number;
}

/**
 * Hook for optimized screen capture with frame diffing and adaptive FPS.
 * 
 * Features:
 * - Frame diffing: skips frames that are too similar to previous
 * - Adaptive FPS: faster during user activity, slower when idle
 * - Configurable JPEG quality
 */
export function useScreenCapture({
  videoRef,
  enabled,
  onFrame,
  config: userConfig
}: UseScreenCaptureOptions): UseScreenCaptureReturn {
  const config = { ...DEFAULT_SCREEN_CAPTURE_CONFIG, ...userConfig };
  
  // Refs for capture state (avoid re-renders during capture loop)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const previousFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const frameCountRef = useRef(0);
  const skippedCountRef = useRef(0);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  
  // State for external visibility
  const [currentIntervalMs, setCurrentIntervalMs] = useState(config.minIntervalMs);
  const [isIdle, setIsIdle] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // Initialize canvas lazily
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      ctxRef.current = canvasRef.current.getContext('2d', { 
        willReadFrequently: true 
      });
    }
    return { canvas: canvasRef.current, ctx: ctxRef.current };
  }, []);

  /**
   * Compare two frames using pixel sampling.
   * Returns similarity score 0-1 (1 = identical)
   */
  const compareFrames = useCallback((
    currentData: Uint8ClampedArray,
    previousData: Uint8ClampedArray,
    width: number,
    height: number
  ): number => {
    if (currentData.length !== previousData.length) return 0;
    
    const sampleSize = Math.min(config.diffSampleSize, width * height);
    const step = Math.floor((width * height) / sampleSize);
    
    let matchCount = 0;
    const tolerance = 10; // Allow small color variations
    
    for (let i = 0; i < sampleSize; i++) {
      const pixelIndex = (i * step) * 4; // RGBA = 4 bytes per pixel
      
      const rDiff = Math.abs(currentData[pixelIndex] - previousData[pixelIndex]);
      const gDiff = Math.abs(currentData[pixelIndex + 1] - previousData[pixelIndex + 1]);
      const bDiff = Math.abs(currentData[pixelIndex + 2] - previousData[pixelIndex + 2]);
      
      if (rDiff <= tolerance && gDiff <= tolerance && bDiff <= tolerance) {
        matchCount++;
      }
    }
    
    return matchCount / sampleSize;
  }, [config.diffSampleSize]);

  /**
   * Determine JPEG quality based on content complexity.
   * Text-heavy screens get higher quality, complex images get lower.
   */
  const getAdaptiveQuality = useCallback((
    imageData: Uint8ClampedArray,
    width: number,
    height: number
  ): number => {
    if (config.jpegQuality !== 'auto') {
      return config.jpegQuality;
    }
    
    // Sample edge detection to estimate complexity
    const sampleSize = 50;
    const step = Math.floor((width * height) / sampleSize);
    let edgeCount = 0;
    
    for (let i = 1; i < sampleSize - 1; i++) {
      const pixelIndex = (i * step) * 4;
      const nextPixelIndex = ((i * step) + 1) * 4;
      
      const diff = Math.abs(imageData[pixelIndex] - imageData[nextPixelIndex]);
      if (diff > 30) edgeCount++; // Sharp edge detected
    }
    
    const edgeRatio = edgeCount / sampleSize;
    
    // High edge ratio = text/UI (use higher quality)
    // Low edge ratio = photos/complex images (can use lower quality)
    if (edgeRatio > 0.3) return 0.85; // Text-heavy
    if (edgeRatio > 0.15) return 0.75; // Mixed content
    return 0.65; // Image-heavy
  }, [config.jpegQuality]);

  /**
   * Capture a single frame from the video element.
   */
  const captureFrame = useCallback((): CapturedFrame | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const { canvas, ctx } = getCanvas();
    if (!ctx) return null;

    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Resize canvas if needed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Draw current frame
    ctx.drawImage(video, 0, 0, width, height);
    
    // Get pixel data for comparison
    const imageData = ctx.getImageData(0, 0, width, height);
    const currentData = imageData.data;
    
    // Calculate similarity to previous frame
    let similarity = 0;
    let isKeyFrame = true;
    
    if (previousFrameDataRef.current) {
      similarity = compareFrames(currentData, previousFrameDataRef.current, width, height);
      isKeyFrame = similarity < config.diffThreshold;
      
      if (!isKeyFrame) {
        // Frame too similar, skip it
        skippedCountRef.current++;
        setSkippedCount(skippedCountRef.current);
        return null;
      }
    }
    
    // Store current frame for next comparison
    previousFrameDataRef.current = new Uint8ClampedArray(currentData);
    
    // Determine JPEG quality
    const quality = getAdaptiveQuality(currentData, width, height);
    
    // Convert to base64
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64Data = dataUrl.split(',')[1];
    
    frameCountRef.current++;
    setFrameCount(frameCountRef.current);
    
    const frame: CapturedFrame = {
      data: base64Data,
      width,
      height,
      timestamp: Date.now(),
      isKeyFrame,
      similarity
    };
    
    return frame;
  }, [videoRef, getCanvas, compareFrames, getAdaptiveQuality, config.diffThreshold]);

  // Track user activity for adaptive FPS
  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) {
        setIsIdle(false);
        setCurrentIntervalMs(config.minIntervalMs);
      }
    };

    // Listen for user interaction events
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [enabled, isIdle, config.minIntervalMs]);

  // Main capture loop
  useEffect(() => {
    if (!enabled) {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      return;
    }

    const runCaptureLoop = () => {
      // Check if we should switch to idle mode
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      const shouldBeIdle = timeSinceActivity > config.idleTimeoutMs;
      
      if (shouldBeIdle !== isIdle) {
        setIsIdle(shouldBeIdle);
        const newInterval = shouldBeIdle ? config.maxIntervalMs : config.minIntervalMs;
        setCurrentIntervalMs(newInterval);
      }

      // Capture and emit frame
      const frame = captureFrame();
      if (frame && onFrame) {
        onFrame(frame);
      }
    };

    // Initial capture
    runCaptureLoop();

    // Set up interval with current rate
    intervalIdRef.current = setInterval(runCaptureLoop, currentIntervalMs);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [
    enabled, 
    currentIntervalMs, 
    isIdle, 
    captureFrame, 
    onFrame,
    config.idleTimeoutMs,
    config.maxIntervalMs,
    config.minIntervalMs
  ]);

  // Reset state when disabled
  useEffect(() => {
    if (!enabled) {
      previousFrameDataRef.current = null;
      frameCountRef.current = 0;
      skippedCountRef.current = 0;
      setFrameCount(0);
      setSkippedCount(0);
    }
  }, [enabled]);

  return {
    captureFrame,
    currentIntervalMs,
    isIdle,
    frameCount,
    skippedCount
  };
}
