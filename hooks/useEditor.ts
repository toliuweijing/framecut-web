
import { useState, useCallback, useRef, useEffect } from 'react';
import { ExtendedEditorState, Clip, Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect } from '../types';
import { generateId } from '../utils';
import { useHistory } from './useHistory';
import { useClipOperations } from './useClipOperations';

type ProjectState = Pick<ExtendedEditorState, 'intro' | 'mainVideo' | 'outro' | 'audio' | 'duration' | 'clips' | 'audioClips' | 'subtitles' | 'zoomEffects' | 'spotlightEffects' | 'mosaicEffects' | 'selection' | 'fileName' | 'isAudioTrackMuted' | 'coverImage'>;

export const useEditor = () => {
    const [state, setState] = useState<ExtendedEditorState>({
        intro: null,
        mainVideo: null,
        outro: null,
        audio: null,
        duration: 0,
        currentTime: 0,
        isPlaying: false,
        playbackRate: 1,
        zoomLevel: 50,
        fileName: null,
        showDebug: false,
        clips: [],
        audioClips: [],
        subtitles: [],
        zoomEffects: [],
        spotlightEffects: [],
        mosaicEffects: [],
        selection: null,
        isExporting: false,
        isExportingAudio: false,
        currentBrushSize: 10,
        exportProgress: 0,
        showSuccessToast: false,
        isAudioTrackMuted: false,
        coverImage: null
    });

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Loop Control Refs
    const currentTimeRef = useRef(state.currentTime);
    const isPlayingRef = useRef(state.isPlaying);
    const animationFrameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(performance.now());
    const lastUiUpdateRef = useRef<number>(0);

    const { push, undo, redo } = useHistory<ProjectState>();

    const recalculateDuration = useCallback((
        clips: Clip[],
        audioClips: Clip[],
        subtitles: Subtitle[],
        zoomEffects: ZoomEffect[],
        spotlightEffects: SpotlightEffect[],
        mosaicEffects: MosaicEffect[]
    ): number => {
        const lastClipEnd = clips.reduce((max, c) => {
            const duration = (c.sourceEnd - c.sourceStart) / c.speed;
            return Math.max(max, c.offset + duration);
        }, 0);

        const lastAudioEnd = audioClips.reduce((max, c) => {
            const duration = (c.sourceEnd - c.sourceStart) / c.speed;
            return Math.max(max, c.offset + duration);
        }, 0);

        const lastSubEnd = subtitles.reduce((max, s) => Math.max(max, s.end), 0);
        const lastZoomEnd = zoomEffects.reduce((max, z) => Math.max(max, z.end), 0);
        const lastSpotEnd = spotlightEffects.reduce((max, s) => Math.max(max, s.end), 0);
        const lastMosEnd = mosaicEffects.reduce((max, m) => Math.max(max, m.end), 0);

        let total = Math.max(lastClipEnd, lastAudioEnd, lastSubEnd, lastZoomEnd, lastSpotEnd, lastMosEnd);
        if (clips.length === 0 && audioClips.length === 0 && total === 0) total = 0;
        return total;
    }, []);

    const getProjectState = (fullState: ExtendedEditorState): ProjectState => ({
        intro: fullState.intro,
        mainVideo: fullState.mainVideo,
        outro: fullState.outro,
        audio: fullState.audio,
        duration: fullState.duration,
        clips: fullState.clips,
        audioClips: fullState.audioClips,
        subtitles: fullState.subtitles,
        zoomEffects: fullState.zoomEffects,
        spotlightEffects: fullState.spotlightEffects,
        mosaicEffects: fullState.mosaicEffects,
        selection: fullState.selection,
        fileName: fullState.fileName,
        isAudioTrackMuted: fullState.isAudioTrackMuted,
        coverImage: fullState.coverImage
    });

    const pushHistory = useCallback(() => {
        const currentProjectState = getProjectState(stateRef.current);
        push(currentProjectState);
    }, [push]);

    const handleUndo = useCallback(() => {
        const current = getProjectState(stateRef.current);
        const previous = undo(current);
        if (previous) {
            setState(prev => ({ ...prev, ...previous }));
            currentTimeRef.current = stateRef.current.currentTime;
        }
    }, [undo]);

    const handleRedo = useCallback(() => {
        const current = getProjectState(stateRef.current);
        const next = redo(current);
        if (next) {
            setState(prev => ({ ...prev, ...next }));
            currentTimeRef.current = stateRef.current.currentTime;
        }
    }, [redo]);

    const {
        handleDelete,
        handleSplit,
        handleUpdateClip,
        handleUpdateSubtitle,
        handleUpdateZoomEffect,
        handleUpdateSpotlightEffect,
        handleUpdateMosaicEffect,
        handleAddSubtitle,
        handleAddZoom,
        handleAddSpotlight,
        handleAddMosaic
    } = useClipOperations({ setState, pushHistory, recalculateDuration });

    const handleSeek = useCallback((time: number) => {
        currentTimeRef.current = time;
        setState(prev => ({ ...prev, currentTime: time }));
    }, []);

    // DIRECT-DRIVE PLAYBACK LOOP
    useEffect(() => {
        if (state.isPlaying) {
            lastTimeRef.current = performance.now();
            isPlayingRef.current = true;

            const loop = (timestamp: number) => {
                if (!isPlayingRef.current) return;

                const delta = (timestamp - lastTimeRef.current) / 1000;
                lastTimeRef.current = timestamp;

                const { duration, playbackRate, isExporting, exportProgress } = stateRef.current;

                let newTime = currentTimeRef.current + delta * playbackRate;
                let newProgress = exportProgress;

                if (isExporting) {
                    newProgress = Math.min(100, Math.floor((newTime / duration) * 100));
                }

                if (duration > 0 && newTime >= duration) {
                    if (isExporting) {
                        isPlayingRef.current = false;
                        newTime = duration;
                        newProgress = 100;
                    } else {
                        newTime = 0;
                    }
                }

                // High-Frequency Update
                currentTimeRef.current = newTime;

                // Low-Frequency UI/Sync Update (Decoupled from render loop to kill drift)
                // We update React at 5 FPS during playback, but keep 60 FPS for Export or when Paused
                const throttleMs = isExporting ? 0 : 200; 

                if (timestamp - lastUiUpdateRef.current > throttleMs) {
                    lastUiUpdateRef.current = timestamp;
                    setState(prev => ({
                        ...prev,
                        currentTime: newTime,
                        exportProgress: newProgress,
                        isPlaying: isPlayingRef.current ? prev.isPlaying : false
                    }));
                }

                if (isPlayingRef.current) {
                    animationFrameRef.current = requestAnimationFrame(loop);
                }
            };

            animationFrameRef.current = requestAnimationFrame(loop);
        } else {
            isPlayingRef.current = false;
            // Immediate sync when pausing
            setState(prev => ({ ...prev, currentTime: currentTimeRef.current }));
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [state.isPlaying]);

    const handleDetachAudio = useCallback(() => {
        pushHistory();
        setState(prev => {
            if (prev.selection?.type !== 'clip') return prev;
            const clipId = prev.selection.id;
            const videoClip = prev.clips.find(c => c.id === clipId);
            if (!videoClip) return prev;
            const newAudioClip: Clip = { ...videoClip, id: generateId(), muted: false };
            const updatedVideoClips = prev.clips.map(c => c.id === clipId ? { ...c, muted: true } : c);
            const updatedAudioClips = [...prev.audioClips, newAudioClip];
            return { ...prev, clips: updatedVideoClips, audioClips: updatedAudioClips, selection: { type: 'audio', id: newAudioClip.id }, duration: recalculateDuration(updatedVideoClips, updatedAudioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects) };
        });
    }, [pushHistory, recalculateDuration]);

    const handleZoomScaleChange = useCallback((scale: number) => {
        pushHistory();
        setState(prev => {
            if (prev.selection?.type !== 'zoom') return prev;
            const zoom = prev.zoomEffects.find(z => z.id === prev.selection!.id);
            if (!zoom) return prev;
            const newSize = 100 / scale;
            const centerX = zoom.x + zoom.width / 2;
            const centerY = zoom.y + zoom.height / 2;
            const newWidth = newSize;
            const newHeight = newSize;
            return {
                ...prev,
                zoomEffects: prev.zoomEffects.map(z => z.id === zoom.id ? {
                    ...z,
                    width: newWidth,
                    height: newHeight,
                    x: Math.max(0, Math.min(100 - newWidth, centerX - newWidth / 2)),
                    y: Math.max(0, Math.min(100 - newHeight, centerY - newHeight / 2))
                } : z)
            };
        });
    }, [pushHistory]);

    const handleMosaicBrushSizeChange = useCallback((size: number) => {
        setState(prev => ({ ...prev, currentBrushSize: size }));
    }, []);

    const handleClipSpeedChange = useCallback((speed: number) => {
        pushHistory();
        setState(prev => {
            const { selection, clips, audioClips } = prev;
            if (!selection) return prev;
            const isAudio = selection.type === 'audio';
            const targetClips = isAudio ? audioClips : clips;
            const targetId = selection.id;
            const clipIndex = targetClips.findIndex(c => c.id === targetId);
            if (clipIndex === -1) return prev;
            const clip = targetClips[clipIndex];
            const oldDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
            const newDuration = (clip.sourceEnd - clip.sourceStart) / speed;
            const durationDelta = newDuration - oldDuration;
            const newTrackClips = [...targetClips];
            newTrackClips[clipIndex] = { ...clip, speed };
            for (let i = clipIndex + 1; i < newTrackClips.length; i++) {
                newTrackClips[i] = {
                    ...newTrackClips[i],
                    offset: newTrackClips[i].offset + durationDelta
                };
            }
            const newClips = isAudio ? clips : newTrackClips;
            const newAudioClips = isAudio ? newTrackClips : audioClips;
            return {
                ...prev,
                clips: newClips,
                audioClips: newAudioClips,
                duration: recalculateDuration(newClips, newAudioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [pushHistory, recalculateDuration]);

    const handleToggleDebug = useCallback(() => {
        setState(prev => ({ ...prev, showDebug: !prev.showDebug }));
    }, []);

    const handleSetCoverImage = useCallback((url: string | null) => {
        setState(prev => ({ ...prev, coverImage: url }));
    }, []);

    return {
        state,
        setState,
        stateRef,
        pushHistory,
        handleUndo,
        handleRedo,
        recalculateDuration,
        handleDelete,
        handleSplit,
        handleUpdateClip,
        handleUpdateSubtitle,
        handleUpdateZoomEffect,
        handleUpdateSpotlightEffect,
        handleUpdateMosaicEffect,
        handleDetachAudio,
        handleAddSubtitle,
        handleAddZoom,
        handleAddSpotlight,
        handleAddMosaic,
        handleZoomScaleChange,
        handleMosaicBrushSizeChange,
        handleClipSpeedChange,
        handleToggleDebug,
        handleSeek,
        handleSetCoverImage,
        currentTimeRef,
        isPlayingRef
    };
};
