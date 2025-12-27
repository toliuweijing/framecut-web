
import React, { useState, useRef, useEffect, RefObject } from 'react';
import { Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, MosaicPath } from '../types';

interface UseCanvasInteractionProps {
    activeSubtitles: Subtitle[];
    selectedZoomEffect: ZoomEffect | null;
    selectedSpotlightEffect: SpotlightEffect | null;
    selectedMosaicEffect: MosaicEffect | null;
    activeMosaicEffect: MosaicEffect | undefined;
    isPlaying: boolean;
    contentRef: RefObject<HTMLDivElement>;
    currentBrushSize: number;
    onUpdateSubtitle: (sub: Subtitle) => void;
    onUpdateZoomEffect: (zoom: ZoomEffect) => void;
    onUpdateSpotlightEffect: (spotlight: SpotlightEffect) => void;
    onUpdateMosaicEffect: (mosaic: MosaicEffect) => void;
    onSelectSubtitle: (id: string) => void;
    onInteractionStart?: () => void;
}

export const useCanvasInteraction = ({
    activeSubtitles,
    selectedZoomEffect,
    selectedSpotlightEffect,
    selectedMosaicEffect,
    activeMosaicEffect,
    isPlaying,
    contentRef,
    currentBrushSize,
    onUpdateSubtitle,
    onUpdateZoomEffect,
    onUpdateSpotlightEffect,
    onUpdateMosaicEffect,
    onSelectSubtitle,
    onInteractionStart
}: UseCanvasInteractionProps) => {
    
    const draggedItemIdRef = useRef<string | null>(null);

    // Subtitle Drag/Transform State
    const [subDragState, setSubDragState] = useState<{
        id: string;
        mode: 'move' | 'rotate' | 'scale';
        x: number;
        y: number;
        rotation: number;
        scale: number;
        startX: number;
        startY: number;
        initialAngle?: number;
        initialDistance?: number;
    } | null>(null);

    const [zoomDragState, setZoomDragState] = useState<{
        type: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';
        startX: number;
        startY: number;
        initialBox: { x: number, y: number, width: number, height: number };
    } | null>(null);

    const [spotlightDragState, setSpotlightDragState] = useState<{
        type: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';
        startX: number;
        startY: number;
        initialBox: { x: number, y: number, width: number, height: number };
    } | null>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const currentPathRef = useRef<MosaicPath | null>(null);

    const handleMosaicMouseDown = (e: React.MouseEvent) => {
        if (!selectedMosaicEffect || isPlaying) return;
        const isEditMode = selectedMosaicEffect.id === activeMosaicEffect?.id;
        if (!isEditMode) return;
        e.preventDefault(); e.stopPropagation(); 
        if (onInteractionStart) onInteractionStart();
        setIsDrawing(true);
        if (contentRef.current) {
           const rect = contentRef.current.getBoundingClientRect();
           const xPct = ((e.clientX - rect.left) / rect.width) * 100;
           const yPct = ((e.clientY - rect.top) / rect.height) * 100;
           currentPathRef.current = { points: [{ x: xPct, y: yPct }], brushSize: currentBrushSize || 10 };
           const updatedPaths = [...selectedMosaicEffect.paths, currentPathRef.current];
           onUpdateMosaicEffect({ ...selectedMosaicEffect, paths: updatedPaths });
        }
    };

    const handleMosaicMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !currentPathRef.current || !selectedMosaicEffect || !contentRef.current) return;
        e.preventDefault(); e.stopPropagation();
        const rect = contentRef.current.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        currentPathRef.current.points.push({ x: xPct, y: yPct });
        const paths = [...selectedMosaicEffect.paths];
        paths[paths.length - 1] = { ...currentPathRef.current };
        onUpdateMosaicEffect({ ...selectedMosaicEffect, paths: paths });
    };

    const handleMosaicMouseUp = () => { if (isDrawing) { setIsDrawing(false); currentPathRef.current = null; } };
    
    const handleSubMouseDown = (e: React.MouseEvent, sub: Subtitle, mode: 'move' | 'rotate' | 'scale' = 'move') => { 
        e.preventDefault(); e.stopPropagation(); 
        if (onInteractionStart) onInteractionStart();
        onSelectSubtitle(sub.id);
        draggedItemIdRef.current = sub.id; 

        const rect = contentRef.current?.getBoundingClientRect();
        let initialAngle, initialDistance;
        if (rect) {
            const centerX = rect.left + (sub.x ?? 50) / 100 * rect.width;
            const centerY = rect.top + (sub.y ?? 80) / 100 * rect.height;
            if (mode === 'rotate') {
                initialAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
            } else if (mode === 'scale') {
                initialDistance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
            }
        }
        
        setSubDragState({ 
            id: sub.id, 
            mode, 
            x: sub.x ?? 50, 
            y: sub.y ?? 80, 
            rotation: sub.rotation ?? 0, 
            scale: sub.scale ?? 1,
            startX: e.clientX,
            startY: e.clientY,
            initialAngle,
            initialDistance
        }); 
    };
    
    const handleZoomMouseDown = (e: React.MouseEvent, type: any) => { 
        e.preventDefault(); e.stopPropagation(); 
        if (!selectedZoomEffect) return; 
        if (onInteractionStart) onInteractionStart();
        setZoomDragState({ type, startX: e.clientX, startY: e.clientY, initialBox: { x: selectedZoomEffect.x, y: selectedZoomEffect.y, width: selectedZoomEffect.width, height: selectedZoomEffect.height } }); 
    };
    
    const handleSpotlightMouseDown = (e: React.MouseEvent, type: any) => { 
        e.preventDefault(); e.stopPropagation(); 
        if (!selectedSpotlightEffect) return; 
        if (onInteractionStart) onInteractionStart();
        setSpotlightDragState({ type, startX: e.clientX, startY: e.clientY, initialBox: { x: selectedSpotlightEffect.x, y: selectedSpotlightEffect.y, width: selectedSpotlightEffect.width, height: selectedSpotlightEffect.height } }); 
    };

    useEffect(() => {
        const handleWindowMouseMove = (e: MouseEvent) => {
          if (!contentRef.current) return;
          const rect = contentRef.current.getBoundingClientRect();
          
          if (subDragState) {
            const centerX = rect.left + subDragState.x / 100 * rect.width;
            const centerY = rect.top + subDragState.y / 100 * rect.height;

            if (subDragState.mode === 'move') {
                let relativeX = e.clientX - rect.left; let relativeY = e.clientY - rect.top;
                let percentX = (relativeX / rect.width) * 100; let percentY = (relativeY / rect.height) * 100;
                percentX = Math.max(0, Math.min(100, percentX)); percentY = Math.max(0, Math.min(100, percentY));
                setSubDragState(prev => prev ? { ...prev, x: percentX, y: percentY } : null);
            } else if (subDragState.mode === 'rotate') {
                const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
                const deltaRotation = currentAngle - (subDragState.initialAngle || 0);
                setSubDragState(prev => prev ? { ...prev, rotation: (prev.rotation + deltaRotation) } : null);
                // We update initialAngle to current so next move is a delta from now
                setSubDragState(prev => prev ? { ...prev, initialAngle: currentAngle } : null);
            } else if (subDragState.mode === 'scale') {
                const currentDistance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
                const ratio = currentDistance / (subDragState.initialDistance || 1);
                const newScale = Math.max(0.2, Math.min(5, subDragState.scale * ratio));
                setSubDragState(prev => prev ? { ...prev, scale: newScale, initialDistance: currentDistance } : null);
            }
          }
          
          if (zoomDragState && selectedZoomEffect) {
             const init = zoomDragState.initialBox;
             const handleBoxResize = (e: MouseEvent, rect: DOMRect, dragState: any, init: any, updateCallback: (box: any) => void) => {
                 if (dragState.type === 'move') {
                   const deltaXPx = e.clientX - dragState.startX; const deltaYPx = e.clientY - dragState.startY;
                   const newX = Math.max(0, Math.min(100 - init.width, init.x + (deltaXPx / rect.width) * 100));
                   const newY = Math.max(0, Math.min(100 - init.height, init.y + (deltaYPx / rect.height) * 100));
                   updateCallback({ x: newX, y: newY, width: init.width, height: init.height });
                 } else {
                    let anchorX = 0, anchorY = 0, isLeft = false, isTop = false;
                    if (dragState.type.includes('tl')) { anchorX = init.x + init.width; anchorY = init.y + init.height; isLeft = true; isTop = true; }
                    else if (dragState.type.includes('tr')) { anchorX = init.x; anchorY = init.y + init.height; isLeft = false; isTop = true; }
                    else if (dragState.type.includes('bl')) { anchorX = init.x + init.width; anchorY = init.y; isLeft = true; isTop = false; }
                    else { anchorX = init.x; anchorY = init.y; isLeft = false; isTop = false; }
                    let mousePctX = ((e.clientX - rect.left) / rect.width) * 100;
                    let mousePctY = ((e.clientY - rect.top) / rect.height) * 100;
                    let rawWidth = Math.abs(mousePctX - anchorX); let rawHeight = Math.abs(mousePctY - anchorY);
                    let size = Math.max(rawWidth, rawHeight);
                    const limit = Math.min(isLeft ? anchorX : (100 - anchorX), isTop ? anchorY : (100 - anchorY));
                    size = Math.min(size, limit); size = Math.max(5, size);
                    updateCallback({ x: isLeft ? anchorX - size : anchorX, y: isTop ? anchorY - size : anchorY, width: size, height: size });
                 }
             };
             handleBoxResize(e, rect, zoomDragState, init, (newBox) => onUpdateZoomEffect({ ...selectedZoomEffect, ...newBox }));
          }
          
          if (spotlightDragState && selectedSpotlightEffect) {
             const init = spotlightDragState.initialBox;
              const handleSpotlightResize = (e: MouseEvent, rect: DOMRect, dragState: any, init: any, updateCallback: (box: any) => void) => {
                 const initXPx = (init.x / 100) * rect.width; const initYPx = (init.y / 100) * rect.height;
                 const initWidthPx = (init.width / 100) * rect.width; const initHeightPx = (init.height / 100) * rect.height;
                 if (dragState.type === 'move') {
                   const deltaXPx = e.clientX - dragState.startX; const deltaYPx = e.clientY - dragState.startY;
                   const newXPx = Math.max(0, Math.min(rect.width - initWidthPx, initXPx + deltaXPx));
                   const newYPx = Math.max(0, Math.min(rect.height - initHeightPx, initYPx + deltaYPx));
                   updateCallback({ x: (newXPx / rect.width) * 100, y: (newYPx / rect.height) * 100, width: init.width, height: init.height });
                 } else {
                    let anchorXPx = 0, anchorYPx = 0, isLeft = false, isTop = false;
                    if (dragState.type.includes('tl')) { anchorXPx = initXPx + initWidthPx; anchorYPx = initYPx + initHeightPx; isLeft = true; isTop = true; }
                    else if (dragState.type.includes('tr')) { anchorXPx = initXPx; anchorYPx = initYPx + initHeightPx; isLeft = false; isTop = true; }
                    else if (dragState.type.includes('bl')) { anchorXPx = initXPx + initWidthPx; anchorYPx = initYPx; isLeft = true; isTop = false; }
                    else { anchorXPx = initXPx; anchorYPx = initYPx; isLeft = false; isTop = false; }
                    const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
                    let rawWidthPx = Math.abs(mouseX - anchorXPx); let rawHeightPx = Math.abs(mouseY - anchorYPx);
                    let sizePx = Math.max(rawWidthPx, rawHeightPx);
                    const limitPx = Math.min(isLeft ? anchorXPx : (rect.width - anchorXPx), isTop ? anchorYPx : (rect.height - anchorYPx));
                    sizePx = Math.min(sizePx, limitPx); sizePx = Math.max(20, sizePx);
                    updateCallback({ x: ((isLeft ? anchorXPx - sizePx : anchorXPx) / rect.width) * 100, y: ((isTop ? anchorYPx - sizePx : anchorYPx) / rect.height) * 100, width: (sizePx / rect.width) * 100, height: (sizePx / rect.height) * 100 });
                 }
             };
             handleSpotlightResize(e, rect, spotlightDragState, init, (newBox) => onUpdateSpotlightEffect({ ...selectedSpotlightEffect, ...newBox }));
          }
        };
        const handleWindowMouseUp = () => {
          if (subDragState) {
            draggedItemIdRef.current = null;
            const draggedSub = activeSubtitles.find(s => s.id === subDragState.id);
            if (draggedSub) onUpdateSubtitle({ 
                ...draggedSub, 
                x: subDragState.x, 
                y: subDragState.y, 
                rotation: subDragState.rotation,
                scale: subDragState.scale
            });
            setSubDragState(null);
          }
          setZoomDragState(null); setSpotlightDragState(null); if (isDrawing) { setIsDrawing(false); currentPathRef.current = null; }
        };
        if (subDragState || zoomDragState || spotlightDragState || isDrawing) { window.addEventListener('mousemove', handleWindowMouseMove); window.addEventListener('mouseup', handleWindowMouseUp); }
        return () => { window.removeEventListener('mousemove', handleWindowMouseMove); window.removeEventListener('mouseup', handleWindowMouseUp); };
    }, [subDragState, zoomDragState, spotlightDragState, isDrawing, activeSubtitles, selectedZoomEffect, selectedSpotlightEffect, onUpdateSubtitle, onUpdateZoomEffect, onUpdateSpotlightEffect]);

    return {
        subDragState,
        handleSubMouseDown,
        handleZoomMouseDown,
        handleSpotlightMouseDown,
        handleMosaicMouseDown,
        handleMosaicMouseMove,
        handleMosaicMouseUp,
        draggedItemIdRef 
    };
};
