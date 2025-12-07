import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, Plus, X, Video, Image as ImageIcon, Layout, Monitor, Smartphone, Square, Type, CloudRain, Sparkles, Palette, Wand2, Undo, Redo, Layers, Trash2, Move, ImagePlus, Eye, Bold, Italic, Upload, Music, Scissors, FileText, ArrowRight, Square as StopSquare, Wind, Maximize, Activity, Gauge, Droplets, Bell, PlayCircle, StopCircle, PartyPopper, Database, CheckCircle2, ListVideo, Film, Check } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

interface BlobEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  phaseX: number;
  phaseY: number;
  baseFreqX: number;
  baseFreqY: number;
}

interface WeatherParticle {
  x: number;
  y: number;
  speed: number;
  size: number;
  opacity: number;
  wobble: number; // For snow/confetti sway
  // Confetti specific
  color?: string;
  rotation?: number;
  rotationSpeed?: number;
  tilt?: number;
  tiltSpeed?: number;
}

interface StoredImage {
    id: string;
    src: string; // Base64 data
    prompt: string;
}

// Queue Job Type
interface RenderJob {
    id: string;
    name: string;
    designState: DesignState;
    status: 'pending' | 'processing' | 'done' | 'error';
    thumbnail?: string; // Optional visualization
}

type BlendMode = 'source-over' | 'screen' | 'overlay' | 'multiply' | 'difference' | 'exclusion' | 'hard-light' | 'soft-light';
type AspectRatioKey = '16:9' | '9:16' | '1:1' | '4:5';
type WeatherType = 'none' | 'snow' | 'rain' | 'confetti';
type TextAlign = 'left' | 'center' | 'right';

interface CustomFont {
    name: string;
    url: string;
}

interface TextLayer {
    id: string;
    text: string;
    fontFamily: string;
    fontWeight: string; // '300' | '400' | '800' etc
    fontStyle: string; // 'normal' | 'italic'
    fontSize: number;
    textAlign: TextAlign;
    textColor: string;
    textShadow: boolean;
    x: number; // 0-1 percentage of canvas width
    y: number; // 0-1 percentage of canvas height
    opacity: number;
}

interface LogoLayer {
    image: HTMLImageElement;
    src: string; 
    x: number;
    y: number;
    size: number; 
    opacity: number;
}

// --- Centralized Design State for Undo/Redo ---
interface DesignState {
    duration: number;
    aspectRatio: AspectRatioKey;
    speed: number;
    blurLevel: number;
    blendMode: BlendMode;
    blobOpacity: number;
    colors: string[];
    bgType: 'color' | 'image';
    bgColor: string;
    bgImage: HTMLImageElement | null;
    bgOpacity: number; 
    weatherType: WeatherType;
    weatherDensity: number; // Renamed from intensity
    weatherScale: number; 
    weatherAngle: number; // -45 to 45 degrees
    weatherWobble: number; // 0 to 2 multiplier
    weatherSpeed: number; // Speed multiplier
    weatherOpacity: number; // Opacity multiplier
    textLayers: TextLayer[];
    logo: LogoLayer | null;
    customFonts: CustomFont[];
    audio: File | null;
    audioName: string | null;
    audioDuration: number;
    audioStart: number;
    audioEnd: number;
}

const ASPECT_RATIOS: Record<AspectRatioKey, { w: number, h: number, label: string, icon: React.ReactNode }> = {
  '16:9': { w: 1920, h: 1080, label: 'Landscape', icon: <Monitor size={20} /> },
  '9:16': { w: 1080, h: 1920, label: 'Story', icon: <Smartphone size={20} /> },
  '1:1': { w: 1080, h: 1080, label: 'Square', icon: <Square size={20} /> },
  '4:5': { w: 1080, h: 1350, label: 'Portrait', icon: <Layout size={20} /> },
};

// --- Constants ---

const EXPORT_FPS = 60;

const DEFAULT_COLORS = [
  '#FF0080', // Pink
  '#7928CA', // Purple
  '#0070F3', // Blue
  '#00DFD8', // Cyan
  '#FF4D4D', // Red
];

const INITIAL_TEXT_LAYER: TextLayer = {
    id: '1',
    text: 'Vid Quotes',
    fontFamily: 'Poppins',
    fontWeight: '800',
    fontStyle: 'normal',
    fontSize: 100,
    textAlign: 'center',
    textColor: '#ffffff',
    textShadow: true,
    x: 0.5,
    y: 0.5,
    opacity: 1
};

const INITIAL_DESIGN: DesignState = {
    duration: 10,
    aspectRatio: '16:9',
    speed: 1,
    blurLevel: 120,
    blendMode: 'screen',
    blobOpacity: 1.0,
    colors: [...DEFAULT_COLORS],
    bgType: 'color',
    bgColor: '#000000',
    bgImage: null,
    bgOpacity: 1.0,
    weatherType: 'none',
    weatherDensity: 50,
    weatherScale: 1.0,
    weatherAngle: 0,
    weatherWobble: 1.0,
    weatherSpeed: 1.0,
    weatherOpacity: 1.0,
    textLayers: [INITIAL_TEXT_LAYER],
    logo: null,
    customFonts: [],
    audio: null,
    audioName: null,
    audioDuration: 0,
    audioStart: 0,
    audioEnd: 0
};

// --- Helper Functions ---

const generateBlobs = (colors: string[], width: number, height: number): BlobEntity[] => {
  return colors.map((color) => ({
    id: Math.random().toString(36).substr(2, 9),
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.min(width, height) * (0.4 + Math.random() * 0.4), // Responsive radius
    color,
    phaseX: Math.random() * Math.PI * 2,
    phaseY: Math.random() * Math.PI * 2,
    baseFreqX: Math.ceil(Math.random() * 2), 
    baseFreqY: Math.ceil(Math.random() * 2),
  }));
};

const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const r = Math.max(w / img.width, h / img.height);
    const nw = img.width * r;
    const nh = img.height * r;
    const cx = (w - nw) * 0.5;
    const cy = (h - nh) * 0.5;
    ctx.drawImage(img, cx, cy, nw, nh);
};

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const playNotificationSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Bell/Chime sound
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1); 
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.5);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

        osc.start();
        osc.stop(ctx.currentTime + 1.5);
        
        // Add a secondary harmonic for richness
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1760, ctx.currentTime); // A6
        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc2.start();
        osc2.stop(ctx.currentTime + 1.0);

    } catch (e) {
        console.error("Audio notification failed", e);
    }
};

const createImgFromSrc = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

// --- Main Component ---

const App: React.FC = () => {
  // --- State ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef<number>();
  
  // App Logic State (Not in history)
  const [isPlaying, setIsPlaying] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'visuals' | 'typography' | 'logo' | 'music' | 'weather' | 'ai' | 'quotes' | 'queue'>('visuals');
  
  // Batch/Queue State
  const [renderQueue, setRenderQueue] = useState<RenderJob[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchStatus, setBatchStatus] = useState('');
  const stopBatchRef = useRef(false);

  // Quotes State
  const [quotes, setQuotes] = useState<string[]>([]);
  
  // Image Repository State
  const [imageRepo, setImageRepo] = useState<StoredImage[]>([]);

  // Design State & History
  const [design, setDesign] = useState<DesignState>(INITIAL_DESIGN);
  const [history, setHistory] = useState<DesignState[]>([INITIAL_DESIGN]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // UI Selection State
  const [activeTextLayerId, setActiveTextLayerId] = useState<string>(INITIAL_TEXT_LAYER.id);

  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Derived State
  const currentDims = ASPECT_RATIOS[design.aspectRatio];
  const [blobs, setBlobs] = useState<BlobEntity[]>(() => generateBlobs(DEFAULT_COLORS, 1920, 1080));
  const particlesRef = useRef<WeatherParticle[]>([]);

  // --- STATE REF (Crucial for Batch Rendering) ---
  // Keeps track of the latest state accessible from stale closures/loops
  const stateRef = useRef({ design, blobs, currentDims });
  useEffect(() => {
      stateRef.current = { design, blobs, currentDims };
  }, [design, blobs, currentDims]);

  // --- History Management ---

  const pushToHistory = useCallback((newDesign: DesignState) => {
      const newHistory = history.slice(0, historyIndex + 1);
      // Limit history size to 50
      if (newHistory.length > 50) newHistory.shift();
      newHistory.push(newDesign);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const updateDesign = (updates: Partial<DesignState>, commit = false) => {
      setDesign(prev => {
          const next = { ...prev, ...updates };
          if (commit) pushToHistory(next);
          return next;
      });
  };

  const undo = () => {
      if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1);
          setDesign(history[historyIndex + 1]);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          setHistoryIndex(historyIndex + 1);
          setDesign(history[historyIndex + 1]);
      }
  };

  // Debounced history save for things like text input or sliders if needed
  // For sliders, we usually use onMouseUp to commit
  const handleCommit = () => {
      pushToHistory(design);
  };

  // --- Audio Preview Logic ---
  useEffect(() => {
    if (audioPreviewRef.current) {
        if (design.audio) {
            const url = URL.createObjectURL(design.audio);
            audioPreviewRef.current.src = url;
            // Native loop attribute loops the whole file, but we need custom looping for cut segments
            // so we handle looping manually via onTimeUpdate
            audioPreviewRef.current.loop = false; 
            
            if (isPlaying && !isRecording && !isBatchProcessing) {
                audioPreviewRef.current.currentTime = design.audioStart;
                audioPreviewRef.current.play().catch(e => console.log("Auto-play prevented", e));
            }
            return () => URL.revokeObjectURL(url);
        } else {
            audioPreviewRef.current.pause();
            audioPreviewRef.current.src = "";
        }
    }
  }, [design.audio]); // Only run when audio file changes

  useEffect(() => {
      if (!audioPreviewRef.current || !design.audio) return;
      
      if (isPlaying && !isRecording && !isBatchProcessing) {
          // Check if we are outside the valid range before playing
          if (audioPreviewRef.current.currentTime < design.audioStart || audioPreviewRef.current.currentTime >= design.audioEnd) {
             audioPreviewRef.current.currentTime = design.audioStart;
          }
          audioPreviewRef.current.play().catch(() => {});
      } else {
          audioPreviewRef.current.pause();
      }
  }, [isPlaying, isRecording, design.audioStart, design.audioEnd, isBatchProcessing]);

  // Enforce loop within Start/End
  const handleAudioTimeUpdate = () => {
      if (!audioPreviewRef.current) return;
      if (audioPreviewRef.current.currentTime >= design.audioEnd) {
          audioPreviewRef.current.currentTime = design.audioStart;
          if (isPlaying && !isRecording && !isBatchProcessing) {
            audioPreviewRef.current.play().catch(() => {});
          }
      }
  };

  const handleStop = () => {
      setIsPlaying(false);
      if (audioPreviewRef.current) {
          audioPreviewRef.current.currentTime = design.audioStart;
      }
  };


  // --- Logic for Weather ---

  const initWeather = useCallback(() => {
    // Determine count based on Density
    const count = design.weatherType === 'none' ? 0 : Math.floor(design.weatherDensity * (design.weatherType === 'rain' ? 5 : 2));
    
    const newParticles: WeatherParticle[] = [];
    for (let i = 0; i < count; i++) {
        const p: WeatherParticle = {
            x: Math.random() * currentDims.w,
            y: Math.random() * currentDims.h,
            speed: Math.random() * (design.weatherType === 'rain' ? 20 : 2) + (design.weatherType === 'rain' ? 10 : 0.5),
            size: Math.random() * (design.weatherType === 'rain' ? 3 : 5) + 1,
            opacity: Math.random() * 0.5 + 0.3,
            wobble: Math.random() * Math.PI * 2
        };

        // Confetti specifics
        if (design.weatherType === 'confetti') {
             // Use palette colors if available, else standard confetti colors
             const palette = design.colors.length > 0 ? design.colors : ['#FFC700', '#FF0000', '#2E3192', '#41BBC7'];
             p.color = palette[Math.floor(Math.random() * palette.length)];
             p.rotation = Math.random() * Math.PI * 2;
             p.rotationSpeed = (Math.random() - 0.5) * 0.2;
             p.tilt = Math.random() * Math.PI;
             p.tiltSpeed = Math.random() * 0.1 + 0.05;
             p.size = Math.random() * 8 + 6; // Bigger than rain/snow
             p.speed = p.speed * 1.5; // Slightly faster fall
        }

        newParticles.push(p);
    }
    particlesRef.current = newParticles;
  }, [design.weatherType, design.weatherDensity, currentDims, design.colors]);

  useEffect(() => {
    initWeather();
  }, [initWeather]);

  // --- Logic for AI Generation ---
  
  const generateAiData = async (prompt: string): Promise<string> => {
     if (!prompt) throw new Error("Prompt is empty");
     
     const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
     const finalPrompt = `Generate a high quality image of ${prompt}, realistic style, high resolution, atmospheric, 8k, cinematic lighting`;

     const response = await ai.models.generateContent({
         model: 'gemini-2.5-flash-image',
         contents: { parts: [{ text: finalPrompt }] },
     });

     let base64Image = '';
     if (response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
             if (part.inlineData) {
                 base64Image = part.inlineData.data;
                 break;
             }
          }
     }

     if (!base64Image) {
         throw new Error(`No image generated.`);
     }
     return `data:image/png;base64,${base64Image}`;
  };

  // 1. Generate & Add to Repository
  const handleGenerateToRepo = async () => {
      if (!aiPrompt.trim()) {
          alert("Please enter a description first.");
          return;
      }
      setIsGenerating(true);
      try {
          const src = await generateAiData(aiPrompt);
          const newImg: StoredImage = {
              id: Math.random().toString(36).substr(2, 9),
              src,
              prompt: aiPrompt
          };
          setImageRepo(prev => [...prev, newImg]);
          setAiPrompt(''); // clear prompt after success
      } catch (e) {
          console.error(e);
          alert(e instanceof Error ? e.message : "AI Generation Failed");
      } finally {
          setIsGenerating(false);
      }
  };

  // 2. Generate & Apply Immediately (For testing)
  const handleApplyNow = async () => {
      if (!aiPrompt.trim()) {
          alert("Please enter a description first.");
          return;
      }
      setIsGenerating(true);
      try {
         const src = await generateAiData(aiPrompt);
         const img = await createImgFromSrc(src);
         updateDesign({ bgImage: img, bgType: 'image' }, true);
      } catch (e) {
          console.error(e);
          alert("Failed to generate and apply.");
      } finally {
          setIsGenerating(false);
      }
  };


  // --- Animation Engine ---

  const drawTextLayers = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Use fresh design from ref if available, else fallback to prop (safeguard)
    const activeDesign = stateRef.current.design;
    
    activeDesign.textLayers.forEach(layer => {
        if (!layer.text) return;

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = layer.opacity;
        
        // Scale font based on canvas width
        const scaleFactor = w / 1920; 
        const finalFontSize = layer.fontSize * scaleFactor;
        
        // Font format: [style] [weight] [size] [family]
        ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${finalFontSize}px "${layer.fontFamily}"`;
        ctx.fillStyle = layer.textColor;
        ctx.textAlign = layer.textAlign;
        ctx.textBaseline = 'middle';
        
        if (layer.textShadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 20 * scaleFactor;
            ctx.shadowOffsetX = 4 * scaleFactor;
            ctx.shadowOffsetY = 4 * scaleFactor;
        }

        // TEXT WRAPPING LOGIC
        const maxWidth = w * 0.9; // 90% of canvas width to stay inside
        const paragraphs = layer.text.split('\n');
        let lines: string[] = [];

        paragraphs.forEach(paragraph => {
            const words = paragraph.split(' ');
            let currentLine = words[0];

            for (let i = 1; i < words.length; i++) {
                const word = words[i];
                const width = ctx.measureText(currentLine + " " + word).width;
                if (width < maxWidth) {
                    currentLine += " " + word;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
        });

        const lineHeight = finalFontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        
        // Calculate Position
        const centerX = layer.x * w;
        const centerY = layer.y * h;

        // Adjust starting Y to center the block of text around centerY
        let startY = centerY - (totalHeight / 2) + (lineHeight / 2);

        lines.forEach((line) => {
            ctx.fillText(line, centerX, startY);
            startY += lineHeight;
        });

        ctx.restore();
    });
  };

  const drawLogo = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const activeDesign = stateRef.current.design;
      if (!activeDesign.logo || !activeDesign.logo.image) return;
      const { logo } = activeDesign;
      
      ctx.save();
      ctx.globalAlpha = logo.opacity;
      
      const imgW = logo.image.width;
      const imgH = logo.image.height;
      const aspect = imgW / imgH;
      
      // Calculate target size (based on width percentage of canvas)
      const targetW = w * logo.size;
      const targetH = targetW / aspect;
      
      const targetX = (logo.x * w) - (targetW / 2);
      const targetY = (logo.y * h) - (targetH / 2);

      ctx.drawImage(logo.image, targetX, targetY, targetW, targetH);
      ctx.restore();
  }

  const drawWeather = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const activeDesign = stateRef.current.design;
    if (activeDesign.weatherType === 'none') return;
    
    // Determine blend mode: Screen for light particles, source-over for colored/opaque confetti
    ctx.save();
    ctx.globalCompositeOperation = activeDesign.weatherType === 'confetti' ? 'source-over' : 'screen';
    
    // Angle in radians
    const angleRad = (activeDesign.weatherAngle * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    particlesRef.current.forEach(p => {
        // Base movement down vector
        // Modified by angle AND global speed
        const currentSpeed = p.speed * activeDesign.weatherSpeed;

        p.y += currentSpeed * cosA; 
        p.x += currentSpeed * sinA;

        // Apply Opacity
        const finalOpacity = Math.max(0, Math.min(1, p.opacity * activeDesign.weatherOpacity));

        if (activeDesign.weatherType === 'snow') {
            p.x += Math.sin(p.wobble) * 0.5 * activeDesign.weatherWobble;
            p.wobble += 0.05;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${finalOpacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * activeDesign.weatherScale, 0, Math.PI * 2);
            ctx.fill();

        } else if (activeDesign.weatherType === 'rain') {
             p.x += (Math.random() - 0.5) * 0.5 * activeDesign.weatherWobble;
             
             ctx.fillStyle = `rgba(255, 255, 255, ${finalOpacity})`;
             ctx.save();
             ctx.translate(p.x, p.y);
             ctx.rotate(-angleRad); // Rotate to match fall angle
             ctx.beginPath();
             ctx.rect(0, 0, 1 * Math.max(0.5, activeDesign.weatherScale * 0.5), p.size * activeDesign.weatherScale * 5);
             ctx.fill();
             ctx.restore();

        } else if (activeDesign.weatherType === 'confetti') {
             p.x += Math.sin(p.wobble) * 2 * activeDesign.weatherWobble;
             p.wobble += 0.1;
             
             // Tumbling physics
             p.rotation = (p.rotation || 0) + (p.rotationSpeed || 0);
             p.tilt = (p.tilt || 0) + (p.tiltSpeed || 0);

             ctx.save();
             ctx.translate(p.x, p.y);
             ctx.rotate(p.rotation || 0);
             
             // 3D Tilt effect using scale Y
             // We use absolute value or shift phase to keep it visible
             const tiltScale = Math.cos(p.tilt || 0);
             ctx.scale(1, tiltScale);
             
             ctx.globalAlpha = finalOpacity;
             ctx.fillStyle = p.color || '#ffffff';
             
             const size = p.size * activeDesign.weatherScale;
             ctx.fillRect(-size/2, -size/2, size, size);
             
             ctx.restore();
        }

        // Wrap around logic with margin for angle
        if (p.y > h + 50) {
            p.y = -50;
            p.x = Math.random() * w;
        } else if (p.y < -50) {
             p.y = h + 50;
             p.x = Math.random() * w;
        }
        
        if (p.x > w + 50) {
            p.x = -50;
            p.y = Math.random() * h;
        } else if (p.x < -50) {
            p.x = w + 50;
            p.y = Math.random() * h;
        }
    });
    ctx.restore();
  };

  const draw = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
    // IMPORTANT: Use state from Ref to ensure we are always drawing the LATEST state
    // even inside stale closures (like the Batch export loop)
    const { design: activeDesign, blobs: activeBlobs, currentDims: activeDims } = stateRef.current;
    const { w, h } = activeDims;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);
    
    // 1. Draw Background
    // Base solid black to ensure opacity changes fade to black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Draw active background with opacity
    ctx.save();
    ctx.globalAlpha = activeDesign.bgOpacity; // Apply background opacity

    if (activeDesign.bgType === 'color') {
        ctx.fillStyle = activeDesign.bgColor;
        ctx.fillRect(0, 0, w, h);
    } else if (activeDesign.bgType === 'image' && activeDesign.bgImage) {
        drawImageCover(ctx, activeDesign.bgImage, 0, 0, w, h);
    } 
    // If neither, the base black remains

    ctx.restore();

    // 2. Apply Wave/Blobs
    ctx.save(); // Save before blur/blend
    ctx.filter = `blur(${activeDesign.blurLevel}px)`;
    ctx.globalCompositeOperation = activeDesign.blendMode;
    ctx.globalAlpha = activeDesign.blobOpacity; // Apply Visual Opacity

    // --- DECOUPLED SPEED & DURATION LOGIC ---
    // Base frequency target (in Hz): 
    const baseHz = 0.5; 
    const targetFreq = activeDesign.speed * baseHz; 
    
    activeBlobs.forEach((blob) => {
        // Base cycles for this specific blob based on its random seed
        const blobBaseCycles = blob.baseFreqX; 
        
        // Calculate ideal total cycles for this blob over the full duration
        const idealTotalCycles = blobBaseCycles * targetFreq * activeDesign.duration;
        
        // Round to nearest integer (min 1) to ensure perfect loop
        const effectiveTotalCycles = Math.max(1, Math.round(idealTotalCycles));
        
        // Calculate t (0 to 1) for the current frame in the loop
        // time is in ms, duration is in s
        const loopProgress = (time % (activeDesign.duration * 1000)) / (activeDesign.duration * 1000);
        
        // Angle = progress * 2PI * totalCycles
        const angle = loopProgress * Math.PI * 2 * effectiveTotalCycles;

        // Apply similar logic for Y (using baseFreqY)
        const idealTotalCyclesY = blob.baseFreqY * targetFreq * activeDesign.duration;
        const effectiveTotalCyclesY = Math.max(1, Math.round(idealTotalCyclesY));
        const angleY = loopProgress * Math.PI * 2 * effectiveTotalCyclesY;

        const offsetX = Math.sin(angle + blob.phaseX) * (w * 0.35);
        const offsetY = Math.cos(angleY + blob.phaseY) * (h * 0.35);

        const x = (w / 2) + offsetX;
        const y = (h / 2) + offsetY;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, blob.radius);
        gradient.addColorStop(0, blob.color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, blob.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore(); // Restore after blur/blend

    // 3. Draw Weather (Crisp)
    drawWeather(ctx, w, h);

    // 4. Draw Logo
    drawLogo(ctx, w, h);

    // 5. Draw Typography (Crisp)
    drawTextLayers(ctx, w, h);

  }, []); // Empty deps - purely ref based

  const animate = useCallback((time: number) => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d', { alpha: false });
      if (ctx) {
        draw(ctx, time);
      }
    }
    if (isPlaying && !isRecording && !isBatchProcessing) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [draw, isPlaying, isRecording, isBatchProcessing]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);

  useEffect(() => {
     setBlobs(generateBlobs(design.colors, currentDims.w, currentDims.h));
     initWeather();
  }, [design.aspectRatio, design.colors, initWeather]); 

  // --- Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'bg' | 'logo') => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                if (type === 'bg') {
                    updateDesign({ bgImage: img, bgType: 'image' }, true);
                } else {
                    updateDesign({ 
                        logo: { 
                            image: img, 
                            src: img.src,
                            x: 0.5, 
                            y: 0.5, 
                            size: 0.2, 
                            opacity: 1 
                        } 
                    }, true);
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const url = URL.createObjectURL(file);
          const tempAudio = new Audio(url);
          // Wait for metadata to get duration
          tempAudio.addEventListener('loadedmetadata', () => {
              updateDesign({ 
                  audio: file, 
                  audioName: file.name,
                  audioDuration: tempAudio.duration,
                  audioStart: 0,
                  audioEnd: tempAudio.duration
              }, true);
              URL.revokeObjectURL(url);
          });
      }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const fontName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, ''); // Clean name
      const reader = new FileReader();
      
      reader.onload = async (event) => {
          if (event.target?.result) {
              try {
                  const fontData = event.target.result as ArrayBuffer;
                  const fontFace = new FontFace(fontName, fontData);
                  await fontFace.load();
                  document.fonts.add(fontFace);
                  
                  // Add to design state and set active layer to this font
                  const newFonts = [...design.customFonts, { name: fontName, url: '' }]; // URL not strictly needed for FontFace obj but good for reference if persistent
                  updateDesign({ customFonts: newFonts });
                  updateActiveLayer({ fontFamily: fontName });
                  handleCommit();
              } catch (err) {
                  console.error("Failed to load font", err);
                  alert("Could not load font. Please ensure it is a valid TTF, OTF, or WOFF file.");
              }
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleQuoteUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
          if (event.target?.result) {
              const text = event.target.result as string;
              // Split by new line, filter out empty lines
              const newQuotes = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
              setQuotes(prev => [...prev, ...newQuotes]);
              // Reset file input
              e.target.value = '';
          }
      };
      reader.readAsText(file);
  };

  const loadNextQuote = () => {
      if (quotes.length > 0) {
          const nextQuote = quotes[0];
          updateActiveLayer({ text: nextQuote });
          handleCommit();
          // We don't remove it here yet, we remove it on Export success
      }
  };

  const loadQuoteFromQueue = (index: number) => {
      if (quotes[index]) {
          updateActiveLayer({ text: quotes[index] });
          handleCommit();
      }
  };

  const handleColorChange = (index: number, newColor: string) => {
    const newColors = [...design.colors];
    newColors[index] = newColor;
    updateDesign({ colors: newColors });
  };

  const addColor = () => {
    if (design.colors.length < 8) {
      updateDesign({ colors: [...design.colors, '#ffffff'] }, true);
    }
  };

  const removeColor = (index: number) => {
    if (design.colors.length > 2) {
      const newColors = design.colors.filter((_, i) => i !== index);
      updateDesign({ colors: newColors }, true);
    }
  };

  const regeneratePositions = () => {
    setBlobs(generateBlobs(design.colors, currentDims.w, currentDims.h));
  };

  const toggleAspectRatio = () => {
    const keys = Object.keys(ASPECT_RATIOS) as AspectRatioKey[];
    const currentIndex = keys.indexOf(design.aspectRatio);
    const nextIndex = (currentIndex + 1) % keys.length;
    updateDesign({ aspectRatio: keys[nextIndex] }, true);
  };

  // --- Text Layer Handlers ---
  const getActiveLayer = () => design.textLayers.find(l => l.id === activeTextLayerId) || design.textLayers[0];

  const updateActiveLayer = (updates: Partial<TextLayer>) => {
      const newLayers = design.textLayers.map(l => 
          l.id === activeTextLayerId ? { ...l, ...updates } : l
      );
      updateDesign({ textLayers: newLayers });
  };

  const addTextLayer = () => {
      const newLayer = { ...INITIAL_TEXT_LAYER, id: Math.random().toString(36).substr(2, 9), text: 'New Text', y: 0.5 + (design.textLayers.length * 0.1) };
      const newLayers = [...design.textLayers, newLayer];
      updateDesign({ textLayers: newLayers }, true);
      setActiveTextLayerId(newLayer.id);
  };

  const removeTextLayer = (id: string) => {
      if (design.textLayers.length <= 1) return;
      const newLayers = design.textLayers.filter(l => l.id !== id);
      updateDesign({ textLayers: newLayers }, true);
      setActiveTextLayerId(newLayers[newLayers.length - 1].id);
  };

  // --- Logo Handlers ---
  const updateLogo = (updates: Partial<LogoLayer>) => {
      if (!design.logo) return;
      updateDesign({ logo: { ...design.logo, ...updates } });
  };

  const removeLogo = () => {
      updateDesign({ logo: null }, true);
  }

  // --- Recording Logic (Real-Time for Audio Sync) ---

  const startRecording = async (customFilenameSuffix: string = '') => {
      if (!canvasRef.current) return;
      
      // Access design from ref to ensure fresh data during batch operations
      const currentDesign = stateRef.current.design;

      return new Promise<void>(async (resolve, reject) => {
          setIsRecording(true);
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(); return; }

          const mimeType = MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') 
              ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' 
              : 'video/webm; codecs=vp9';

          let audioTracks: MediaStreamTrack[] = [];
          let audioSource: AudioBufferSourceNode | null = null;
          let audioCtx: AudioContext | null = null;

          if (currentDesign.audio) {
            try {
                audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const arrayBuffer = await currentDesign.audio.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                
                const dest = audioCtx.createMediaStreamDestination();
                audioSource = audioCtx.createBufferSource();
                audioSource.buffer = audioBuffer;
                audioSource.loop = true; 
                audioSource.loopStart = currentDesign.audioStart;
                audioSource.loopEnd = currentDesign.audioEnd;
                audioSource.connect(dest);
                audioTracks = dest.stream.getAudioTracks();
            } catch (e) {
                console.error("Audio mixing failed", e);
            }
          }

          const canvasStream = canvas.captureStream(EXPORT_FPS);
          const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioTracks
          ]);

          const recorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: 5000000 
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quote-vid-${customFilenameSuffix || Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
            a.click();
            URL.revokeObjectURL(url);
            
            if (audioSource) audioSource.stop();
            if (audioCtx) audioCtx.close();
            
            setIsRecording(false);
            setRecordingProgress(0);
            playNotificationSound();
            resolve();
          };

          recorder.start();
          if (audioSource) audioSource.start(0, currentDesign.audioStart);

          const startTime = performance.now();
          const durationMs = currentDesign.duration * 1000;
          
          const recordTick = (now: number) => {
            const elapsed = now - startTime;
            if (elapsed >= durationMs) {
                recorder.stop();
                return;
            }
            draw(ctx, elapsed);
            setRecordingProgress(Math.min(100, Math.round((elapsed / durationMs) * 100)));
            requestAnimationFrame(recordTick);
          };

          requestAnimationFrame(recordTick);
      });
  };

  const handleExport = async () => {
    setIsPlaying(false);
    await startRecording();
    setIsPlaying(true);
    
    // Original behavior: Remove current quote from queue
    const renderedText = getActiveLayer().text.trim();
    setQuotes(prevQuotes => {
        const index = prevQuotes.findIndex(q => q.trim() === renderedText);
        if (index !== -1) {
            const newQuotes = [...prevQuotes];
            newQuotes.splice(index, 1);
            return newQuotes;
        }
        return prevQuotes;
    });
  };

  // --- Queue / Batch Render Logic ---

  const addToQueue = () => {
      // Create a snapshot of the current design state
      // Note: We need to be careful with object references. 
      // HTMLImageElement and File are objects we want to preserve references to,
      // but arrays like textLayers need deep copies.
      const snapshot: DesignState = {
          ...design,
          textLayers: design.textLayers.map(l => ({ ...l })),
          colors: [...design.colors],
          customFonts: [...design.customFonts],
          // Keep references to Audio File and Image Element
      };

      const jobName = snapshot.textLayers.find(l => l.text)?.text.substring(0, 20) || "Untitled";

      const newJob: RenderJob = {
          id: Math.random().toString(36).substr(2, 9),
          name: jobName,
          designState: snapshot,
          status: 'pending'
      };

      setRenderQueue(prev => [...prev, newJob]);
      setActiveTab('queue');
  };

  const startBatchExport = async () => {
      // Filter out only pending jobs at the start
      const pendingJobs = renderQueue.filter(j => j.status === 'pending');
      
      if (pendingJobs.length === 0) {
          alert("No pending jobs in queue.");
          return;
      }

      setIsBatchProcessing(true);
      setIsPlaying(false);
      stopBatchRef.current = false;

      // We use a traditional loop over the captured list of pending jobs.
      // Even though renderQueue state might change (items deleted), we iterate over the initial snapshot.
      for (let i = 0; i < pendingJobs.length; i++) {
          if (stopBatchRef.current) break;
          
          const job = pendingJobs[i];
          const displayIndex = i + 1;
          const total = pendingJobs.length;

          setBatchStatus(`Processing ${displayIndex}/${total}: ${job.name}`);

          try {
              // 1. Load Design State
              setDesign(job.designState);
              
              // 2. Wait for visual update (Canvas repaint & Ref update)
              // This delay allows React to render the new state, and the useEffect to update stateRef.
              await new Promise(r => setTimeout(r, 2000));
              
              if (stopBatchRef.current) break;

              // 3. Start Recording
              const cleanName = job.name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
              // startRecording now uses stateRef.current, so it grabs the correct (just updated) design
              await startRecording(`${displayIndex}-${cleanName}`);

              // 4. Cleanup: Remove from Queue & Remove Quote
              // Remove specific job ID from queue
              setRenderQueue(prev => prev.filter(j => j.id !== job.id));
              
              // Remove Quote text from quotes list
              const mainText = job.designState.textLayers.find(l => l.text)?.text;
              if (mainText) {
                  setQuotes(prev => prev.filter(q => q.trim() !== mainText.trim()));
              }

              // Cool down
              await new Promise(r => setTimeout(r, 1000));

          } catch (e) {
              console.error("Batch Error", e);
              setBatchStatus(`Error on ${job.name}`);
              // Mark error visually if we decided not to remove it? 
              // Since logic is to remove only on success, error items stick around.
              setRenderQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error' } : j));
              await new Promise(r => setTimeout(r, 2000));
          }
      }

      setIsBatchProcessing(false);
      setIsPlaying(true);
      setBatchStatus('');
      
      // Only show alert if we actually finished everything in the pending list
      if (!stopBatchRef.current) {
         alert("Batch Export Complete!");
      }
  };
  
  const stopBatch = () => {
      stopBatchRef.current = true;
      setBatchStatus('Stopping after current job...');
  };
  
  const removeJob = (id: string) => {
      setRenderQueue(prev => prev.filter(j => j.id !== id));
  };
  
  const clearQueue = () => {
      if(confirm("Clear all jobs?")) setRenderQueue([]);
  };

  const activeLayer = getActiveLayer();

  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 text-white font-sans overflow-hidden">
      
      <audio ref={audioPreviewRef} className="hidden" onTimeUpdate={handleAudioTimeUpdate} />

      {/* --- TOP HEADER --- */}
      <div className="h-16 shrink-0 bg-gray-850/90 backdrop-blur border-b border-gray-750 flex items-center justify-between px-4 lg:px-8 z-20 shadow-xl relative">
          
          {/* Left: Logo & Undo/Redo */}
          <div className="flex items-center gap-6">
            <div className="font-bold text-xl tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent min-w-[100px]">
                Vid Quotes Maker
            </div>
            <div className="flex items-center gap-2 border-l border-gray-700 pl-6">
                <button onClick={undo} disabled={historyIndex === 0 || isBatchProcessing} className="p-2 rounded hover:bg-gray-700 text-gray-400 disabled:opacity-30">
                    <Undo size={18} />
                </button>
                <button onClick={redo} disabled={historyIndex === history.length - 1 || isBatchProcessing} className="p-2 rounded hover:bg-gray-700 text-gray-400 disabled:opacity-30">
                    <Redo size={18} />
                </button>
            </div>
            {/* Quick Actions */}
            <div className="ml-4 flex items-center gap-2">
                <button 
                    onClick={loadNextQuote} 
                    disabled={quotes.length === 0 || isRecording || isBatchProcessing}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                        ${quotes.length > 0 ? 'bg-blue-500/10 border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white' : 'border-gray-700 text-gray-600 cursor-not-allowed'}
                    `}
                    title="Load next quote from queue"
                >
                    <ArrowRight size={14} /> Next Quote ({quotes.length})
                </button>
                <button 
                    onClick={handleGenerateToRepo}
                    disabled={isGenerating || !aiPrompt || isRecording || isBatchProcessing}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                        ${isGenerating ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'bg-purple-500/10 border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white'}
                    `}
                    title="Generate background using current prompt"
                >
                   {isGenerating ? <RefreshCw className="animate-spin" size={14} /> : <Wand2 size={14} />} 
                   {isGenerating ? 'Generating...' : 'Magic BG'}
                </button>
            </div>
          </div>

          {/* Center: Aspect Ratio Toggle */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
             <button
                 onClick={toggleAspectRatio}
                 className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-all border border-gray-700 group flex items-center gap-2"
                 disabled={isRecording || isBatchProcessing}
                 title={`Current: ${ASPECT_RATIOS[design.aspectRatio].label}`}
             >
                 {ASPECT_RATIOS[design.aspectRatio].icon}
                 <span className="hidden md:block text-xs font-medium text-gray-400 group-hover:text-gray-200">
                     {design.aspectRatio}
                 </span>
             </button>
          </div>

          {/* Right: Primary Controls */}
          <div className="flex items-center gap-3">
             <button 
                 onClick={() => setIsPlaying(!isPlaying)}
                 className="p-2.5 rounded-full hover:bg-gray-700 text-gray-300 transition-colors"
                 title={isPlaying ? "Pause" : "Play"}
                 disabled={isRecording || isBatchProcessing}
             >
                 {isPlaying ? <Pause size={20} /> : <Play size={20} />}
             </button>
             
             {/* ADD TO QUEUE BUTTON */}
             <button 
                 onClick={addToQueue}
                 disabled={isRecording || isBatchProcessing}
                 className="h-9 px-4 rounded-full flex items-center gap-2 font-semibold text-sm transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95"
                 title="Add current setup to Render Queue"
             >
                 <ListVideo size={16} />
                 <span className="hidden sm:inline">Add to Queue</span>
             </button>

             <button 
                onClick={handleExport}
                disabled={isRecording || isBatchProcessing}
                className={`
                    h-9 px-4 rounded-full flex items-center gap-2 font-semibold text-sm transition-all shadow-lg
                    ${isRecording || isBatchProcessing
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-white text-black hover:bg-gray-200 active:scale-95'
                    }
                `}
            >
                {isRecording ? <RefreshCw className="animate-spin" size={16} /> : <Video size={16} />}
                <span className="hidden sm:inline">{isRecording ? 'Exporting...' : 'Export 1'}</span>
            </button>
          </div>
      </div>

      {/* --- CANVAS AREA --- */}
      <div className="flex-1 relative flex items-center justify-center bg-[#0d1117] p-4 lg:p-8 overflow-hidden">
        {/* Aspect Ratio Container */}
        <div 
            className="relative shadow-2xl rounded-lg overflow-hidden border border-gray-800 transition-all duration-300 ease-in-out bg-black group"
            style={{ 
                aspectRatio: `${currentDims.w}/${currentDims.h}`,
                height: currentDims.h > currentDims.w ? '90%' : 'auto',
                width: currentDims.w >= currentDims.h ? '90%' : 'auto',
                maxWidth: '100%',
                maxHeight: '100%'
            }}
        >
            <canvas
                ref={canvasRef}
                width={currentDims.w}
                height={currentDims.h}
                className="w-full h-full object-contain"
            />
            
            {/* Play/Stop Overlay */}
            {!isRecording && !isBatchProcessing && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-30 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                    <div className="bg-black/60 backdrop-blur-md rounded-full p-2 border border-white/10 shadow-2xl flex items-center gap-1">
                        <button 
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-3 rounded-full hover:bg-white/20 text-white transition-all hover:scale-110 active:scale-95"
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <div className="w-px h-6 bg-white/20 mx-1"></div>
                        <button 
                            onClick={handleStop}
                            className="p-3 rounded-full hover:bg-white/20 text-red-400 hover:text-red-300 transition-all hover:scale-110 active:scale-95"
                            title="Stop & Reset"
                        >
                            <StopSquare size={24} fill="currentColor" />
                        </button>
                    </div>
                </div>
            )}

            {/* Recording / Batch Overlay */}
            {(isRecording || isBatchProcessing) && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
                    <div className="text-3xl font-bold mb-4 animate-pulse text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                        {isBatchProcessing ? 'Batch Exporting' : 'Rendering'}
                    </div>
                    {isBatchProcessing && (
                         <div className="text-sm font-mono text-gray-300 mb-4 bg-gray-800 px-3 py-1 rounded-full border border-gray-600">
                             {batchStatus}
                         </div>
                    )}
                    <div className="text-5xl font-black text-white mb-6">
                        {recordingProgress}%
                    </div>
                    <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                        <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-75 ease-linear"
                            style={{ width: `${recordingProgress}%` }}
                        />
                    </div>
                     {isBatchProcessing && (
                        <button onClick={stopBatch} className="mt-8 text-xs text-red-400 hover:text-red-300 underline">
                            Cancel Batch
                        </button>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* --- BOTTOM SETTINGS PANEL --- */}
      <div className="shrink-0 bg-gray-900 border-t border-gray-800 z-10 overflow-y-auto max-h-[40vh]">
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 px-4">
            <button onClick={() => setActiveTab('visuals')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'visuals' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <Palette size={14} /> Visuals
            </button>
            <button onClick={() => setActiveTab('typography')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'typography' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <Type size={14} /> Typography
            </button>
            <button onClick={() => setActiveTab('logo')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'logo' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <ImagePlus size={14} /> Logo
            </button>
            <button onClick={() => setActiveTab('music')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'music' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <Music size={14} /> Music
            </button>
            <button onClick={() => setActiveTab('weather')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'weather' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <CloudRain size={14} /> Weather
            </button>
            <button onClick={() => setActiveTab('ai')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'ai' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <Wand2 size={14} /> AI Gen
            </button>
            <button onClick={() => setActiveTab('quotes')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'quotes' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                <FileText size={14} /> Quotes
            </button>
            <button onClick={() => setActiveTab('queue')} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'queue' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-transparent text-indigo-400 hover:text-indigo-300'}`}>
                <ListVideo size={14} /> Ready to Render <span className="ml-1 bg-indigo-600 text-white text-[10px] px-1.5 rounded-full">{renderQueue.filter(j=>j.status === 'pending').length}</span>
            </button>
        </div>

        <div className="p-6 max-w-7xl mx-auto min-h-[220px]">
            
            {/* TAB: VISUALS */}
            {activeTab === 'visuals' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                        <div className="flex justify-between"><label className="text-xs text-gray-400 font-bold uppercase">Speed</label><span className="text-xs text-gray-500">{design.speed.toFixed(1)}x</span></div>
                        <input type="range" min="0.1" max="4.0" step="0.1" value={design.speed} onChange={(e) => updateDesign({ speed: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        
                        <div className="flex justify-between pt-2"><label className="text-xs text-gray-400 font-bold uppercase">Duration</label><span className="text-xs text-gray-500">{design.duration}s</span></div>
                        <input type="range" min="5" max="90" step="1" value={design.duration} onChange={(e) => updateDesign({ duration: parseInt(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        <p className="text-[10px] text-gray-500 italic">Speed is now independent of duration.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <div className="flex justify-between mb-2"><label className="text-xs text-gray-400 font-bold uppercase">Blur</label><span className="text-xs text-gray-500">{design.blurLevel}px</span></div>
                                <input type="range" min="0" max="300" step="10" value={design.blurLevel} onChange={(e) => updateDesign({ blurLevel: parseInt(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                             </div>
                             <div>
                                <div className="flex justify-between mb-2"><label className="text-xs text-gray-400 font-bold uppercase">Blob Opacity</label><span className="text-xs text-gray-500">{(design.blobOpacity * 100).toFixed(0)}%</span></div>
                                <input type="range" min="0" max="1" step="0.05" value={design.blobOpacity} onChange={(e) => updateDesign({ blobOpacity: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                             </div>
                        </div>
                        
                        <div className="flex gap-4 pt-2">
                             <div className="flex-1">
                                <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Blend</label>
                                <select value={design.blendMode} onChange={(e) => updateDesign({ blendMode: e.target.value as BlendMode }, true)} disabled={isRecording || isBatchProcessing} className="w-full bg-gray-800 text-xs border border-gray-700 rounded px-2 py-1.5 text-gray-300"><option value="source-over">Normal</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="soft-light">Soft</option><option value="multiply">Multiply</option></select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Bg Type</label>
                                <div className="flex gap-2">
                                    {design.bgType === 'color' ? (
                                        <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded px-2 py-1 border border-gray-700">
                                            <input type="color" value={design.bgColor} onChange={(e) => updateDesign({ bgColor: e.target.value })} onBlur={handleCommit} className="w-5 h-5 rounded-full cursor-pointer bg-transparent" />
                                            <button onClick={() => updateDesign({ bgType: 'image' }, true)} className="text-[10px] text-gray-400 ml-auto">Img</button>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded px-2 py-1 border border-gray-700 overflow-hidden relative">
                                            <label className="cursor-pointer flex items-center gap-2 w-full">
                                                <div className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center"><ImageIcon size={12} /></div>
                                                <span className="text-[10px] text-gray-300 truncate">{design.bgImage ? 'Set' : 'Up'}</span>
                                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'bg')} className="hidden" />
                                            </label>
                                            <button onClick={() => updateDesign({ bgType: 'color' }, true)} className="text-[10px] text-gray-400 absolute right-2 bg-gray-800 pl-2">Col</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div>
                             <div className="flex justify-between mb-2"><label className="text-xs text-gray-400 font-bold uppercase">Background Opacity</label><span className="text-xs text-gray-500">{(design.bgOpacity * 100).toFixed(0)}%</span></div>
                             <input type="range" min="0" max="1" step="0.05" value={design.bgOpacity} onChange={(e) => updateDesign({ bgOpacity: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                        </div>
                    </div>

                    <div className="space-y-2">
                         <div className="flex justify-between items-center mb-1"><span className="text-xs text-gray-400 font-bold uppercase">Palette</span><span className="text-[10px] text-gray-500">{design.colors.length}</span></div>
                        <div className="flex flex-wrap gap-3">
                            {design.colors.map((color, index) => (
                                <div key={index} className="relative group">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-700 hover:border-gray-500 transition-colors shadow-sm">
                                        <input type="color" value={color} onChange={(e) => handleColorChange(index, e.target.value)} onBlur={handleCommit} className="w-[150%] h-[150%] -m-[25%] cursor-pointer p-0 border-none" disabled={isRecording || isBatchProcessing} />
                                    </div>
                                    {design.colors.length > 2 && <button onClick={() => removeColor(index)} disabled={isRecording || isBatchProcessing} className="absolute -top-1 -right-1 bg-gray-900 text-gray-400 hover:text-red-400 rounded-full p-0.5 opacity-0 group-hover:opacity-100 border border-gray-700"><X size={10} /></button>}
                                </div>
                            ))}
                            {design.colors.length < 8 && <button onClick={addColor} disabled={isRecording || isBatchProcessing} className="w-10 h-10 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-500 hover:text-white"><Plus size={16} /></button>}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: TYPOGRAPHY */}
            {activeTab === 'typography' && (
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    
                    {/* Layer List */}
                    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-800 flex flex-col gap-2 h-full max-h-[200px] overflow-y-auto">
                        <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-xs font-bold text-gray-400 uppercase">Layers</span>
                            <button onClick={addTextLayer} disabled={isRecording || isBatchProcessing} className="p-1 hover:bg-gray-700 rounded text-blue-400"><Plus size={14} /></button>
                        </div>
                        {design.textLayers.map((layer, i) => (
                            <div key={layer.id} 
                                onClick={() => setActiveTextLayerId(layer.id)}
                                className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer border ${layer.id === activeTextLayerId ? 'bg-gray-700 border-blue-500/50' : 'hover:bg-gray-800 border-transparent'}`}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    <span className="text-gray-500 font-mono">{i+1}</span>
                                    <span className="truncate max-w-[100px]">{layer.text || 'Empty'}</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); removeTextLayer(layer.id); }} disabled={isRecording || isBatchProcessing} className="text-gray-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>

                    {/* Layer Editor */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-xs text-gray-400 font-bold uppercase">Text Content</label>
                                {quotes.length > 0 && (
                                    <button 
                                        onClick={loadNextQuote}
                                        disabled={isRecording || isBatchProcessing}
                                        className="text-[10px] flex items-center gap-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-2 py-1 rounded transition-colors"
                                    >
                                        Load Next Quote ({quotes.length}) <ArrowRight size={10} />
                                    </button>
                                )}
                            </div>
                            <textarea 
                                value={activeLayer.text} 
                                onChange={(e) => updateActiveLayer({ text: e.target.value })} 
                                onBlur={handleCommit}
                                disabled={isRecording || isBatchProcessing}
                                placeholder="Enter text..." 
                                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-blue-500 focus:outline-none resize-none placeholder-gray-500"
                            />
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => { updateActiveLayer({ fontWeight: activeLayer.fontWeight === '300' ? '400' : '300' }); handleCommit(); }}
                                    disabled={isRecording || isBatchProcessing}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium border ${activeLayer.fontWeight === '300' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-gray-700 hover:bg-gray-700 text-gray-400'}`}
                                >
                                    Light
                                </button>
                                <button 
                                    onClick={() => { updateActiveLayer({ fontWeight: activeLayer.fontWeight === '800' ? '400' : '800' }); handleCommit(); }}
                                    disabled={isRecording || isBatchProcessing}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium border ${activeLayer.fontWeight === '800' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-gray-700 hover:bg-gray-700 text-gray-400'}`}
                                >
                                    <Bold size={14} /> Bold
                                </button>
                                <button 
                                    onClick={() => { updateActiveLayer({ fontStyle: activeLayer.fontStyle === 'italic' ? 'normal' : 'italic' }); handleCommit(); }}
                                    disabled={isRecording || isBatchProcessing}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium border ${activeLayer.fontStyle === 'italic' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-gray-700 hover:bg-gray-700 text-gray-400'}`}
                                >
                                    <Italic size={14} /> Italic
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Font</label>
                                    <div className="flex gap-2">
                                        <select value={activeLayer.fontFamily} onChange={(e) => { updateActiveLayer({ fontFamily: e.target.value }); handleCommit(); }} disabled={isRecording || isBatchProcessing} className="w-full bg-gray-800 text-xs border border-gray-700 rounded px-2 py-2 text-gray-300">
                                            <optgroup label="Standard">
                                                <option value="Poppins">Poppins</option>
                                                <option value="Lobster">Lobster</option>
                                                <option value="Playwrite NO">Playwrite NO</option>
                                            </optgroup>
                                            {design.customFonts.length > 0 && (
                                                <optgroup label="Custom">
                                                    {design.customFonts.map(f => (
                                                        <option key={f.name} value={f.name}>{f.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                        <label className={`flex items-center justify-center p-2 bg-gray-700 hover:bg-gray-600 rounded cursor-pointer border border-gray-600 ${(isRecording || isBatchProcessing) ? 'opacity-50 pointer-events-none' : ''}`} title="Upload Font (TTF, OTF, WOFF)">
                                            <Upload size={14} className="text-gray-300" />
                                            <input type="file" accept=".ttf,.otf,.woff" onChange={handleFontUpload} className="hidden" disabled={isRecording || isBatchProcessing} />
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Align</label>
                                    <div className="flex bg-gray-800 rounded border border-gray-700 p-1">
                                        {(['left', 'center', 'right'] as const).map(align => (
                                            <button key={align} onClick={() => { updateActiveLayer({ textAlign: align }); handleCommit(); }} disabled={isRecording || isBatchProcessing} className={`flex-1 py-1 rounded text-xs capitalize ${activeLayer.textAlign === align ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                                                {align}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Position X</label>
                                    <input type="range" min="0" max="1" step="0.01" value={activeLayer.x} onChange={(e) => updateActiveLayer({ x: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Position Y</label>
                                    <input type="range" min="0" max="1" step="0.01" value={activeLayer.y} onChange={(e) => updateActiveLayer({ y: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Size</label>
                                    <input type="range" min="20" max="400" value={activeLayer.fontSize} onChange={(e) => updateActiveLayer({ fontSize: parseInt(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                                <div className="flex items-center gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Color</label>
                                        <input type="color" value={activeLayer.textColor} onChange={(e) => updateActiveLayer({ textColor: e.target.value })} onBlur={handleCommit} disabled={isRecording || isBatchProcessing} className="w-8 h-8 rounded cursor-pointer bg-transparent border-2 border-gray-700" />
                                    </div>
                                     <div>
                                        <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Opacity</label>
                                        <input type="range" min="0" max="1" step="0.1" value={activeLayer.opacity} onChange={(e) => updateActiveLayer({ opacity: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-20 h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: LOGO */}
            {activeTab === 'logo' && (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col items-center justify-center bg-gray-800/30 border-2 border-dashed border-gray-700 rounded-lg p-8 relative hover:border-blue-500 transition-colors">
                        {design.logo ? (
                            <div className="relative w-full h-full flex items-center justify-center">
                                <img src={design.logo.src} className="max-w-full max-h-[140px] object-contain" alt="Logo Preview" />
                                <button onClick={removeLogo} disabled={isRecording || isBatchProcessing} className="absolute top-0 right-0 bg-red-500/20 text-red-400 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ) : (
                             <div className="text-center">
                                <ImagePlus className="mx-auto text-gray-500 mb-2" size={32} />
                                <span className="text-sm text-gray-400 font-medium">Upload Logo</span>
                            </div>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} className="absolute inset-0 opacity-0 cursor-pointer" disabled={isRecording || isBatchProcessing} />
                    </div>

                    <div className={`space-y-6 ${!design.logo ? 'opacity-50 pointer-events-none' : ''}`}>
                         <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Position X</label>
                                    <input type="range" min="0" max="1" step="0.01" value={design.logo?.x || 0.5} onChange={(e) => updateLogo({ x: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Position Y</label>
                                    <input type="range" min="0" max="1" step="0.01" value={design.logo?.y || 0.5} onChange={(e) => updateLogo({ y: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Size</label>
                                    <input type="range" min="0.05" max="1" step="0.01" value={design.logo?.size || 0.2} onChange={(e) => updateLogo({ size: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold uppercase mb-2">Opacity</label>
                                    <input type="range" min="0" max="1" step="0.05" value={design.logo?.opacity || 1} onChange={(e) => updateLogo({ opacity: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg accent-blue-500" />
                                </div>
                         </div>
                    </div>
                </div>
            )}

            {/* TAB: MUSIC */}
            {activeTab === 'music' && (
                <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 py-4">
                    {/* Upload / File Info Section */}
                    <div className={`${design.audioName ? 'w-full' : 'max-w-md mx-auto'} transition-all`}>
                         <div className="flex flex-col items-center justify-center bg-gray-800/30 border-2 border-dashed border-gray-700 rounded-lg p-6 relative hover:border-blue-500 transition-colors group h-full">
                            {design.audioName ? (
                                <div className="flex flex-col items-center gap-3 w-full">
                                    <div className="p-4 rounded-full bg-blue-500/20 text-blue-400">
                                        <Music size={32} />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-lg text-white mb-1 truncate max-w-[400px]" title={design.audioName}>{design.audioName}</p>
                                        <p className="text-xs text-gray-400">
                                            {formatTime(design.audioDuration)} Total Length
                                        </p>
                                    </div>
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            updateDesign({ audio: null, audioName: null, audioDuration: 0, audioStart: 0, audioEnd: 0 }, true);
                                        }}
                                        disabled={isRecording || isBatchProcessing}
                                        className="mt-2 px-4 py-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-sm font-medium transition-colors z-20"
                                    >
                                        Remove Audio
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4 text-gray-500 group-hover:text-blue-400 transition-colors">
                                        <Music size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">Upload Music</h3>
                                    <p className="text-sm text-gray-400 max-w-xs mx-auto">
                                        MP3, WAV, AAC supported.
                                    </p>
                                </div>
                            )}
                             <input 
                                type="file" 
                                accept="audio/*" 
                                onChange={handleAudioUpload} 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                title={design.audioName ? "Click to change file" : "Click to upload"}
                                disabled={isRecording || isBatchProcessing}
                            />
                        </div>
                    </div>

                    {/* Audio Trim Settings - Full Width for Precision */}
                    {design.audioName && (
                        <div className="bg-gray-800/20 rounded-lg border border-gray-800 p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
                                <div className="flex items-center gap-2">
                                    <Scissors className="text-blue-400" size={20} />
                                    <h4 className="font-bold text-base text-gray-200">Audio Trim Settings</h4>
                                </div>
                                <div className="flex items-center gap-4">
                                     <div className="text-xs text-gray-400 bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
                                        Clip Duration: <span className="text-white font-mono font-bold">{(design.audioEnd - design.audioStart).toFixed(1)}s</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                           if (isPlaying) {
                                               setIsPlaying(false);
                                           } else {
                                               if (audioPreviewRef.current) {
                                                   audioPreviewRef.current.currentTime = design.audioStart;
                                               }
                                               setIsPlaying(true);
                                           }
                                        }}
                                        disabled={isRecording || isBatchProcessing}
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-900/20"
                                    >
                                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                                        <span className="text-xs">{isPlaying ? 'Pause' : 'Preview Clip'}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-8 px-2">
                                {/* Start Time Slider */}
                                <div>
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="text-gray-400 font-bold uppercase tracking-wider">Start Time</span>
                                        <span className="text-blue-400 font-mono text-sm bg-blue-500/10 px-2 rounded">{formatTime(design.audioStart)}</span>
                                    </div>
                                    <div className="relative h-6 flex items-center">
                                        <div className="absolute w-full h-2 bg-gray-700 rounded-full"></div>
                                        <div 
                                            className="absolute h-2 bg-blue-500/50 rounded-l-full" 
                                            style={{ width: `${(design.audioStart / design.audioDuration) * 100}%` }}
                                        ></div>
                                         <input 
                                            type="range" 
                                            min="0" 
                                            max={design.audioDuration} 
                                            step="0.1" 
                                            value={design.audioStart} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val < design.audioEnd) {
                                                    updateDesign({ audioStart: val });
                                                }
                                            }} 
                                            onMouseUp={handleCommit}
                                            disabled={isRecording || isBatchProcessing}
                                            className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div 
                                            className="absolute w-4 h-6 bg-blue-500 rounded shadow-lg border-2 border-white pointer-events-none transform -translate-x-1/2 transition-transform"
                                            style={{ left: `${(design.audioStart / design.audioDuration) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* End Time Slider */}
                                <div>
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="text-gray-400 font-bold uppercase tracking-wider">End Time</span>
                                        <span className="text-purple-400 font-mono text-sm bg-purple-500/10 px-2 rounded">{formatTime(design.audioEnd)}</span>
                                    </div>
                                     <div className="relative h-6 flex items-center">
                                        <div className="absolute w-full h-2 bg-gray-700 rounded-full"></div>
                                        <div 
                                            className="absolute h-2 bg-purple-500/50 rounded-r-full right-0" 
                                            style={{ width: `${100 - (design.audioEnd / design.audioDuration) * 100}%` }}
                                        ></div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max={design.audioDuration} 
                                            step="0.1" 
                                            value={design.audioEnd} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                if (val > design.audioStart) {
                                                    updateDesign({ audioEnd: val });
                                                }
                                            }} 
                                            onMouseUp={handleCommit}
                                            disabled={isRecording || isBatchProcessing}
                                            className="absolute w-full h-full opacity-0 cursor-pointer z-10" 
                                        />
                                         <div 
                                            className="absolute w-4 h-6 bg-purple-500 rounded shadow-lg border-2 border-white pointer-events-none transform -translate-x-1/2 transition-transform"
                                            style={{ left: `${(design.audioEnd / design.audioDuration) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 flex items-center gap-3 p-3 rounded bg-blue-500/5 border border-blue-500/10">
                                <div className="p-1 text-blue-400"><Eye size={16} /></div>
                                <div className="text-xs text-blue-200/70 leading-relaxed">
                                    The selected audio segment ({formatTime(design.audioStart)} - {formatTime(design.audioEnd)}) will loop automatically if the video duration is longer.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: WEATHER */}
            {activeTab === 'weather' && (
                <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 py-4">
                    <div className="flex justify-center gap-4 pb-4 border-b border-gray-800 flex-wrap">
                         <button 
                            onClick={() => updateDesign({ weatherType: 'none' }, true)} 
                            disabled={isRecording || isBatchProcessing}
                            className={`px-6 py-3 rounded-lg border flex flex-col items-center gap-2 w-32 transition-all ${design.weatherType === 'none' ? 'bg-gray-800 border-blue-500 text-white' : 'border-gray-800 text-gray-500 hover:bg-gray-900'}`}
                        >
                            <span className="text-sm font-bold">None</span>
                        </button>
                        <button 
                            onClick={() => updateDesign({ weatherType: 'snow' }, true)} 
                            disabled={isRecording || isBatchProcessing}
                            className={`px-6 py-3 rounded-lg border flex flex-col items-center gap-2 w-32 transition-all ${design.weatherType === 'snow' ? 'bg-gray-800 border-blue-500 text-white' : 'border-gray-800 text-gray-500 hover:bg-gray-900'}`}
                        >
                            <Sparkles size={20} />
                            <span className="text-sm font-bold">Snow</span>
                        </button>
                         <button 
                            onClick={() => updateDesign({ weatherType: 'rain' }, true)} 
                            disabled={isRecording || isBatchProcessing}
                            className={`px-6 py-3 rounded-lg border flex flex-col items-center gap-2 w-32 transition-all ${design.weatherType === 'rain' ? 'bg-gray-800 border-blue-500 text-white' : 'border-gray-800 text-gray-500 hover:bg-gray-900'}`}
                        >
                            <CloudRain size={20} />
                            <span className="text-sm font-bold">Rain</span>
                        </button>
                        <button 
                            onClick={() => updateDesign({ weatherType: 'confetti' }, true)} 
                            disabled={isRecording || isBatchProcessing}
                            className={`px-6 py-3 rounded-lg border flex flex-col items-center gap-2 w-32 transition-all ${design.weatherType === 'confetti' ? 'bg-gray-800 border-blue-500 text-white' : 'border-gray-800 text-gray-500 hover:bg-gray-900'}`}
                        >
                            <PartyPopper size={20} />
                            <span className="text-sm font-bold">Confetti</span>
                        </button>
                    </div>

                    {design.weatherType !== 'none' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Density & Scale & Speed */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                     <div className="flex justify-between"><label className="text-xs text-gray-400 font-bold uppercase">Density</label><span className="text-xs text-gray-500">{design.weatherDensity}%</span></div>
                                     <input type="range" min="10" max="100" value={design.weatherDensity} onChange={(e) => updateDesign({ weatherDensity: parseInt(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                </div>
                                <div className="space-y-2">
                                     <div className="flex justify-between">
                                         <label className="text-xs text-gray-400 font-bold uppercase flex items-center gap-1"><Maximize size={12}/> Scale</label>
                                         <span className="text-xs text-gray-500">{design.weatherScale.toFixed(1)}x</span>
                                     </div>
                                     <input type="range" min="0.2" max="3.0" step="0.1" value={design.weatherScale} onChange={(e) => updateDesign({ weatherScale: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <label className="text-xs text-gray-400 font-bold uppercase flex items-center gap-1"><Gauge size={12}/> Speed</label>
                                        <span className="text-xs text-gray-500">{design.weatherSpeed.toFixed(1)}x</span>
                                    </div>
                                    <input type="range" min="0.1" max="5.0" step="0.1" value={design.weatherSpeed} onChange={(e) => updateDesign({ weatherSpeed: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                </div>
                            </div>
                            
                            {/* Angle & Wobble & Opacity */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                     <div className="flex justify-between">
                                        <label className="text-xs text-gray-400 font-bold uppercase flex items-center gap-1"><Wind size={12}/> Angle</label>
                                        <span className="text-xs text-gray-500">{design.weatherAngle}°</span>
                                     </div>
                                     <input type="range" min="-45" max="45" value={design.weatherAngle} onChange={(e) => updateDesign({ weatherAngle: parseInt(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                                     <div className="flex justify-between text-[10px] text-gray-600 px-1"><span>-45°</span><span>0°</span><span>45°</span></div>
                                </div>
                                <div className="space-y-2">
                                     <div className="flex justify-between">
                                        <label className="text-xs text-gray-400 font-bold uppercase flex items-center gap-1"><Activity size={12}/> Wobble</label>
                                        <span className="text-xs text-gray-500">{design.weatherWobble.toFixed(1)}</span>
                                     </div>
                                     <input type="range" min="0" max="5.0" step="0.1" value={design.weatherWobble} onChange={(e) => updateDesign({ weatherWobble: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <label className="text-xs text-gray-400 font-bold uppercase flex items-center gap-1"><Droplets size={12}/> Opacity</label>
                                        <span className="text-xs text-gray-500">{design.weatherOpacity.toFixed(1)}</span>
                                    </div>
                                    <input type="range" min="0" max="1.5" step="0.1" value={design.weatherOpacity} onChange={(e) => updateDesign({ weatherOpacity: parseFloat(e.target.value) })} onMouseUp={handleCommit} disabled={isRecording || isBatchProcessing} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: AI GENERATION */}
            {activeTab === 'ai' && (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                        <label className="block text-xs text-gray-400 font-bold uppercase">Describe background</label>
                        <textarea 
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            disabled={isRecording || isBatchProcessing}
                            placeholder="e.g. A futuristic neon city, sunset over ocean, cyberpunk street, mystical forest..." 
                            className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-blue-500 focus:outline-none resize-none placeholder-gray-600"
                        />
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={handleGenerateToRepo}
                                disabled={isGenerating || !aiPrompt || isRecording || isBatchProcessing}
                                className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${isGenerating || !aiPrompt || isRecording || isBatchProcessing ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white shadow-lg'}`}
                            >
                                {isGenerating ? <RefreshCw className="animate-spin" size={16}/> : <Database size={16}/>}
                                {isGenerating ? 'Generating...' : 'Generate to Repo'}
                            </button>
                             <button 
                                onClick={handleApplyNow}
                                disabled={isGenerating || !aiPrompt || isRecording || isBatchProcessing}
                                className={`px-6 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border ${isGenerating || !aiPrompt || isRecording || isBatchProcessing ? 'border-gray-800 text-gray-500 cursor-not-allowed' : 'border-gray-600 hover:bg-gray-800 text-gray-300'}`}
                            >
                                Apply Now
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 h-[300px] overflow-y-auto bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                        <div className="flex items-center justify-between mb-2">
                             <div className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                                 <Database size={12} /> Repository
                             </div>
                             <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{imageRepo.length} Images</span>
                        </div>
                        
                        {imageRepo.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
                                <Database size={24} className="opacity-20" />
                                <span className="text-xs text-center">No images generated.<br/>Use "Generate to Repo"</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {imageRepo.map((img) => (
                                    <div key={img.id} className="relative group aspect-square rounded overflow-hidden border border-gray-700">
                                        <img src={img.src} alt={img.prompt} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                             <button 
                                                onClick={() => {
                                                    createImgFromSrc(img.src).then(el => updateDesign({ bgImage: el, bgType: 'image' }, true));
                                                }}
                                                className="p-1.5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white"
                                                title="Use Now"
                                             >
                                                 <CheckCircle2 size={12} />
                                             </button>
                                             <button 
                                                onClick={() => setImageRepo(prev => prev.filter(i => i.id !== img.id))}
                                                className="p-1.5 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white"
                                             >
                                                 <Trash2 size={12} />
                                             </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

             {/* TAB: QUOTES */}
             {activeTab === 'quotes' && (
                <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 py-4">
                    <div className="grid grid-cols-1 gap-6">
                        <div className="flex flex-col items-center justify-center bg-gray-800/30 border-2 border-dashed border-gray-700 rounded-lg p-6 relative hover:border-blue-500 transition-colors">
                            <div className="text-center">
                                <FileText className="mx-auto text-gray-500 mb-2" size={32} />
                                <h3 className="text-lg font-bold text-white mb-2">Upload Quotes</h3>
                                <p className="text-sm text-gray-400 max-w-xs mx-auto mb-2">
                                    Upload a .txt file. Each line will be treated as a separate quote.
                                </p>
                            </div>
                            <input 
                                type="file" 
                                accept=".txt" 
                                onChange={handleQuoteUpload} 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                disabled={isRecording || isBatchProcessing}
                            />
                        </div>

                        {quotes.length > 0 && (
                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-800 flex flex-col gap-3">
                                <div className="flex justify-between items-center mb-1">
                                    <h4 className="font-bold text-sm text-gray-300">Quotes Queue ({quotes.length})</h4>
                                    <button 
                                        onClick={() => setQuotes([])} 
                                        className="text-xs text-red-400 hover:text-red-300"
                                        disabled={isRecording || isBatchProcessing}
                                    >
                                        Clear All
                                    </button>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                                    {quotes.map((quote, idx) => (
                                        <div key={idx} className="bg-gray-900/50 p-3 rounded border border-gray-700 text-sm text-gray-300 flex justify-between gap-4 group">
                                            <span className="truncate">{quote}</span>
                                            <button 
                                                onClick={() => loadQuoteFromQueue(idx)} 
                                                className="shrink-0 text-blue-400 hover:text-blue-300 text-xs font-bold uppercase"
                                                disabled={isRecording || isBatchProcessing}
                                            >
                                                Load
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300">
                                    <strong>Workflow:</strong> Click "Load" to put the first quote onto the canvas. When you finish exporting the video, that quote will be automatically removed from this list.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* TAB: QUEUE (Ready to Render) */}
            {activeTab === 'queue' && (
                <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 py-2">
                    <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <ListVideo className="text-indigo-400" /> Rendering Queue
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">
                                {renderQueue.length} jobs pending. Click 'Start Batch Export' to render all sequentially.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={clearQueue}
                                disabled={renderQueue.length === 0 || isBatchProcessing}
                                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                Clear List
                            </button>
                            <button 
                                onClick={startBatchExport}
                                disabled={renderQueue.filter(j => j.status === 'pending').length === 0 || isBatchProcessing}
                                className={`
                                    px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-all
                                    ${renderQueue.filter(j => j.status === 'pending').length > 0 && !isBatchProcessing
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:scale-105' 
                                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    }
                                `}
                            >
                                {isBatchProcessing ? <RefreshCw className="animate-spin" size={16}/> : <Film size={16}/>}
                                {isBatchProcessing ? 'Batch Processing...' : 'Start Batch Export'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 min-h-[300px] overflow-y-auto p-4 space-y-3">
                        {renderQueue.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 mt-20">
                                <ListVideo size={48} className="opacity-20" />
                                <div className="text-center">
                                    <p className="font-bold">Queue is Empty</p>
                                    <p className="text-xs">Setup your design, then click "Add to Queue" in the top bar.</p>
                                </div>
                            </div>
                        ) : (
                            renderQueue.map((job, idx) => (
                                <div 
                                    key={job.id} 
                                    onClick={() => setDesign(job.designState)}
                                    className="cursor-pointer bg-gray-900 border border-gray-700 rounded-lg p-3 flex items-center gap-4 group hover:border-gray-500 hover:bg-gray-800 transition-colors relative overflow-hidden"
                                >
                                    {/* Status Indicator Bar */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                        job.status === 'pending' ? 'bg-gray-600' :
                                        job.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                                        job.status === 'done' ? 'bg-green-500' : 'bg-red-500'
                                    }`}></div>

                                    {/* Index */}
                                    <div className="w-8 text-center text-sm font-mono text-gray-500">{idx + 1}</div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-sm text-gray-200 truncate">{job.name}</h4>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                                                job.status === 'pending' ? 'bg-gray-800 text-gray-400' :
                                                job.status === 'processing' ? 'bg-blue-900 text-blue-300' :
                                                job.status === 'done' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                                            }`}>
                                                {job.status}
                                            </span>
                                        </div>
                                        <div className="flex gap-4 text-xs text-gray-500">
                                            <span className="flex items-center gap-1"><Monitor size={10}/> {job.designState.aspectRatio}</span>
                                            <span className="flex items-center gap-1"><Activity size={10}/> {job.designState.duration}s</span>
                                            {job.designState.bgType === 'image' && <span className="flex items-center gap-1"><ImageIcon size={10}/> Image BG</span>}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {job.status === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                                            disabled={isBatchProcessing && job.status === 'processing'}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default App;