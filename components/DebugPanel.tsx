import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '../types';

interface DebugPanelProps {
    state: EditorState;
    videoTime: number | null;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ state, videoTime }) => {
    const [fps, setFps] = useState(0);
    const framesRef = useRef(0);
    const lastTimeRef = useRef(performance.now());

    // Measure render frequency
    useEffect(() => {
        framesRef.current++;
        const now = performance.now();
        if (now - lastTimeRef.current >= 1000) {
            setFps(framesRef.current);
            framesRef.current = 0;
            lastTimeRef.current = now;
        }
    });

    // Measure delta between React State Time and Actual Video Time
    const drift = videoTime !== null ? (state.currentTime - videoTime).toFixed(4) : 'N/A';
    const isLagging = Math.abs(Number(drift)) > 0.1;

    return (
        <div className="fixed top-4 left-4 z-[9999] bg-black/90 text-green-400 p-4 rounded-md font-mono text-xs border border-green-900 shadow-xl pointer-events-auto opacity-75 hover:opacity-100 transition-opacity">
            <h3 className="font-bold border-b border-green-800 mb-2 pb-1">Performance Diagnostic</h3>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div className="text-zinc-500">FPS (React):</div>
                <div className={fps < 50 ? 'text-red-500 font-bold' : ''}>{fps}</div>

                <div className="text-zinc-500">React Time:</div>
                <div>{state.currentTime.toFixed(3)}s</div>

                <div className="text-zinc-500">Video Time:</div>
                <div>{videoTime?.toFixed(3) ?? '0.000'}s</div>

                <div className="text-zinc-500">Drift:</div>
                <div className={isLagging ? 'text-red-500 font-bold animate-pulse' : ''}>{drift}s</div>

                <div className="text-zinc-500">Playback Rate:</div>
                <div>{state.playbackRate}x</div>

                <div className="text-zinc-500">Objects:</div>
                <div>{state.clips.length} clips</div>
            </div>

            {isLagging && (
                <div className="mt-3 p-2 bg-red-900/20 border border-red-900/50 rounded text-red-400">
                    ⚠️ <strong>High Latency Detected</strong><br />
                    React state is lagging behind video playback.
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-green-900/50 text-[10px] text-zinc-600">
                Diagnosis: Driving animation via setState()
            </div>
        </div>
    );
};
