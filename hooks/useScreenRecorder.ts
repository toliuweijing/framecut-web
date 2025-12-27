
import { useState, useRef, useCallback, useEffect } from 'react';
import { SpotlightEffect } from '../types';
import { generateId, formatTimeShort } from '../utils';

interface UseScreenRecorderProps {
  onRecordingComplete: (url: string, name: string, spotlights: SpotlightEffect[]) => void;
}

export const useScreenRecorder = ({ onRecordingComplete }: UseScreenRecorderProps) => {
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [recordingMarkersCount, setRecordingMarkersCount] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showFloatingBar, setShowFloatingBar] = useState(true);
  
  // PiP State
  const [isPiPActive, setIsPiPActive] = useState(false);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);

  // Internal Refs
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingMarkersRef = useRef<number[]>([]);
  const recordingIntervalRef = useRef<any>(null);

  // Helper to draw the PiP timer
  const updatePiP = useCallback((time: number) => {
    const canvas = pipCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 16:9 Small Canvas
    if (canvas.width !== 256) {
      canvas.width = 256;
      canvas.height = 144;
    }

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("● REC", cx, cy - 24);

    ctx.font = '700 48px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatTimeShort(time), cx, cy + 16);
  }, []);

  const handleTogglePiP = useCallback(async () => {
    if (isPiPActive) {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
      setIsPiPActive(false);
    } else {
      const canvas = pipCanvasRef.current;
      const video = pipVideoRef.current;
      if (canvas && video) {
        updatePiP(recordingDuration); // Force update
        const pipStream = canvas.captureStream(1);
        video.srcObject = pipStream;
        try {
          await video.play();
          await video.requestPictureInPicture();
          setIsPiPActive(true);
        } catch (e) {
          console.warn("Failed to enter PiP", e);
          alert("Failed to open floating timer. You may need to interact with the page first.");
          setIsPiPActive(false);
        }
        video.onleavepictureinpicture = () => {
          setIsPiPActive(false);
        };
      }
    }
  }, [isPiPActive, recordingDuration, updatePiP]);

  const handleStartScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream);
      screenChunksRef.current = [];
      recordingMarkersRef.current = [];
      setRecordingMarkersCount(0);
      setShowFloatingBar(true);
      setIsPiPActive(false); // Reset PiP state

      // Start Timer logic
      setRecordingDuration(0);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);

      recordingStartTimeRef.current = Date.now();
      recorder.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      
      recorder.onstop = () => {
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);

        // Exit PiP if active
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => { });
        }
        setIsPiPActive(false);

        const blob = new Blob(screenChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toLocaleTimeString().replace(/:/g, '-');
        
        // Generate spotlights based on markers
        const generatedSpotlights: SpotlightEffect[] = recordingMarkersRef.current.map(timeMs => {
          const timeSec = timeMs / 1000;
          return { 
            id: generateId(), 
            start: Math.max(0, timeSec - 0.75), 
            end: timeSec + 0.75, 
            x: 40, y: 32, width: 20, height: 35.5 
          };
        });

        onRecordingComplete(url, `Screen Recording ${timestamp}`, generatedSpotlights);
        
        setIsScreenRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };
      
      stream.getVideoTracks()[0].onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };

      recorder.start();
      screenRecorderRef.current = recorder;
      setIsScreenRecording(true);
    } catch (err: any) {
      console.error("Screen recording cancelled or failed", err);
      setIsScreenRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert("Screen recording permission was denied. Please allow access to start recording.");
      } else {
        alert("Failed to start screen recording: " + (err.message || "Unknown error"));
      }
    }
  };

  const handleStopScreenRecording = () => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') screenRecorderRef.current.stop();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => { });
    }
  };

  const handleMarker = useCallback(() => {
    if (!isScreenRecording) return;
    recordingMarkersRef.current.push(Date.now() - recordingStartTimeRef.current);
    setRecordingMarkersCount(prev => prev + 1);
  }, [isScreenRecording]);

  // Update PiP Canvas if active
  useEffect(() => {
    if (isScreenRecording && isPiPActive) {
      updatePiP(recordingDuration);
    }
  }, [recordingDuration, isPiPActive, isScreenRecording, updatePiP]);

  return {
    isScreenRecording,
    recordingMarkersCount,
    recordingDuration,
    showFloatingBar,
    setShowFloatingBar,
    isPiPActive,
    pipCanvasRef,
    pipVideoRef,
    handleStartScreenRecording,
    handleStopScreenRecording,
    handleMarker,
    handleTogglePiP
  };
};
