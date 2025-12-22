import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Scene } from './components/Scene';
import { HandController } from './components/HandController';
import { AppMode, PhotoData } from './types';

const DEFAULT_PHOTOS: PhotoData[] = [
  { id: '1', url: 'https://picsum.photos/id/1015/400/400' },
  { id: '2', url: 'https://picsum.photos/id/1016/400/400' },
  { id: '3', url: 'https://picsum.photos/id/1018/400/400' },
  { id: '4', url: 'https://picsum.photos/id/1019/400/400' },
  { id: '5', url: 'https://picsum.photos/id/1025/400/400' },
];

const DEFAULT_MUSIC = "https://ia800504.us.archive.org/33/items/MerryChristmasMrLawrence_196/MerryChristmasMrLawrence.mp3";

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.TREE);
  const [photos, setPhotos] = useState<PhotoData[]>(DEFAULT_PHOTOS);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);
  
  // Audio State
  const [audioSrc, setAudioSrc] = useState<string>(DEFAULT_MUSIC);

  // UI States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showUI, setShowUI] = useState(false); // New state for opening animation
  const [isMusicPlaying, setIsMusicPlaying] = useState(false); // Music state

  // Parameters
  const [density, setDensity] = useState<number>(0.8); 
  const [sizeFactor, setSizeFactor] = useState<number>(1.0); 
  const [breathingSpeed, setBreathingSpeed] = useState<number>(1.2); 
  const [starBrightness, setStarBrightness] = useState<number>(1.0); 
  
  const handPositionRef = useRef({ x: 0, y: 0 });
  const audioRef = useRef<HTMLAudioElement>(null);

  // Trigger UI fade-in after tree animation (approx 3.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
        setShowUI(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Audio Logic: Handle Autoplay Policy
  useEffect(() => {
    const tryPlayAudio = () => {
        if (audioRef.current) {
            audioRef.current.volume = 0.4;
            // Only try to play if paused to avoid errors
            if (audioRef.current.paused) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setIsMusicPlaying(true);
                            cleanupListeners();
                        })
                        .catch((error) => {
                            console.log("Autoplay blocked by browser. Waiting for interaction.", error);
                            setIsMusicPlaying(false);
                        });
                }
            }
        }
    };

    // 1. Try immediately on load
    tryPlayAudio();

    // 2. Fallback: Browsers require a user interaction (click/touch) to unlock audio context
    const handleInteraction = () => {
        tryPlayAudio();
    };

    const cleanupListeners = () => {
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
        window.removeEventListener('keydown', handleInteraction);
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => cleanupListeners();
  }, []);

  const toggleMusic = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the global listener again unnecessarily
    if (!audioRef.current) return;
    
    if (isMusicPlaying) {
        audioRef.current.pause();
        setIsMusicPlaying(false);
    } else {
        audioRef.current.play()
            .then(() => setIsMusicPlaying(true))
            .catch(console.error);
    }
  };

  const handleModeChange = useCallback((newMode: AppMode) => {
    setMode(prevMode => {
        if (newMode === AppMode.PHOTO_ZOOM && prevMode !== AppMode.PHOTO_ZOOM) {
            if (photos.length > 0) {
                setCurrentPhotoIndex(prev => (prev + 1) % photos.length);
            }
        }
        return newMode;
    });
  }, [photos]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newPhotos: PhotoData[] = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        url: URL.createObjectURL(file)
      }));
      setPhotos([...photos, ...newPhotos]);
    }
  };
  
  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && audioRef.current) {
        const objectUrl = URL.createObjectURL(file);
        setAudioSrc(objectUrl);
        // Automatically play new music
        setIsMusicPlaying(true);
        // Need a slight timeout to allow the src to update in the DOM
        setTimeout(() => {
            if(audioRef.current) {
                audioRef.current.play().catch(console.error);
            }
        }, 100);
    }
  };

  const handleDeletePhoto = (id: string) => {
    const updatedPhotos = photos.filter(p => p.id !== id);
    setPhotos(updatedPhotos);
    if (currentPhotoIndex >= updatedPhotos.length) {
      setCurrentPhotoIndex(Math.max(0, updatedPhotos.length - 1));
    }
  };

  const handlePhotoClick = (id: string) => {
    const idx = photos.findIndex(p => p.id === id);
    if (idx !== -1) {
        setCurrentPhotoIndex(idx);
        setMode(AppMode.PHOTO_ZOOM);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#050505] text-white overflow-hidden font-sans selection:bg-white/20">
      
      {/* Background Music Audio Element - Dynamic Source */}
      <audio ref={audioRef} src={audioSrc} loop crossOrigin="anonymous" />

      {/* 3D Scene Background */}
      <div className="absolute inset-0 z-0">
        <Scene 
          mode={mode} 
          photos={photos} 
          handPositionRef={handPositionRef}
          density={density}
          sizeFactor={sizeFactor}
          breathingSpeed={breathingSpeed}
          starBrightness={starBrightness}
          activePhoto={photos[currentPhotoIndex] || null}
          onPhotoClick={handlePhotoClick}
        />
      </div>

      {/* --- UI LAYER (Fades in after opening) --- */}
      {/* ADDED pointer-events-none here to fix mouse interaction with Canvas */}
      <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-[2000ms] ${showUI ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* 1. Top Center Title - Artistic & Festive */}
        <div className="absolute top-8 left-0 right-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
            <h1 className="text-4xl sm:text-6xl font-serif italic font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-amber-300 to-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)] tracking-widest pb-2">
            Merry Christmas
            </h1>
            <div className="flex space-x-2 items-center opacity-80">
                <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-amber-400"></div>
                <span className="text-[10px] sm:text-xs font-mono tracking-[0.4em] text-amber-200 uppercase">Interactive Tree</span>
                <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-amber-400"></div>
            </div>
        </div>

        {/* 2. Top Left Hand Controller (Already handles pointer events internally or needs auto) */}
        <div className="pointer-events-auto z-30">
             <HandController 
                handPositionRef={handPositionRef} 
                onModeChange={handleModeChange}
                currentMode={mode}
            />
        </div>

        {/* 3. Top Right Controls (Music + Settings) */}
        <div className="absolute top-4 right-4 flex flex-col items-end pointer-events-auto z-30">
            <div className="flex items-center space-x-3">
                {/* Music Toggle Button */}
                <button
                    onClick={toggleMusic}
                    className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-md border transition-all duration-300 shadow-lg ${
                        isMusicPlaying 
                        ? 'bg-white/10 text-white border-white/20 hover:bg-white/20' 
                        : 'bg-black/40 text-white/50 border-white/10 hover:bg-white/10 animate-pulse'
                    }`}
                    title={isMusicPlaying ? "Mute Music" : "Click anywhere to enable Music"}
                >
                    {isMusicPlaying ? (
                        <div className="relative flex items-center justify-center">
                            {/* Animated sound waves */}
                            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-20 animate-ping"></span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                            </svg>
                        </div>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                    )}
                </button>

                {/* Settings Toggle Button */}
                <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-md border transition-all duration-300 shadow-lg ${
                    isSettingsOpen ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/20 hover:bg-white/10'
                }`}
                >
                {isSettingsOpen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                )}
                </button>
            </div>

            <div className={`mt-3 w-72 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-300 origin-top-right ${
                isSettingsOpen ? 'opacity-100 scale-100 translate-y-0 max-h-[80vh]' : 'opacity-0 scale-95 -translate-y-4 max-h-0 pointer-events-none'
            }`}>
                <div className="p-5 overflow-y-auto max-h-[80vh] scrollbar-thin scrollbar-thumb-white/20">
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
                        <span className="text-[10px] uppercase tracking-widest text-white/50">Mode</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            mode === AppMode.TREE ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                            mode === AppMode.SCATTER ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 
                            'border-purple-500/50 bg-purple-500/10 text-purple-400'
                        }`}>
                            {mode}
                        </span>
                    </div>

                    <div className="space-y-5 mb-6">
                        <ControlSlider label="Density" value={density} min={0.1} max={1.0} step={0.05} onChange={setDensity} format={(v) => `${(v * 100).toFixed(0)}%`} />
                        <ControlSlider label="Size" value={sizeFactor} min={0.5} max={2.0} step={0.1} onChange={setSizeFactor} format={(v) => `${v.toFixed(1)}x`} />
                        <ControlSlider label="Glow" value={starBrightness} min={0} max={3} step={0.1} onChange={setStarBrightness} format={(v) => v.toFixed(1)} />
                        <ControlSlider label="Speed" value={breathingSpeed} min={0.1} max={4} step={0.1} onChange={setBreathingSpeed} format={(v) => v.toFixed(1)} />
                    </div>
                    
                    <div className="space-y-3 pt-2 border-t border-white/10">
                        {/* Music Upload */}
                        <label className="flex items-center justify-center w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-xl cursor-pointer transition-colors group mb-2">
                            <div className="flex flex-col items-center">
                                <div className="flex items-center space-x-2 text-white/70 group-hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25a2.25 2.25 0 00-2.121-2.248l-10.5 3A2.25 2.25 0 009 5.25v12a2.25 2.25 0 002.25 2.25" />
                                    </svg>
                                    <span className="text-[10px] uppercase tracking-widest">Change Music</span>
                                </div>
                            </div>
                            <input type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
                        </label>

                        {/* Photo Upload */}
                        <label className="flex items-center justify-center w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-xl cursor-pointer transition-colors group">
                            <div className="flex flex-col items-center">
                                <div className="flex items-center space-x-2 text-white/70 group-hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                    </svg>
                                    <span className="text-[10px] uppercase tracking-widest">Add Photos</span>
                                </div>
                            </div>
                            <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        </label>

                        {photos.length > 0 && (
                            <div className="grid grid-cols-4 gap-2 mt-3">
                                {photos.map((photo, idx) => (
                                    <div key={photo.id} className={`relative group aspect-square rounded-md overflow-hidden border ${idx === currentPhotoIndex ? 'border-amber-400' : 'border-white/10'}`}>
                                        <img src={photo.url} alt="memory" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <button
                                            onClick={() => handleDeletePhoto(photo.id)}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400">
                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        
        {/* NEW: Mobile/Touch Controls Toolbar (Visible on bottom for easier access) */}
        <div className="absolute bottom-24 left-0 right-0 flex justify-center space-x-4 pointer-events-auto z-20">
            {mode !== AppMode.TREE && (
                <button 
                    onClick={() => setMode(AppMode.TREE)}
                    className="bg-green-900/40 backdrop-blur-md border border-green-500/30 text-green-100 px-6 py-3 rounded-full shadow-lg active:scale-95 transition-all flex items-center space-x-2 hover:bg-green-900/60"
                >
                    <span>🎄</span> <span className="text-sm font-bold tracking-wider">ASSEMBLE</span>
                </button>
            )}
            
            {mode !== AppMode.SCATTER && (
                <button 
                    onClick={() => setMode(AppMode.SCATTER)}
                    className="bg-blue-900/40 backdrop-blur-md border border-blue-500/30 text-blue-100 px-6 py-3 rounded-full shadow-lg active:scale-95 transition-all flex items-center space-x-2 hover:bg-blue-900/60"
                >
                    <span>✨</span> <span className="text-sm font-bold tracking-wider">SCATTER</span>
                </button>
            )}
            
            {mode === AppMode.PHOTO_ZOOM && (
                <button 
                    onClick={() => setMode(AppMode.SCATTER)}
                    className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-full shadow-lg active:scale-95 transition-all flex items-center space-x-2 hover:bg-white/20"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                    <span className="text-sm font-bold tracking-wider">BACK</span>
                </button>
            )}
        </div>

        {/* 4. Bottom Status Pill */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none z-10">
            <div className="bg-black/30 backdrop-blur-md border border-white/10 px-6 py-2.5 rounded-full flex items-center space-x-3 shadow-lg mx-4 text-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse hidden sm:block" />
            <p className="text-white/80 text-[10px] sm:text-[11px] font-mono tracking-widest uppercase">
                {mode === AppMode.TREE && "Fist to Rotate • Open to Scatter"}
                {mode === AppMode.SCATTER && "Pinch to Zoom • Fist to Assemble • Tap Photo"}
                {mode === AppMode.PHOTO_ZOOM && "Open Palm to Return"}
            </p>
            </div>
        </div>

      </div>

    </div>
  );
}

// Reusable Slider Component
const ControlSlider = ({ label, value, min, max, step, onChange, format }: any) => (
    <div>
        <div className="flex justify-between text-[10px] text-white/60 mb-2 font-mono uppercase tracking-wider">
            <span>{label}</span>
            <span>{format(value)}</span>
        </div>
        <input 
            type="range" min={min} max={max} step={step} 
            value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-amber-400 transition-colors"
        />
    </div>
);
