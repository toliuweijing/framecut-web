
import { Subtitle, ZoomEffect, SpotlightEffect, MosaicEffect, MosaicPath } from '../types';

// Easing functions for smooth animation
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const lerp = (start: number, end: number, t: number) => {
  return start + (end - start) * t;
};

// Helper to calculate zoom rect at a specific time
export const calculateZoomRect = (zoom: ZoomEffect, currentTime: number) => {
    const duration = zoom.end - zoom.start;
    const transitionDuration = Math.min(1.0, duration / 2); 
    
    if (currentTime < zoom.start || currentTime > zoom.end) {
        return { x: 0, y: 0, width: 100, height: 100, isTransitioning: false };
    }

    const localTime = currentTime - zoom.start;

    // 1. Entry Phase (Zoom In)
    if (localTime < transitionDuration) {
        const t = easeInOutCubic(localTime / transitionDuration);
        return {
            x: lerp(0, zoom.x, t),
            y: lerp(0, zoom.y, t),
            width: lerp(100, zoom.width, t),
            height: lerp(100, zoom.height, t),
            isTransitioning: true
        };
    } 
    
    // 2. Exit Phase (Zoom Out)
    if (localTime > (duration - transitionDuration)) {
         const exitElapsed = localTime - (duration - transitionDuration);
         const t = easeInOutCubic(exitElapsed / transitionDuration);
         return {
             x: lerp(zoom.x, 0, t),
             y: lerp(zoom.width, 100, t),
             width: lerp(zoom.width, 100, t),
             height: lerp(zoom.height, 100, t),
             isTransitioning: true
         };
    }

    // 3. Static Zoomed State (Hold)
    return {
        x: zoom.x,
        y: zoom.y,
        width: zoom.width,
        height: zoom.height,
        isTransitioning: false
    };
};

export const renderVideoFrame = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    canvasWidth: number,
    canvasHeight: number,
    zoom: ZoomEffect | undefined,
    playing: boolean,
    selectedZoom: ZoomEffect | null,
    currentGlobalTime: number,
    activeClipTiming: { offset: number; sourceStart: number; speed: number } | null | undefined
): { shouldCrop: boolean, drawX: number, drawY: number, drawW: number, drawH: number } | null => {
    
    const shouldCrop = !!(zoom && (playing || !selectedZoom));
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = playing ? 'low' : 'high';
    
    let rect = { x: 0, y: 0, width: 100, height: 100 };

    if (shouldCrop && zoom) {
       rect = { x: zoom.x, y: zoom.y, width: zoom.width, height: zoom.height };
       
       let effectiveTime = currentGlobalTime;
       if (playing && !video.paused && !video.ended && activeClipTiming) {
            effectiveTime = ((video.currentTime - activeClipTiming.sourceStart) / activeClipTiming.speed) + activeClipTiming.offset;
       }

       if (effectiveTime != null) {
           const calculated = calculateZoomRect(zoom, effectiveTime);
           rect = { x: calculated.x, y: calculated.y, width: calculated.width, height: calculated.height };
       }

       const sx = (rect.x / 100) * video.videoWidth;
       const sy = (rect.y / 100) * video.videoHeight;
       const sw = (rect.width / 100) * video.videoWidth;
       const sh = (rect.height / 100) * video.videoHeight;
       
       try {
           ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
       } catch(e) {}
    } else {
       try {
           ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
       } catch(e) {}
    }

    return shouldCrop ? { shouldCrop: true, drawX: rect.x, drawY: rect.y, drawW: rect.width, drawH: rect.height } : null;
};

export const renderMosaic = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement | null,
    mosaic: MosaicEffect,
    pixelCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
    canvasWidth: number,
    canvasHeight: number,
    cropInfo: { shouldCrop: boolean, drawX: number, drawY: number, drawW: number, drawH: number } | null,
    bgColor?: string
) => {
    if (mosaic.paths.length === 0) return;

    pixelCanvas.width = canvasWidth;
    pixelCanvas.height = canvasHeight;
    const pCtx = pixelCanvas.getContext('2d');
    if (!pCtx) return;

    const pixelFactor = 0.02; 
    const wScaled = Math.max(1, canvasWidth * pixelFactor);
    const hScaled = Math.max(1, canvasHeight * pixelFactor);

    try {
        if (video) {
            if (cropInfo && cropInfo.shouldCrop) {
               const sx = (cropInfo.drawX / 100) * video.videoWidth;
               const sy = (cropInfo.drawY / 100) * video.videoHeight;
               const sw = (cropInfo.drawW / 100) * video.videoWidth;
               const sh = (cropInfo.drawH / 100) * video.videoHeight;
               pCtx.drawImage(video, sx, sy, sw, sh, 0, 0, wScaled, hScaled);
            } else {
               pCtx.drawImage(video, 0, 0, wScaled, hScaled);
            }
        } else if (bgColor) {
            pCtx.fillStyle = bgColor;
            pCtx.fillRect(0, 0, wScaled, hScaled);
        }
    } catch(e) { return; }

    pCtx.imageSmoothingEnabled = false;
    pCtx.drawImage(pixelCanvas, 0, 0, wScaled, hScaled, 0, 0, canvasWidth, canvasHeight);

    maskCanvas.width = canvasWidth;
    maskCanvas.height = canvasHeight;
    const mCtx = maskCanvas.getContext('2d');
    if (!mCtx) return;

    mCtx.lineCap = 'round';
    mCtx.lineJoin = 'round';
    mCtx.fillStyle = 'white';
    mCtx.strokeStyle = 'white';

    mosaic.paths.forEach(path => {
      if (path.points.length === 0) return;
      const brushPx = (path.brushSize / 100) * Math.min(canvasWidth, canvasHeight);
      mCtx.lineWidth = brushPx;
      mCtx.beginPath();
      path.points.forEach((pt, i) => {
         const x = (pt.x / 100) * canvasWidth;
         const y = (pt.y / 100) * canvasHeight;
         if (i === 0) mCtx.moveTo(x, y); else mCtx.lineTo(x, y);
      });
      if (path.points.length === 1) {
         const pt = path.points[0];
         mCtx.moveTo((pt.x / 100) * canvasWidth, (pt.y / 100) * canvasHeight);
         mCtx.lineTo((pt.x / 100) * canvasWidth, (pt.y / 100) * canvasHeight);
      }
      mCtx.stroke();
    });

    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.drawImage(maskCanvas, 0, 0);
    pCtx.globalCompositeOperation = 'source-over'; 
    ctx.drawImage(pixelCanvas, 0, 0);
};

export const renderSpotlight = (
    ctx: CanvasRenderingContext2D,
    spotlight: SpotlightEffect,
    canvasWidth: number,
    canvasHeight: number,
    selectedSpotlight: SpotlightEffect | null,
    playing: boolean,
    currentTime: number
) => {
    // Transition Logic: 300ms fade in/out
    const transitionDuration = 0.3;
    let alphaFactor = 1.0;
    
    if (playing) {
        if (currentTime < spotlight.start + transitionDuration) {
            alphaFactor = easeInOutCubic((currentTime - spotlight.start) / transitionDuration);
        } else if (currentTime > spotlight.end - transitionDuration) {
            alphaFactor = easeInOutCubic((spotlight.end - currentTime) / transitionDuration);
        }
    }
    alphaFactor = Math.max(0, Math.min(1, alphaFactor));
    
    const intensity = spotlight.intensity ?? 0.7;
    const shape = spotlight.shape ?? 'circle';

    const lx = (spotlight.x / 100) * canvasWidth;
    const ly = (spotlight.y / 100) * canvasHeight;
    const lw = (spotlight.width / 100) * canvasWidth;
    const lh = (spotlight.height / 100) * canvasHeight;

    ctx.save();
    
    if (shape === 'rectangle') {
        const alpha = 0.9 * alphaFactor * intensity;
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.beginPath();
        ctx.rect(0, 0, canvasWidth, canvasHeight);
        // Punch hole
        if ((ctx as any).roundRect) {
            (ctx as any).roundRect(lx, ly, lw, lh, 12);
        } else {
            ctx.rect(lx, ly, lw, lh);
        }
        ctx.fill('evenodd');
    } else {
        // Standard Circular Radial Vignette
        const cx = lx + lw / 2;
        const cy = ly + lh / 2;
        const radius = Math.max(lw, lh) / 2;
        
        const gradient = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.2);
        const alpha = 0.9 * alphaFactor * intensity;
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    
    ctx.restore();
};

export const renderSubtitles = (
    ctx: CanvasRenderingContext2D,
    subtitles: Subtitle[],
    canvasWidth: number,
    canvasHeight: number
) => {
    subtitles.forEach(sub => {
        ctx.save();
        const x = (sub.x ?? 50) / 100 * canvasWidth;
        const y = (sub.y ?? 80) / 100 * canvasHeight;
        const scale = sub.scale ?? 1;
        const rotation = (sub.rotation ?? 0) * Math.PI / 180;

        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);

        const fontSize = Math.max(12, canvasHeight * 0.05);
        ctx.font = `500 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text Shadow/Outline for readability
        ctx.strokeStyle = 'black';
        ctx.lineWidth = fontSize * 0.15;
        ctx.lineJoin = 'round';
        ctx.strokeText(sub.text, 0, 0);

        ctx.fillStyle = 'white';
        ctx.fillText(sub.text, 0, 0);

        ctx.restore();
    });
};

export const renderPreview = (
    previewCanvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    selectedZoom: ZoomEffect | null,
    activeZoom: ZoomEffect | undefined,
    selectedSpotlight: SpotlightEffect | null,
    activeSpotlight: SpotlightEffect | undefined,
    playing: boolean,
    currentTime: number
) => {
    const pCtx = previewCanvas.getContext('2d');
    if (!pCtx) return;

    previewCanvas.width = 160;
    previewCanvas.height = 90;

    pCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
    
    // Draw indicators for effects on preview
    if (activeZoom) {
        pCtx.strokeStyle = '#10b981';
        pCtx.lineWidth = 2;
        pCtx.strokeRect(
            (activeZoom.x / 100) * previewCanvas.width,
            (activeZoom.y / 100) * previewCanvas.height,
            (activeZoom.width / 100) * previewCanvas.width,
            (activeZoom.height / 100) * previewCanvas.height
        );
    }
};