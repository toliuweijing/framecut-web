
import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { MediaAsset, Clip, SpotlightEffect, ExtendedEditorState } from '../types';
import { generateId, getVideoDuration, extractWaveform } from '../utils';

interface UseAssetOperationsProps {
    setState: Dispatch<SetStateAction<ExtendedEditorState>>;
    pushHistory: () => void;
    recalculateDuration: (
        clips: Clip[],
        audioClips: Clip[],
        subtitles: any[],
        zoomEffects: any[],
        spotlightEffects: any[],
        mosaicEffects: any[]
    ) => number;
    currentTimeRef: React.MutableRefObject<number>;
}

export const useAssetOperations = ({ setState, pushHistory, recalculateDuration, currentTimeRef }: UseAssetOperationsProps) => {

    const updateStateWithAsset = (type: 'intro' | 'main' | 'outro' | 'audio', asset: MediaAsset, duration: number) => {
        setState(prev => {
            let newState = { ...prev };

            // Reset cover image if replacing the main video
            if (type === 'main') {
                newState.coverImage = null;
            }

            if (type === 'audio') {
                newState.audio = asset;
                const nonAudioTypeClips = prev.audioClips.filter(c => c.mediaType !== 'audio');
                const newAudioClip: Clip = { id: generateId(), sourceStart: 0, sourceEnd: duration, offset: 0, speed: 1.0, mediaType: 'audio' };
                newState.audioClips = [...nonAudioTypeClips, newAudioClip];
            } else if (type === 'intro') {
                newState.intro = asset;
                const otherClips = prev.clips.filter(c => c.mediaType !== 'intro');
                const newIntroClip: Clip = { id: generateId(), sourceStart: 0, sourceEnd: duration, offset: 0, speed: 1.0, mediaType: 'intro' };
                otherClips.sort((a, b) => a.offset - b.offset);
                let currentOffset = duration;
                const shiftedClips = otherClips.map(c => {
                    const dur = (c.sourceEnd - c.sourceStart) / c.speed;
                    const clip = { ...c, offset: currentOffset };
                    currentOffset += dur;
                    return clip;
                });
                newState.clips = [newIntroClip, ...shiftedClips];
            } else if (type === 'outro') {
                newState.outro = asset;
                const otherClips = prev.clips.filter(c => c.mediaType !== 'outro');
                otherClips.sort((a, b) => a.offset - b.offset);
                let currentOffset = 0;
                otherClips.forEach(c => {
                    const dur = (c.sourceEnd - c.sourceStart) / c.speed;
                    currentOffset = Math.max(currentOffset, c.offset + dur);
                });
                const newOutroClip: Clip = { id: generateId(), sourceStart: 0, sourceEnd: duration, offset: currentOffset, speed: 1.0, mediaType: 'outro' };
                newState.clips = [...otherClips, newOutroClip];
            } else if (type === 'main') {
                newState.mainVideo = asset;
                newState.fileName = asset.name;
                const introClips = prev.clips.filter(c => c.mediaType === 'intro');
                const outroClips = prev.clips.filter(c => c.mediaType === 'outro');
                const newMainClip: Clip = { id: generateId(), sourceStart: 0, sourceEnd: duration, offset: 0, speed: 1.0, mediaType: 'main' };
                introClips.sort((a, b) => a.offset - b.offset);
                let currentOffset = 0;
                const finalIntroClips = introClips.map(c => {
                    const dur = (c.sourceEnd - c.sourceStart) / c.speed;
                    const clip = { ...c, offset: currentOffset };
                    currentOffset += dur;
                    return clip;
                });
                newMainClip.offset = currentOffset;
                currentOffset += (newMainClip.sourceEnd - newMainClip.sourceStart);
                outroClips.sort((a, b) => a.offset - b.offset);
                const finalOutroClips = outroClips.map(c => {
                    const dur = (c.sourceEnd - c.sourceStart) / c.speed;
                    const clip = { ...c, offset: currentOffset };
                    currentOffset += dur;
                    return clip;
                });
                newState.clips = [...finalIntroClips, newMainClip, ...finalOutroClips];
            }
            newState.duration = recalculateDuration(newState.clips, newState.audioClips, newState.subtitles, newState.zoomEffects, newState.spotlightEffects, newState.mosaicEffects);
            return newState;
        });
    }

    // Logic for initializing a fresh project (used by screen recorder or initial load)
    const handleLoadProject = useCallback(async (url: string, name: string, initialSpotlights: SpotlightEffect[] = []) => {
        const { duration, corsCompatible } = await getVideoDuration(url);
        const asset: MediaAsset = {
            id: generateId(),
            src: url,
            name: name,
            duration: duration,
            corsCompatible: corsCompatible
        };

        currentTimeRef.current = 0;
        setState(prev => ({
            ...prev,
            mainVideo: asset,
            intro: null,
            outro: null,
            audio: null,
            fileName: name,
            currentTime: 0,
            isPlaying: false,
            clips: [{
                id: generateId(),
                sourceStart: 0,
                sourceEnd: duration,
                offset: 0,
                speed: 1.0,
                mediaType: 'main'
            }],
            audioClips: [],
            subtitles: [],
            zoomEffects: [],
            spotlightEffects: initialSpotlights,
            mosaicEffects: [],
            selection: null,
            isExporting: false,
            isExportingAudio: false,
            exportProgress: 0,
            showSuccessToast: false,
            duration: duration,
            coverImage: null // Reset cover image for new project
        }));

        if (corsCompatible) {
            extractWaveform(url).then(waveformData => {
                setState(prev => {
                    if (prev.mainVideo && prev.mainVideo.id === asset.id) {
                        return {
                            ...prev,
                            mainVideo: { ...prev.mainVideo, waveformData }
                        };
                    }
                    return prev;
                });
            });
        }
    }, [currentTimeRef, setState]);

    const handleUrlImport = async (type: 'intro' | 'main' | 'outro' | 'audio', url: string) => {
        pushHistory();
        try {
            const { duration, corsCompatible } = await getVideoDuration(url);
            const asset: MediaAsset = {
                id: generateId(),
                src: url,
                name: url.split('/').pop() || 'Remote Video',
                duration: duration,
                corsCompatible: corsCompatible
            };
            updateStateWithAsset(type, asset, duration);
            if (corsCompatible) {
                extractWaveform(url).then(waveformData => {
                    setState(prev => {
                        const currentAsset = type === 'intro' ? prev.intro : type === 'outro' ? prev.outro : type === 'audio' ? prev.audio : prev.mainVideo;
                        if (currentAsset && currentAsset.id === asset.id) {
                            const updated = { ...prev };
                            if (type === 'intro') updated.intro = { ...currentAsset, waveformData };
                            else if (type === 'main') updated.mainVideo = { ...currentAsset, waveformData };
                            else if (type === 'outro') updated.outro = { ...currentAsset, waveformData };
                            else if (type === 'audio') updated.audio = { ...currentAsset, waveformData };
                            return updated;
                        }
                        return prev;
                    });
                }).catch(e => console.warn("Waveform extract failed", e));
            }
        } catch (e: any) {
            console.error("URL Import Failed", e);
            alert(typeof e === 'string' ? e : (e.message || "Failed to load video from URL."));
            throw e;
        }
    };

    const handleUploadAsset = async (type: 'intro' | 'main' | 'outro' | 'audio', file: File) => {
        pushHistory();
        try {
            const url = URL.createObjectURL(file);
            const { duration } = await getVideoDuration(url);
            const asset: MediaAsset = { id: generateId(), src: url, name: file.name, duration: duration, corsCompatible: true };
            updateStateWithAsset(type, asset, duration);
            extractWaveform(url).then(waveformData => {
                setState(prev => {
                    const currentAsset = type === 'intro' ? prev.intro : type === 'outro' ? prev.outro : type === 'audio' ? prev.audio : prev.mainVideo;
                    if (currentAsset && currentAsset.id === asset.id) {
                        const updatedAsset = { ...currentAsset, waveformData };
                        const updated = { ...prev };
                        if (type === 'intro') updated.intro = updatedAsset;
                        else if (type === 'main') updated.mainVideo = updatedAsset;
                        else if (type === 'outro') updated.outro = updatedAsset;
                        else if (type === 'audio') updated.audio = updatedAsset;
                        return updated;
                    }
                    return prev;
                });
            });
        } catch (e) {
            console.error("Failed to load media", e);
            alert("Failed to load file. Please try a different one.");
        }
    };

    const handleSetColorAsset = (type: 'intro' | 'outro', color: string) => {
        pushHistory();
        const asset: MediaAsset = { id: generateId(), src: `color:${color}`, name: `Color Block`, duration: 5.0, corsCompatible: true };
        updateStateWithAsset(type, asset, 5.0);
    };

    const handleRemoveAsset = (type: 'intro' | 'main' | 'outro' | 'audio') => {
        pushHistory();
        setState(prev => {
            let newState = { ...prev };
            if (type === 'intro') newState.intro = null;
            if (type === 'outro') newState.outro = null;
            if (type === 'main') newState.mainVideo = null;
            if (type === 'audio') newState.audio = null;
            const remainingClips = newState.clips.filter(c => c.mediaType !== type);
            remainingClips.sort((a, b) => a.offset - b.offset);
            let currentOffset = 0;
            const shiftedClips = remainingClips.map(c => {
                const dur = (c.sourceEnd - c.sourceStart) / c.speed;
                const clip = { ...c, offset: currentOffset };
                currentOffset += dur;
                return clip;
            });
            newState.clips = shiftedClips;
            newState.audioClips = newState.audioClips.filter(c => c.mediaType !== type);
            newState.duration = recalculateDuration(newState.clips, newState.audioClips, newState.subtitles, newState.zoomEffects, newState.spotlightEffects, newState.mosaicEffects);
            return newState;
        });
    };

    return {
        handleLoadProject,
        handleUrlImport,
        handleUploadAsset,
        handleSetColorAsset,
        handleRemoveAsset
    };
};
