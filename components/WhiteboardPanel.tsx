
import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Pencil, Undo, Trash2, AlertCircle, Square, Circle, Minus, Paintbrush, Send } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[]; // For Pen/Brush/Eraser: path. For Shapes: [start, end]
  color: string;
  width: number;
  type: 'pen' | 'eraser' | 'brush' | 'rect' | 'circle' | 'line';
}

interface WhiteboardPanelProps {
    onCaptureImage?: (base64: string) => void;
}

const WhiteboardPanel: React.FC<WhiteboardPanelProps> = ({ onCaptureImage }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // UI State
  const [color, setColor] = useState('#f0efed');
  const [tool, setTool] = useState<Stroke['type']>('pen');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs for drawing state (No React re-renders during draw loop)
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);

  // --- DRAWING HELPERS ---

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (!stroke.points || stroke.points.length === 0) return;

    ctx.beginPath();
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Color & Opacity
    if (stroke.type === 'eraser') {
        ctx.strokeStyle = '#202020'; // Match BG roughly or use destination-out
        ctx.globalCompositeOperation = 'destination-out'; // True eraser
    } else {
        ctx.strokeStyle = stroke.color;
        ctx.globalCompositeOperation = 'source-over';
        // Brush effect: lower opacity
        ctx.globalAlpha = stroke.type === 'brush' ? 0.5 : 1.0;
    }

    const start = stroke.points[0];

    if (stroke.type === 'rect') {
        if (stroke.points.length < 2) return;
        const end = stroke.points[stroke.points.length - 1];
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } 
    else if (stroke.type === 'circle') {
        if (stroke.points.length < 2) return;
        const end = stroke.points[stroke.points.length - 1];
        // Calculate radius based on distance
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
    }
    else if (stroke.type === 'line') {
        if (stroke.points.length < 2) return;
        const end = stroke.points[stroke.points.length - 1];
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }
    else {
        // Pen, Brush, Eraser
        if (stroke.points.length < 2) {
            // Dot
            ctx.arc(start.x, start.y, stroke.width / 2, 0, Math.PI * 2);
            ctx.fillStyle = stroke.type === 'eraser' ? '#202020' : stroke.color;
            ctx.fill();
        } else {
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            ctx.stroke();
        }
    }

    // Reset context
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  };

  const redrawAll = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    strokes.forEach(s => drawStroke(ctx, s));
  };

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            if (width === 0 || height === 0) return;
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            redrawAll();
      }
    };
    const timeout = setTimeout(handleResize, 10);
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [strokes]);

  // Re-render when strokes change (Undo/Clear)
  useEffect(() => {
    redrawAll();
  }, [strokes]);


  // --- INTERACTION HANDLERS ---

  const getPoint = (e: React.PointerEvent): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    try {
        e.stopPropagation(); 
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        isDrawingRef.current = true;
        const point = getPoint(e);
        
        currentStrokeRef.current = {
            points: [point],
            color: color,
            width: tool === 'eraser' ? strokeWidth * 4 : strokeWidth, // Eraser usually needs to be bigger
            type: tool
        };

        // If standard drawing tool, start path immediately
        if (['pen', 'brush', 'eraser'].includes(tool)) {
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) drawStroke(ctx, currentStrokeRef.current);
        }

    } catch (e: any) {
        setError(e.message);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isDrawingRef.current || !currentStrokeRef.current || !canvasRef.current) return;

    const point = getPoint(e);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (['rect', 'circle', 'line'].includes(tool)) {
        // Shape Logic: We must clear and redraw everything to show the preview
        // Update the "end" point (index 1)
        currentStrokeRef.current.points[1] = point;
        
        // 1. Clear
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // 2. Draw History
        strokes.forEach(s => drawStroke(ctx, s));
        // 3. Draw Current Preview
        drawStroke(ctx, currentStrokeRef.current);
    } 
    else {
        // Freehand Logic: Just append and draw new segment
        const points = currentStrokeRef.current.points;
        points.push(point);

        // Optimization: Only draw the new segment
        // But for Brush (transparency) this overlaps ugly. 
        // For simple Pen/Eraser, segment drawing is fine.
        // For Brush, we might technically need full redraw to look perfect, 
        // but segment drawing is faster. Let's stick to segment for perf.
        
        ctx.beginPath();
        ctx.lineWidth = currentStrokeRef.current.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = '#202020';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = color;
            ctx.globalAlpha = tool === 'brush' ? 0.5 : 1.0;
        }

        if (points.length >= 2) {
            const prev = points[points.length - 2];
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    
    isDrawingRef.current = false;
    const newStroke = currentStrokeRef.current;
    
    // Validate shape
    if (['rect', 'circle', 'line'].includes(newStroke.type)) {
        // If only 1 point (click without drag), ignore
        if (newStroke.points.length < 2) {
            currentStrokeRef.current = null;
            redrawAll(); // Clean up any preview artifacts
            return;
        }
    }

    setStrokes(prev => [...prev, newStroke]);
    currentStrokeRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleExport = () => {
      if (canvasRef.current && onCaptureImage) {
          // Create a composite canvas with black background (since eraser uses destination-out)
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvasRef.current.width;
          tempCanvas.height = canvasRef.current.height;
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx) {
              tCtx.fillStyle = '#191919'; // Background color
              tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
              tCtx.drawImage(canvasRef.current, 0, 0);
              // Export as PNG so contextService can identify this as a sketch (vs JPEG snippets)
              const base64 = tempCanvas.toDataURL('image/png');
              onCaptureImage(base64);
          }
      }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--c-bacSec)] relative">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-[var(--c-borPri)] bg-[var(--c-bacSec)] shrink-0 z-10 flex flex-col gap-2">
            
            {/* Top Row: Tools */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    {[
                        { id: 'pen', icon: Pencil, title: 'Pen' },
                        { id: 'brush', icon: Paintbrush, title: 'Brush' },
                        { id: 'eraser', icon: Eraser, title: 'Eraser' },
                        { id: 'line', icon: Minus, title: 'Line' },
                        { id: 'rect', icon: Square, title: 'Rectangle' },
                        { id: 'circle', icon: Circle, title: 'Circle' }
                    ].map((t) => (
                        <button 
                            key={t.id}
                            onClick={() => setTool(t.id as any)}
                            className={`p-2 rounded-lg transition-colors ${tool === t.id ? 'bg-[var(--c-bluTexAccPri)] text-white' : 'text-[var(--c-texSec)] hover:bg-[var(--c-bacTer)]'}`}
                            title={t.title}
                        >
                            <t.icon className="w-4 h-4" />
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1 border-l border-[var(--c-borPri)] pl-2">
                    <button 
                        onClick={() => {
                            const newStrokes = strokes.slice(0, -1);
                            setStrokes(newStrokes);
                        }} 
                        disabled={strokes.length === 0}
                        className="p-2 text-[var(--c-texSec)] hover:text-white hover:bg-[var(--c-bacTer)] rounded-lg disabled:opacity-30"
                    >
                        <Undo className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => {
                            setStrokes([]);
                            const ctx = canvasRef.current?.getContext('2d');
                            if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                        }} 
                        className="p-2 text-[var(--c-texSec)] hover:text-red-400 hover:bg-[var(--c-bacTer)] rounded-lg"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Bottom Row: Properties */}
            <div className="flex items-center justify-between">
                 {/* Colors */}
                 <div className="flex items-center gap-2">
                    {['#f0efed', '#2783de', '#e56458', '#d8a32f', '#46a171', '#9a6bb4'].map(c => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); if(tool==='eraser') setTool('pen'); }}
                            className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${color === c && tool !== 'eraser' ? 'ring-2 ring-white ring-offset-1 ring-offset-[#202020]' : ''}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>

                {/* Size Slider */}
                <div className="flex items-center gap-2 mx-4 flex-1">
                    <span className="text-[10px] text-[var(--c-texDis)]">Size</span>
                    <input 
                        type="range" 
                        min="1" 
                        max="20" 
                        value={strokeWidth} 
                        onChange={(e) => setStrokeWidth(Number(e.target.value))}
                        className="w-full h-1 bg-[var(--c-borStr)] rounded-lg appearance-none cursor-pointer accent-[var(--c-bluTexAccPri)]"
                    />
                </div>

                {/* Send to AI */}
                <button 
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--c-bacTer)] hover:bg-[var(--c-bluTexAccPri)] hover:text-white text-[var(--c-texPri)] text-xs font-medium rounded-md transition-colors"
                >
                    <Send className="w-3 h-3" />
                    Ask AI
                </button>
            </div>
        </div>

        {/* Canvas Container */}
        <div ref={containerRef} className="flex-1 relative cursor-crosshair touch-none bg-[var(--c-bacPri)]/50">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />
            {strokes.length === 0 && !isDrawingRef.current && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                    <div className="text-center">
                        <Pencil className="w-16 h-16 mx-auto mb-2" />
                        <p className="text-sm font-bold">Whiteboard</p>
                    </div>
                </div>
            )}
            {error && (
                <div className="absolute top-2 right-2 bg-red-900/80 text-white text-xs p-2 rounded flex items-center gap-2 z-50">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-2 font-bold">x</button>
                </div>
            )}
        </div>
    </div>
  );
};

export default WhiteboardPanel;
