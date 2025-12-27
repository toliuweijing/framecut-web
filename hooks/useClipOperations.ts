
import { Dispatch, SetStateAction, useCallback } from 'react';
import { ExtendedEditorState, Clip, Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect } from '../types';
import { generateId } from '../utils';

interface UseClipOperationsProps {
    setState: Dispatch<SetStateAction<ExtendedEditorState>>;
    pushHistory: () => void;
    recalculateDuration: (
        clips: Clip[],
        audioClips: Clip[],
        subtitles: Subtitle[],
        zoomEffects: ZoomEffect[],
        spotlightEffects: SpotlightEffect[],
        mosaicEffects: MosaicEffect[]
    ) => number;
}

export const useClipOperations = ({ setState, pushHistory, recalculateDuration }: UseClipOperationsProps) => {

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
                // Ripple Delete for Video Track
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
    }, [pushHistory, recalculateDuration, setState]);

    const handleSplit = useCallback(() => {
        pushHistory();
        setState(prev => {
            const cursor = prev.currentTime;
            let newClips = [...prev.clips];
            let newAudioClips = [...prev.audioClips];
            let newSelection = prev.selection;
            
            const performSplit = (tracks: Clip[], type: 'clip' | 'audio') => {
                const clipIndex = tracks.findIndex(c => c.id === prev.selection!.id);
                if (clipIndex !== -1) {
                    const originalClip = tracks[clipIndex];
                    const duration = (originalClip.sourceEnd - originalClip.sourceStart) / originalClip.speed;
                    if (cursor >= originalClip.offset && cursor < originalClip.offset + duration) {
                        const timeIntoClipVisual = cursor - originalClip.offset;
                        const timeIntoClipSource = timeIntoClipVisual * originalClip.speed;
                        const splitPointSource = originalClip.sourceStart + timeIntoClipSource;
                        if (timeIntoClipSource >= 0.1 && (originalClip.sourceEnd - splitPointSource) >= 0.1) {
                            const leftClip: Clip = { ...originalClip, id: generateId(), sourceEnd: splitPointSource };
                            const rightClip: Clip = { ...originalClip, id: generateId(), sourceStart: splitPointSource, offset: cursor };
                            if (type === 'clip') {
                                newClips.splice(clipIndex, 1, leftClip, rightClip);
                                newSelection = { type: 'clip', id: rightClip.id };
                            } else {
                                newAudioClips.splice(clipIndex, 1, leftClip, rightClip);
                                newSelection = { type: 'audio', id: rightClip.id };
                            }
                        }
                    }
                }
            };

            if (prev.selection?.type === 'clip') performSplit(prev.clips, 'clip');
            else if (prev.selection?.type === 'audio') performSplit(prev.audioClips, 'audio');

            return { ...prev, clips: newClips, audioClips: newAudioClips, selection: newSelection };
        });
    }, [pushHistory, setState]);

    const handleUpdateClip = useCallback((updatedClip: Clip) => {
        setState(prev => {
            const oldClip = prev.clips.find(c => c.id === updatedClip.id) || prev.audioClips.find(c => c.id === updatedClip.id);
            if (!oldClip) return prev;

            const isAudio = prev.audioClips.some(c => c.id === updatedClip.id);

            // Video Track Ripple Logic
            if (!isAudio) {
                let finalUpdatedClip = { ...updatedClip };
                if (finalUpdatedClip.mediaType === 'intro') finalUpdatedClip.offset = 0;

                const oldDuration = (oldClip.sourceEnd - oldClip.sourceStart) / oldClip.speed;
                const newDuration = (finalUpdatedClip.sourceEnd - finalUpdatedClip.sourceStart) / finalUpdatedClip.speed;
                const oldEnd = oldClip.offset + oldDuration;
                const newEnd = finalUpdatedClip.offset + newDuration;
                const shift = newEnd - oldEnd;

                let newClips = prev.clips.map(c => c.id === finalUpdatedClip.id ? finalUpdatedClip : c);

                const isOffsetConstant = Math.abs(finalUpdatedClip.offset - oldClip.offset) < 0.001;
                const isIntro = finalUpdatedClip.mediaType === 'intro';

                if ((isIntro || isOffsetConstant) && Math.abs(shift) > 0.001) {
                    newClips = newClips.map(c => {
                        if (c.id === finalUpdatedClip.id) return c;
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
    }, [recalculateDuration, setState]);

    const handleUpdateSubtitle = useCallback((updatedSubtitle: Subtitle) => {
        setState(prev => {
            const newSubtitles = prev.subtitles.map(s => s.id === updatedSubtitle.id ? updatedSubtitle : s);
            return {
                ...prev,
                subtitles: newSubtitles,
                duration: recalculateDuration(prev.clips, prev.audioClips, newSubtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration, setState]);

    const handleUpdateZoomEffect = useCallback((updatedZoom: ZoomEffect) => {
        setState(prev => {
            const newZooms = prev.zoomEffects.map(z => z.id === updatedZoom.id ? updatedZoom : z);
            return {
                ...prev,
                zoomEffects: newZooms,
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, newZooms, prev.spotlightEffects, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration, setState]);

    const handleUpdateSpotlightEffect = useCallback((updatedSpotlight: SpotlightEffect) => {
        setState(prev => {
            const newSpots = prev.spotlightEffects.map(s => s.id === updatedSpotlight.id ? updatedSpotlight : s);
            return {
                ...prev,
                spotlightEffects: newSpots,
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, newSpots, prev.mosaicEffects)
            };
        });
    }, [recalculateDuration, setState]);

    const handleUpdateMosaicEffect = useCallback((updatedMosaic: MosaicEffect) => {
        setState(prev => {
            const newMosaics = prev.mosaicEffects.map(m => m.id === updatedMosaic.id ? updatedMosaic : m);
            return {
                ...prev,
                mosaicEffects: newMosaics,
                duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, newMosaics)
            };
        });
    }, [recalculateDuration, setState]);

    // Helpers for Adding Items
    const handleAddSubtitle = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newSub: Subtitle = { id: generateId(), text: "New Subtitle", start: prev.currentTime, end: prev.currentTime + 3, x: 50, y: 80 };
            const newSubtitles = [...prev.subtitles, newSub];
            return { ...prev, subtitles: newSubtitles, selection: { type: 'subtitle', id: newSub.id }, duration: recalculateDuration(prev.clips, prev.audioClips, newSubtitles, prev.zoomEffects, prev.spotlightEffects, prev.mosaicEffects) };
        });
    }, [pushHistory, recalculateDuration, setState]);

    const handleAddZoom = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newZoom: ZoomEffect = { id: generateId(), start: prev.currentTime, end: prev.currentTime + 3, x: 10, y: 10, width: 80, height: 80 };
            const newZooms = [...prev.zoomEffects, newZoom];
            return { ...prev, zoomEffects: newZooms, selection: { type: 'zoom', id: newZoom.id }, duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, newZooms, prev.spotlightEffects, prev.mosaicEffects) };
        });
    }, [pushHistory, recalculateDuration, setState]);

    const handleAddSpotlight = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newSpot: SpotlightEffect = { id: generateId(), start: prev.currentTime, end: prev.currentTime + 3, x: 40, y: 40, width: 20, height: 20 };
            const newSpots = [...prev.spotlightEffects, newSpot];
            return { ...prev, spotlightEffects: newSpots, selection: { type: 'spotlight', id: newSpot.id }, duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, newSpots, prev.mosaicEffects) };
        });
    }, [pushHistory, recalculateDuration, setState]);

    const handleAddMosaic = useCallback(() => {
        pushHistory();
        setState(prev => {
            const newMosaic: MosaicEffect = { id: generateId(), start: prev.currentTime, end: prev.currentTime + 3, paths: [] };
            const newMosaics = [...prev.mosaicEffects, newMosaic];
            return { ...prev, mosaicEffects: newMosaics, selection: { type: 'mosaic', id: newMosaic.id }, duration: recalculateDuration(prev.clips, prev.audioClips, prev.subtitles, prev.zoomEffects, prev.spotlightEffects, newMosaics) };
        });
    }, [pushHistory, recalculateDuration, setState]);

    return {
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
    };
};
