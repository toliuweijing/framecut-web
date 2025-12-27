
import React, { useCallback, useEffect, RefObject } from 'react';
import { ExtendedEditorState, PlayerRef } from '../types';

interface UseExportProps {
    state: ExtendedEditorState;
    setState: React.Dispatch<React.SetStateAction<ExtendedEditorState>>;
    playerRef: RefObject<PlayerRef>;
    currentTimeRef: React.MutableRefObject<number>;
}

export const useExport = ({ state, setState, playerRef, currentTimeRef }: UseExportProps) => {

    const handleExportAction = useCallback((audioOnly: boolean, format?: 'mp4' | 'webm') => {
        if (state.clips.length === 0 && state.audioClips.length === 0) return;
        
        // Reset to start
        currentTimeRef.current = 0;
        setState(prev => ({ ...prev, isPlaying: false, currentTime: 0, exportProgress: 0 }));
        
        // Use a timeout to break the stack and allow state to settle
        setTimeout(async () => {
          if (playerRef.current) {
            try {
              setState(prev => ({ ...prev, isExporting: true, isExportingAudio: audioOnly }));
              
              // CRITICAL FIX: Explicitly wait for the video to seek to 0 and be ready
              // This prevents the "black frames at start" issue
              await playerRef.current.seekTo(0);
              
              // Add a small buffer for the canvas to paint the first frame after seeking
              await new Promise(resolve => setTimeout(resolve, 500));

              await playerRef.current.startRecording({ audioOnly, format });
              setState(prev => ({ ...prev, isPlaying: true }));
            } catch (e) {
              console.error("Export failed to start", e);
              setState(prev => ({ ...prev, isExporting: false, isPlaying: false }));
            }
          }
        }, 100);
    }, [state.clips, state.audioClips, setState, currentTimeRef, playerRef]);

    // Handle Export Completion Monitoring
    useEffect(() => {
        if (state.isExporting && !state.isPlaying && state.currentTime >= state.duration) {
          const finishExport = async () => {
            if (playerRef.current) {
              const blob = await playerRef.current.stopRecording();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              
              // Check what the browser actually gave us
              const isMp4 = blob.type.includes('mp4');
              const ext = state.isExportingAudio ? 'webm' : (isMp4 ? 'mp4' : 'webm');
              
              a.download = `exported-${state.fileName || 'project'}.${ext}`;
              a.click();
              // Cleanup
              setTimeout(() => URL.revokeObjectURL(url), 100);
            }
            
            currentTimeRef.current = 0;
            setState(prev => ({ 
                ...prev, 
                isExporting: false, 
                isExportingAudio: false, 
                currentTime: 0, 
                exportProgress: 100, 
                showSuccessToast: true 
            }));
            
            setTimeout(() => setState(prev => ({ ...prev, showSuccessToast: false })), 3000);
          };
          
          finishExport();
        }
    }, [state.isExporting, state.isPlaying, state.currentTime, state.duration, state.fileName, state.isExportingAudio, setState, currentTimeRef, playerRef]);

    return {
        handleExportAction
    };
};
