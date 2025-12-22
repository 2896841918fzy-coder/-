import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { AppMode, HandGesture } from '../types';

interface HandControllerProps {
  handPositionRef: React.MutableRefObject<{ x: number; y: number }>;
  onModeChange: (mode: AppMode) => void;
  currentMode: AppMode;
}

const DETECTION_INTERVAL = 50; 

export const HandController: React.FC<HandControllerProps> = ({ handPositionRef, onModeChange, currentMode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false); // Collapsed state
  
  const modeRef = useRef(currentMode);
  useEffect(() => { modeRef.current = currentMode; }, [currentMode]);

  const onModeChangeRef = useRef(onModeChange);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let animationFrameId: number;
    let lastDetectionTime = 0;
    let lastGestureChangeTime = 0;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        startWebcam();
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
      }
    };

    const startWebcam = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 320 }, 
                height: { ideal: 240 },
                frameRate: { ideal: 30 }
            } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.addEventListener('loadeddata', predictWebcam);
            }
        } catch (err) {
            console.error("Camera access denied:", err);
            setLoading(false);
        }
      }
    };

    const predictWebcam = () => {
      if (!handLandmarker || !videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      const drawingUtils = new DrawingUtils(ctx);
      
      const renderLoop = (timestamp: number) => {
        animationFrameId = requestAnimationFrame(renderLoop);

        if (timestamp - lastDetectionTime < DETECTION_INTERVAL) return;
        
        if (video.currentTime > 0 && !video.paused && !video.ended) {
            // Resize canvas to match video (critical for drawing)
            if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
            if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
            
            lastDetectionTime = timestamp;
            
            let results;
            try {
                results = handLandmarker?.detectForVideo(video, timestamp);
            } catch (e) { return; }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (results && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];
                
                // Visualization
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "rgba(0, 255, 100, 0.6)", lineWidth: 2 });
                drawingUtils.drawLandmarks(landmarks, { color: "rgba(255, 255, 255, 0.8)", lineWidth: 1, radius: 2 });

                // Logic
                const wrist = landmarks[0];
                const tips = [8, 12, 16, 20];
                const pips = [6, 10, 14, 18];
                let curledFingers = 0;
                tips.forEach((tipIdx, i) => {
                    const tip = landmarks[tipIdx];
                    const pip = landmarks[pips[i]];
                    const distTip = (tip.x - wrist.x)**2 + (tip.y - wrist.y)**2;
                    const distPip = (pip.x - wrist.x)**2 + (pip.y - wrist.y)**2;
                    if (distTip < distPip * 1.2) curledFingers++;
                });

                const isFist = curledFingers >= 4;
                const thumbTip = landmarks[4];
                const indexTip = landmarks[8];
                const pinchDist = Math.sqrt((thumbTip.x - indexTip.x)**2 + (thumbTip.y - indexTip.y)**2);
                
                const isPinching = pinchDist < 0.05 && !isFist; 
                // An "OK" sign has curledFingers <= 1 (only index curled usually, or just tip touching), 
                // but we must treat "Open" as "Open Palm AND NOT pinching".
                const isOpen = curledFingers <= 1;

                handPositionRef.current.x = (landmarks[9].x - 0.5) * -2; 
                handPositionRef.current.y = (landmarks[9].y - 0.5) * 2; 

                // Debounced Mode Switch
                if (timestamp - lastGestureChangeTime > 800) {
                    const current = modeRef.current;
                    let nextMode = current;

                    // 1. Fist -> Always try to go to Tree
                    if (isFist && current !== AppMode.TREE) {
                         nextMode = AppMode.TREE;
                    } 
                    // 2. Pinch -> From Scatter to Photo Zoom
                    else if (isPinching && current === AppMode.SCATTER) {
                         nextMode = AppMode.PHOTO_ZOOM;
                    } 
                    // 3. Open -> Return to Scatter (Exit Zoom or Tree)
                    // CRITICAL FIX: Ensure we are NOT pinching. 
                    // Otherwise, holding a pinch ("OK" sign) counts as Open and kicks us out of Zoom mode immediately.
                    else if (isOpen && !isPinching && (current === AppMode.PHOTO_ZOOM || current === AppMode.TREE)) {
                         nextMode = AppMode.SCATTER;
                    }

                    if (nextMode !== current) {
                        onModeChangeRef.current(nextMode);
                        lastGestureChangeTime = timestamp;
                    }
                }
                setLoading(false);
            }
        }
      };
      
      renderLoop(performance.now());
    };

    setupMediaPipe();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
    };
  }, []);

  return (
    <div className={`fixed top-4 left-4 z-50 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl transition-all duration-500 overflow-hidden ${
        isCollapsed ? 'w-12 h-12 rounded-full cursor-pointer hover:bg-white/10' : 'w-48'
    }`}>
      
      {/* Header / Collapse Trigger */}
      <div 
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-2">
            {!isCollapsed && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
            {!isCollapsed && <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Camera</span>}
        </div>
        
        {/* Icon based on state */}
        {isCollapsed ? (
            <div className="w-full h-full flex items-center justify-center absolute inset-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white/80">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
            </div>
        ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 text-white/50">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
        )}
      </div>

      {/* Video Container (Always rendered for AI, but visually hidden when collapsed) */}
      <div className={`relative w-full aspect-[4/3] bg-black/50 transition-all duration-300 ${
        isCollapsed ? 'h-0 opacity-0 pointer-events-none' : 'h-36 opacity-100'
      }`}>
        {loading && !isCollapsed && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-[10px] z-10">
            Connecting...
          </div>
        )}
        <video 
          ref={videoRef} 
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-60" 
          autoPlay 
          playsInline 
          muted 
        />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" 
        />
      </div>

      {/* Legend */}
      {!isCollapsed && (
          <div className="px-3 py-2 border-t border-white/5 bg-black/20">
            <div className="grid grid-cols-1 gap-1">
                <div className="flex items-center space-x-2 text-[9px] text-white/60">
                    <span>✊</span> <span>Tree</span>
                </div>
                <div className="flex items-center space-x-2 text-[9px] text-white/60">
                    <span>🖐️</span> <span>Scatter</span>
                </div>
                <div className="flex items-center space-x-2 text-[9px] text-white/60">
                    <span>🤏</span> <span>Zoom</span>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};