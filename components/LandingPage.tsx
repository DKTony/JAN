
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

// Particle Class for 3D Logic
class Particle {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  size: number;
  color: string;

  constructor(width: number, height: number, isBrainMode: boolean) {
    this.x = (Math.random() - 0.5) * width * 2;
    this.y = (Math.random() - 0.5) * height * 2;
    this.z = Math.random() * 2000;
    this.size = Math.random() * 2;
    
    // Brain shape target (Ellipsoid approximation)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const radius = 250; // Base radius
    
    // Morph sphere into brain-ish shape (two hemispheres)
    let bx = radius * Math.sin(phi) * Math.cos(theta);
    let by = radius * Math.sin(phi) * Math.sin(theta) * 0.8; // Flatten y slightly
    let bz = radius * Math.cos(phi) * 1.2; // Elongate z
    
    // Add gap for hemispheres
    if (bx > 0) bx += 20; else bx -= 20;

    this.targetX = bx;
    this.targetY = by;
    this.targetZ = bz;
    
    this.color = Math.random() > 0.8 ? '#2783de' : '#f0efed';
  }
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'galaxy' | 'zoom' | 'brain'>('galaxy');
  const [showUI, setShowUI] = useState(false);
  const reqRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = [];
    const particleCount = 800;

    // Init Particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle(width, height, false));
    }

    let cameraZ = 0;
    let warpSpeed = 60; // Faster start
    let animationTime = 0;

    const render = () => {
      ctx.fillStyle = '#000000';
      // Trail effect
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      animationTime++;

      // Phase Logic - ACCELERATED TIMING
      if (animationTime === 90) { // ~1.5 seconds in (was 180)
         setPhase('zoom');
      }
      if (animationTime === 130) { // ~2.1 seconds in (was 240)
         setPhase('brain');
         setShowUI(true);
      }

      // Sort particles by Z for depth
      particles.sort((a, b) => b.z - a.z);

      // Draw Connections (Synapses) in Brain Mode
      if (phase === 'brain') {
         ctx.lineWidth = 0.3;
         ctx.strokeStyle = 'rgba(39, 131, 222, 0.15)';
         
         for (let i = 0; i < particles.length; i += 3) {
             const p1 = particles[i];
             // Only connect if close and in front of camera
             if (p1.z + cameraZ > 0) {
                 const scale1 = 500 / (500 + (p1.z + cameraZ));
                 const x1 = p1.x * scale1 + centerX;
                 const y1 = p1.y * scale1 + centerY;
                 
                 // Find a neighbor
                 if (i + 1 < particles.length) {
                     const p2 = particles[i+1];
                     const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
                     
                     if (dist < 60) {
                        const scale2 = 500 / (500 + (p2.z + cameraZ));
                        const x2 = p2.x * scale2 + centerX;
                        const y2 = p2.y * scale2 + centerY;
                        
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                     }
                 }
             }
         }
      }

      particles.forEach((p) => {
        // --- PHYSICS UPDATE ---
        
        if (phase === 'galaxy') {
            // Warp Speed Logic
            p.z -= warpSpeed;
            if (p.z < -500) {
                p.z = 2000;
                p.x = (Math.random() - 0.5) * width * 2;
                p.y = (Math.random() - 0.5) * height * 2;
            }
        } 
        else if (phase === 'zoom') {
            // Pull back and center
            warpSpeed *= 0.90; // Decelerate faster
            cameraZ -= 20; // Pull camera back faster
            
            // Lerp to target
            p.x += (p.targetX - p.x) * 0.08;
            p.y += (p.targetY - p.y) * 0.08;
            p.z += (p.targetZ - p.z) * 0.08;
        }
        else if (phase === 'brain') {
            // Brain Rotation & Pulse
            const rotSpeed = 0.002;
            const cos = Math.cos(rotSpeed);
            const sin = Math.sin(rotSpeed);
            
            // Rotate around Y
            const x = p.x * cos - p.z * sin;
            const z = p.x * sin + p.z * cos;
            p.x = x;
            p.z = z;

            // Gentle drift/pulse
            p.targetX = x; // update target to maintain shape
            p.targetZ = z;
        }

        // --- RENDER ---
        
        // 3D Projection
        const fov = 500;
        const scale = fov / (fov + p.z + cameraZ);
        
        if (scale > 0) {
            const x2d = p.x * scale + centerX;
            const y2d = p.y * scale + centerY;
            const r = p.size * scale;

            ctx.beginPath();
            ctx.arc(x2d, y2d, r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            
            // Glow effect in brain mode
            if (phase === 'brain') {
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.color;
            } else {
                ctx.shadowBlur = 0;
            }
            
            ctx.fill();
            ctx.shadowBlur = 0; // Reset
        }
      });

      reqRef.current = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [phase]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />
      
      {/* UI Overlay */}
      <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center transition-opacity duration-1000 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="text-center space-y-6 p-8 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/5 shadow-2xl animate-in slide-in-from-bottom-8 duration-1000">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-black/80 backdrop-blur-xl border border-white/10 shadow-[0_0_20px_rgba(124,58,237,0.4)] mb-2 group">
                {/* Tech Core Icon */}
                <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-white" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" className="opacity-20" />
                  <path d="M12 3C7.03 3 3 7.03 3 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-60 animate-[spin_8s_linear_infinite]" style={{ transformOrigin: '12px 12px' }} />
                  <path d="M12 21C16.97 21 21 16.97 21 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-60 animate-[spin_8s_linear_infinite_reverse]" style={{ transformOrigin: '12px 12px' }} />
                  <path d="M12 8L14 12L12 16L10 12L12 8Z" fill="currentColor" className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse" />
                </svg>
            </div>
            
            <div className="space-y-2">
                <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-white to-purple-400 tracking-tighter drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]">
                    JAN
                </h1>
                <p className="text-xl text-blue-200/80 tracking-[0.2em] uppercase font-bold">
                    Just Another Neuralnet
                </p>
            </div>

            <p className="max-w-md text-gray-400 text-sm leading-relaxed">
                Seamlessly integrate AI into your workflow. Analyze your screen, recall documents, and visualize ideas in real-time.
            </p>

            <button 
                onClick={onEnter}
                className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-full transition-all duration-300 hover:shadow-[0_0_30px_rgba(39,131,222,0.3)]"
            >
                <span className="text-white font-medium tracking-wide">Initialize Neural Link</span>
                <ArrowRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
      </div>
      
      {/* Cinematic Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] opacity-60" />
    </div>
  );
};

export default LandingPage;
