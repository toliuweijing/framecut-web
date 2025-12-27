
import { useRef, RefObject } from 'react';

interface UseCanvasRecorderProps {
    canvasRef: RefObject<HTMLCanvasElement>;
    introRef: RefObject<HTMLVideoElement>;
    mainRef: RefObject<HTMLVideoElement>;
    outroRef: RefObject<HTMLVideoElement>;
    audioRef: RefObject<HTMLAudioElement>;
    coverImageRef: RefObject<string | null | undefined>;
}

export const useCanvasRecorder = ({ canvasRef, introRef, mainRef, outroRef, audioRef, coverImageRef }: UseCanvasRecorderProps) => {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    
    // Prevent Garbage Collection of Audio Context and Streams during recording
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRefs = useRef<MediaStream[]>([]);

    const startRecording = async (options?: { audioOnly?: boolean; format?: 'mp4' | 'webm' }) => {
        const { audioOnly = false, format = 'webm' } = options || {};
        const canvas = canvasRef.current;
        
        if (!canvas) return;
  
        let stream: MediaStream | null = null;
        let optionsMime = "";
  
        // 1. Initialize AudioContext and persist it
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        
        // Ensure context is running (sometimes starts suspended)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const dest = audioContext.createMediaStreamDestination();
        
        // CRITICAL FIX: Add a silent oscillator to keep the audio clock running continuously.
        const oscillator = audioContext.createOscillator();
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0; // Completely silent
        oscillator.connect(silentGain);
        silentGain.connect(dest);
        oscillator.start();
        
        // Reset stream refs
        streamRefs.current = [];
        
        // Capture Audio from ALL Video Elements (Intro, Main, Outro)
        const videoRefs = [introRef, mainRef, outroRef];
        
        videoRefs.forEach(ref => {
            const video = ref.current;
            if (video && !video.muted && (video as any).captureStream) {
                try {
                  const vidStream = (video as any).captureStream(30) as MediaStream;
                  streamRefs.current.push(vidStream); // Keep reference
                  if (vidStream.getAudioTracks().length > 0) {
                       const source = audioContext.createMediaStreamSource(vidStream);
                       source.connect(dest);
                  }
                } catch(e) { console.warn("Video audio capture failed", e); }
            }
        });
        
        // Capture Audio from Audio Element
        if (audioRef.current && (audioRef.current as any).captureStream) {
             try {
               const audStream = (audioRef.current as any).captureStream(30) as MediaStream;
               streamRefs.current.push(audStream); // Keep reference
               if (audStream.getAudioTracks().length > 0) {
                   const source = audioContext.createMediaStreamSource(audStream);
                   source.connect(dest);
               }
             } catch(e) { console.warn("Audio element capture failed", e); }
        }
  
        if (audioOnly) {
           stream = dest.stream;
           const mimeTypes = [
               "audio/webm;codecs=opus", 
               "audio/webm", 
               "audio/ogg", 
               "audio/mp4", 
               "audio/aac"
           ];
           optionsMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "";
        } else {
           try {
               const canvasStream = canvas.captureStream(30);
               streamRefs.current.push(canvasStream); // Keep reference
               stream = canvasStream;
           } catch (e) {
               console.error("Canvas capture failed", e);
               alert("Cannot export video: The source video format does not support export (CORS restriction).");
               return;
           }
           
           if (dest.stream.getAudioTracks().length > 0) {
              stream.addTrack(dest.stream.getAudioTracks()[0]);
           }
           
           // Determine MIME type priorities based on format preference
           let mimeTypes: string[] = [];
           
           if (format === 'mp4') {
               // Try MP4/H.264 first
               mimeTypes = [
                   "video/mp4;codecs=avc1,mp4a.40.2",
                   "video/mp4",
                   "video/webm;codecs=vp9,opus", 
                   "video/webm;codecs=vp8,opus", 
                   "video/webm"
               ];
           } else {
               // Try WebM/VP9 first (default)
               mimeTypes = [
                   "video/webm;codecs=vp9,opus", 
                   "video/webm;codecs=vp8,opus", 
                   "video/webm", 
                   "video/mp4;codecs=avc1,mp4a.40.2", 
                   "video/mp4"
               ];
           }
           
           optionsMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "video/webm";
        }
  
        if (!stream) return;
  
        mediaRecorderRef.current = new MediaRecorder(stream, { 
          mimeType: optionsMime,
          ...(audioOnly ? { audioBitsPerSecond: 128000 } : { videoBitsPerSecond: 5000000 })
        });
        recordedChunksRef.current = [];
  
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
  
        // Handle Cover Image: "Burn" it as the first frame if present
        if (!audioOnly && coverImageRef.current) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const img = new Image();
                img.src = coverImageRef.current;
                await new Promise((resolve) => {
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(true);
                    };
                    img.onerror = () => resolve(false);
                });
            }
        }
  
        // Start with a 1 second timeslice
        mediaRecorderRef.current.start(1000);
  
        // Force a frame for the cover image
        if (!audioOnly && coverImageRef.current) {
            if (mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.requestData();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    };

    const stopRecording = async () => {
        return new Promise<Blob>((resolve) => {
          const recorder = mediaRecorderRef.current;
          if (!recorder) {
            resolve(new Blob());
            return;
          }
          const cleanup = () => {
            recorder.onstop = null;
            recorder.onerror = null;

            // Close Audio Context
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(e => console.warn("Failed to close AudioContext", e));
                audioContextRef.current = null;
            }

            // Stop all tracks
            if (streamRefs.current) {
                streamRefs.current.forEach(stream => {
                    stream.getTracks().forEach(track => track.stop());
                });
                streamRefs.current = [];
            }
          };

          const handleData = () => {
            const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
            cleanup();
            resolve(blob);
          };

          if (recorder.state === 'inactive') {
            handleData();
          } else {
            recorder.onstop = handleData;
            try { recorder.stop(); } catch (e) { handleData(); }
          }
        });
    };

    const captureFrame = () => {
        if (canvasRef.current) {
          try {
              return canvasRef.current.toDataURL('image/png');
          } catch (e) {
              console.error("Capture frame failed", e);
              return null;
          }
        }
        return null;
    };

    return {
        startRecording,
        stopRecording,
        captureFrame
    };
};
