import { useState, useCallback, useRef, useEffect } from 'react';
import { EditorState, Clip, Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, Selection, MediaAsset } from '../types';
import { generateId, getVideoDuration, extractWaveform } from '../utils';

export interface ExtendedEditorState extends EditorState {
    isExporting: boolean;
    isExportingAudio: boolean;
    currentBrushSize: number;
    exportProgress: number;
    showSuccessToast: boolean;
    isAudioTrackMuted: boolean;
}

type ProjectState = Pick<ExtendedEditorState, 'intro' | 'mainVideo' | 'outro' | 'audio' | 'duration' | 'clips' | 'audioClips' | 'subtitles' | 'zoomEffects' | 'spotlightEffects' | 'mosaicEffects' | 'selection' | 'fileName' | 'isAudioTrackMuted'>;

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
        isAudioTrackMuted: false
    });

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Loop Control Refs
    const currentTimeRef = useRef(state.currentTime);
    const isPlayingRef = useRef(state.isPlaying);
    const animationFrameRef = useRef<number>();
    const lastTimeRef = useRef<number>(Date.now());
    const lastUiUpdateRef = useRef<number>(0);

    const historyRef = useRef<{ past: ProjectState[]; future: ProjectState[] }>({ past: [], future: [] });

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
    });

    const pushHistory = useCallback(() => {
        const currentProjectState = getProjectState(stateRef.current);
        historyRef.current.past.push(currentProjectState);
        historyRef.current.future = [];
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    }, []);

    const handleUndo = useCallback(() => {
        if (historyRef.current.past.length === 0) return;
        const previous = historyRef.current.past.pop();
        const current = getProjectState(stateRef.current);
        if (previous) {
            historyRef.current.future.push(current);
            setState(prev => ({ ...prev, ...previous }));
        }
    }, []);

    const handleSeek = useCallback((time: number) => {
        currentTimeRef.current = time;
        setState(prev => ({ ...prev, currentTime: time }));
    }, []);

    // Playback Loop
    useEffect(() => {
        if (state.isPlaying) {
            lastTimeRef.current = Date.now();
            isPlayingRef.current = true;

            const loop = () => {
                if (!isPlayingRef.current) return;

                const now = Date.now();
                const delta = (now - lastTimeRef.current) / 1000;
                lastTimeRef.current = now;

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

                currentTimeRef.current = newTime;

                // Throttle UI Updates:
                // Normal Speed (<= 2x): Sync with every RAF (0ms delay) to maximize FPS (up to 60Hz or 120Hz)
                // High Speed (> 2x): Throttle to ~15 FPS (66ms) to prevent UI lag
                // The previous 16ms check caused dropped frames due to Jitter (16.67ms vs 16ms)
                const throttleMs = playbackRate > 2.0 ? 66 : 0;

                if (throttleMs === 0 || now - lastUiUpdateRef.current > throttleMs || !isPlayingRef.current || isExporting) {
                    lastUiUpdateRef.current = now;
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
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [state.isPlaying]);

    const handleRedo = useCallback(() => {
        if (historyRef.current.future.length === 0) return;
        const next = historyRef.current.future.pop();
        const current = getProjectState(stateRef.current);
        if (next) {
            historyRef.current.past.push(current);
            setState(prev => ({ ...prev, ...next }));
        }
    }, []);

    const handleDelete = useCallback(() => {
        pushHistory();
        setState(prev => {
            if (!prev.selection) return prev;
            let newClips = prev.clips;
            let newAudioClips = prev.audioClips;
            let newSubtitles = prev.subtitles;
            let newZooms = prev.zoomEffects;
            let newSpots = prev.spotlightEffects;
            let newMosaics = prev.mosaicEffects;
            if (prev.selection.type === 'clip') {
                newClips = prev.clips.filter(c => c.id !== prev.selection!.id);
                newClips.sort((a, b) => a.offset - b.offset);
                let currentOffset = 0;
                newClips = newClips.map(clip => {
                    const visualDuration = (clip.sourceEnd - clip.sourceStart) / clip.speed;
                    const updatedClip = { ...clip, offset: currentOffset };
                    currentOffset += visualDuration;
                    return updatedClip;
                });
            } else if (prev.selection.type === 'audio') {
                newAudioClips = prev.audioClips.filter(c => c.id !== prev.selection!.id);
            } else if (prev.selection.type === 'subtitle') {
                newSubtitles = prev.subtitles.filter(s => s.id !== prev.selection!.id);
            } else if (prev.selection.type === 'zoom') {
                newZooms = prev.zoomEffects.filter(z => z.id !== prev.selection!.id);
            } else if (prev.selection.type === 'spotlight') {
                newSpots = prev.spotlightEffects.filter(s => s.id !== prev.selection!.id);
            } else if (prev.selection.type === 'mosaic') {
                newMosaics = prev.mosaicEffects.filter(m => m.id !== prev.selection!.id);
            }
            return { ...prev, clips: newClips, audioClips: newAudioClips, subtitles: newSubtitles, zoomEffects: newZooms, spotlightEffects: newSpots, mosaicEffects: newMosaics, selection: null, duration: recalculateDuration(newClips, newAudioClips, newSubtitles, newZooms, newSpots, newMosaics) };
        });
    }, [pushHistory, recalculateDuration]);

    const handleSplit = useCallback(() => {
        pushHistory();
        setState(prev => {
            const cursor = prev.currentTime;
            let newClips = [...prev.clips];
            let newAudioClips = [...prev.audioClips];
            let newSelection = prev.selection;
            if (prev.selection?.type === 'clip') {
                const clipIndex = prev.clips.findIndex(c => c.id === prev.selection!.id);
                if (clipIndex !== -1) {
                    const originalClip = prev.clips[clipIndex];
                    const duration = (originalClip.sourceEnd - originalClip.sourceStart) / originalClip.speed;
                    if (cursor >= originalClip.offset && cursor < originalClip.offset + duration) {
                        const timeIntoClipVisual = cursor - originalClip.offset;
                        const timeIntoClipSource = timeIntoClipVisual * originalClip.speed;
                        const splitPointSource = originalClip.sourceStart + timeIntoClipSource;
                        if (timeIntoClipSource >= 0.1 && (originalClip.sourceEnd - splitPointSource) >= 0.1) {
                            const leftClip: Clip = { ...originalClip, id: generateId(), sourceEnd: splitPointSource };
                            const rightClip: Clip = { ...originalClip, id: generateId(), sourceStart: splitPointSource, offset: cursor };
                            newClips.splice(clipIndex, 1, leftClip, rightClip);
                            newSelection = { type: 'clip', id: rightClip.id };
                        }
                    }
                }
            } else if (prev.selection?.type === 'audio') {
                const clipIndex = prev.audioClips.findIndex(c => c.id === prev.selection!.id);
                if (clipIndex !== -1) {
                    const activeAudioClip = prev.audioClips[clipIndex];
                    const duration = (activeAudioClip.sourceEnd - activeAudioClip.sourceStart) / activeAudioClip.speed;
                    if (cursor >= activeAudioClip.offset && cursor < activeAudioClip.offset + duration) {
                        const timeIntoClipVisual = cursor - activeAudioClip.offset;
                        const timeIntoClipSource = timeIntoClipVisual * activeAudioClip.speed;
                        const splitPointSource = activeAudioClip.sourceStart + timeIntoClipSource;
                        if (timeIntoClipSource >= 0.1 && (activeAudioClip.sourceEnd - splitPointSource) >= 0.1) {
                            const leftClip: Clip = { ...activeAudioClip, id: generateId(), sourceEnd: splitPointSource };
                            const rightClip: Clip = { ...activeAudioClip, id: generateId(), sourceStart: splitPointSource, offset: cursor };
                            newAudioClips.splice(clipIndex, 1, leftClip, rightClip);
                            newSelection = { type: 'audio', id: rightClip.id };
                        }
                    }
                }
            }
            return { ...prev, clips: newClips, audioClips: newAudioClips, selection: newSelection };
        });
    }, [pushHistory]);

    const handleUpdateClip = useCallback((updatedClip: Clip) => {
        setState(prev => {
            const oldClip = prev.clips.find(c => c.id === updatedClip.id) || prev.audioClips.find(c => c.id === updatedClip.id);
            if (!oldClip) return prev;

            const isAudio = prev.audioClips.some(c => c.id === updatedClip.id);

            // Video Track Ripple Logic
            if (!isAudio) {
                let finalUpdatedClip = { ...updatedClip };

                // Intro Rules: Always starts at 0
                if (finalUpdatedClip.mediaType === 'intro') {
                    finalUpdatedClip.offset = 0;
                }

                const oldDuration = (oldClip.sourceEnd - oldClip.sourceStart) / oldClip.speed;
                const newDuration = (finalUpdatedClip.sourceEnd - finalUpdatedClip.sourceStart) / finalUpdatedClip.speed;

                const oldEnd = oldClip.offset + oldDuration;
                const newEnd = finalUpdatedClip.offset + newDuration;
                const shift = newEnd - oldEnd;

                let newClips = prev.clips.map(c => c.id === finalUpdatedClip.id ? finalUpdatedClip : c);

                // Ripple if Intro or if Clip position didn't change (implies duration edit)
                const isOffsetConstant = Math.abs(finalUpdatedClip.offset - oldClip.offset) < 0.001;
                const isIntro = finalUpdatedClip.mediaType === 'intro';

                if ((isIntro || isOffsetConstant) && Math.abs(shift) > 0.001) {
                    newClips = newClips.map(c => {
                        if (c.id === finalUpdatedClip.id) return c;
                        // Shift subsequent clips
                        if (c.offset > oldClip.offset + 0.001) {
                            return { ...c, offset: c.offset + shift };
                        }
                        return c;
                    });
                }

                return {
                    ...prev,
                    clips: newClips,
                    duration: recalculateDuration(newClips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
                };
            }

            // Audio Track (No Ripple)
            const newAudioClips = prev.audioClips.map(c => c.id === updatedClip.id ? updatedClip : c);
            return {
                ...prev,
                audioClips: newAudioClips,
                duration: recalculateDuration(prev.clips, newAudioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration]);

    const handleUpdateSubtitle = useCallback((updatedSubtitle: Subtitle) => {
        setState(prev => {
            const newSubtitles = prev.subtitles.map(s => s.id === updatedSubtitle.id ? updatedSubtitle : s);
            return {
                ...prev,
                subtitles: newSubtitles,
                duration: recalculateDuration(prev.clips, prev.audioClips, newSubtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration]);

    const handleUpdateZoomEffect = useCallback((updatedZoom: ZoomEffect) => {
        setState(prev => {
            const newZooms = prev.zoomEffects.map(z => z.id === updatedZoom.id ? updatedZoom : z);
            return {
                ...prev,
                zoomEffects: newZooms,
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, newZooms, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration]);

    const handleUpdateSpotlightEffect = useCallback((updatedSpotlight: SpotlightEffect) => {
        setState(prev => {
            const newSpots = prev.spotlightEffects.map(s => s.id === updatedSpotlight.id ? updatedSpotlight : s);
            return {
                ...prev,
                spotlightEffects: newSpots,
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, newSpots, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration]);

    const handleUpdateMosaicEffect = useCallback((updatedMosaic: MosaicEffect) => {
        setState(prev => {
            const newMosaics = prev.mosaicEffects.map(m => m.id === updatedMosaic.id ? updatedMosaic : m);
            return {
                ...prev,
                mosaicEffects: newMosaics,
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, newMosaics)
            };
        });
    }, [recalculateDuration]);

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

    const handleAddSubtitle = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newSub: Subtitle = {
                id: generateId(),
                text: "New Subtitle",
                start: prev.currentTime,
                end: prev.currentTime + 3,
                x: 50,
                y: 80
            };
            const newSubtitles = [...prev.subtitles, newSub];
            return {
                ...prev,
                subtitles: newSubtitles,
                selection: { type: 'subtitle', id: newSub.id },
                duration: recalculateDuration(prev.clips, prev.audioClips, newSubtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [pushHistory, recalculateDuration]);

    const handleAddZoom = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newZoom: ZoomEffect = {
                id: generateId(),
                start: prev.currentTime,
                end: prev.currentTime + 3,
                x: 10, y: 10, width: 80, height: 80
            };
            const newZooms = [...prev.zoomEffects, newZoom];
            return {
                ...prev,
                zoomEffects: newZooms,
                selection: { type: 'zoom', id: newZoom.id },
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, newZooms, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [pushHistory, recalculateDuration]);

    const handleAddSpotlight = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newSpot: SpotlightEffect = {
                id: generateId(),
                start: prev.currentTime,
                end: prev.currentTime + 3,
                x: 40, y: 40, width: 20, height: 20
            };
            const newSpots = [...prev.spotlightEffects, newSpot];
            return {
                ...prev,
                spotlightEffects: newSpots,
                selection: { type: 'spotlight', id: newSpot.id },
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, newSpots, prev.mosaicEffects)
            };
        });
    }, [pushHistory, recalculateDuration]);

    const handleAddMosaic = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newMosaic: MosaicEffect = {
                id: generateId(),
                start: prev.currentTime,
                end: prev.currentTime + 3,
                paths: []
            };
            const newMosaics = [...prev.mosaicEffects, newMosaic];
            return {
                ...prev,
                mosaicEffects: newMosaics,
                selection: { type: 'mosaic', id: newMosaic.id },
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, newMosaics)
            };
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
        handleSeek,
        currentTimeRef,
        isPlayingRef
    };
};
