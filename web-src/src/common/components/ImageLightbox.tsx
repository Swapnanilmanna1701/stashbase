import { useEffect, useRef, useState, type PointerEvent } from 'react';

export function ImageLightbox({ src, alt = '', onClose }: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    // Inline the zoom/reset logic off the stable state setters so the
    // listener binds once per `onClose` rather than re-binding on every
    // render (each zoom/pan tick re-renders).
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === '0') { setScale(1); setOffset({ x: 0, y: 0 }); }
      else if (e.key === '+' || e.key === '=') setScale((v) => clamp(v * 1.2));
      else if (e.key === '-') setScale((v) => clamp(v / 1.2));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // React's delegated wheel events are not reliable for blocking the
  // browser's default scroll/zoom behavior in Electron. Match ImagePreview:
  // bind a native passive:false listener directly to the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setScale((v) => {
        const next = clamp(v * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        if (next <= 1) {
          setOffset({ x: 0, y: 0 });
          dragRef.current = null;
        }
        return next;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function zoomBy(factor: number) {
    setScale((v) => {
      const next = clamp(v * factor);
      if (next <= 1) {
        setOffset({ x: 0, y: 0 });
        dragRef.current = null;
      }
      return next;
    });
  }

  function download() {
    const link = document.createElement('a');
    link.href = src;
    link.download = safeDownloadName(alt);
    link.click();
    link.remove();
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (scale <= 1) return;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  }

  return (
    /* The dark scrim is a deliberate overlay color, independent of the
     * app theme — the lightbox always reads as a dark stage. The
     * `quick-open-blocking` marker keeps Quick Open from opening on top. */
    <div className={`quick-open-blocking fixed inset-0 z-90 flex flex-col ${STAGE_SCRIM_CLASS} text-white`} role="dialog" aria-modal="true" aria-label="Image preview">
      <div
        ref={stageRef}
        className={
          'grid min-h-0 flex-1 touch-none place-items-center overflow-hidden' +
          (scale > 1 ? ' cursor-grab active:cursor-grabbing' : ' cursor-zoom-in')
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          className="max-h-[calc(100vh-108px)] max-w-[calc(100vw-64px)] origin-center object-contain shadow-[0_16px_60px_rgba(var(--shadow-color),0.35)] transition-transform duration-fast ease-out select-none"
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        />
      </div>
      <div className="absolute top-4 right-4 z-1 flex gap-2">
        <button type="button" className={FLOATING_BTN_CLASS} aria-label="Download image" title="Download" onClick={download}>
          <LightboxIcon kind="download" />
        </button>
        <button type="button" className={FLOATING_BTN_CLASS} aria-label="Close image preview" title="Close" onClick={onClose}>
          <LightboxIcon kind="close" />
        </button>
      </div>
      <div className={`absolute bottom-5 left-1/2 z-1 flex -translate-x-1/2 items-center gap-1 rounded-full ${STAGE_TOOLBAR_CLASS} p-1 shadow-elevation`}>
        <button type="button" className={FLOATING_BTN_CLASS} aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          <ZoomGlyph />
        </button>
        <span className="min-w-[66px] text-center text-base text-white/80 tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" className={FLOATING_BTN_CLASS} aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.2)}>
          <ZoomGlyph plus />
        </button>
      </div>
    </div>
  );
}

/* The lightbox is a deliberate always-dark stage, independent of the app
 * theme (light mode must not lighten it). The scrim uses the theme-static
 * `bg-scrim` role (`--scrim` in globals.css); the raised toolbar is a raw
 * lighter step of the same near-black, so the two read as one dark system
 * rather than two unrelated darks. */
const STAGE_SCRIM_CLASS = 'bg-scrim';
const STAGE_TOOLBAR_CLASS = 'bg-[rgba(38,39,42,0.96)]';

/** 38px circular white-on-dark control — always styled for the dark
 *  stage, never the app theme. Stays `no-drag` so the frameless-window
 *  drag region can't swallow clicks near the top edge. */
const FLOATING_BTN_CLASS =
  'grid size-9.5 cursor-pointer place-items-center rounded-full border-0 bg-white/10 p-0 text-white [font-family:inherit] hover:bg-white/15 [-webkit-app-region:no-drag]';

function LightboxIcon({ kind }: { kind: 'download' | 'close' }) {
  const common = {
    className: 'size-[15px]',
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'download') return (
    <svg {...common}><path d="M8 2.25v7.5m0 0 2.7-2.7M8 9.75 5.3 7.05M3 10.75v2h10v-2" /></svg>
  );
  return <svg {...common}><path d="m3.5 3.5 9 9m0-9-9 9" /></svg>;
}

function ZoomGlyph({ plus = false }: { plus?: boolean }) {
  return (
    <svg className="size-4.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 8h9" />
      {plus && <path d="M8 3.5v9" />}
    </svg>
  );
}

function safeDownloadName(name: string): string {
  const trimmed = name.trim();
  return trimmed && !/[\\/:*?"<>|]/.test(trimmed) ? trimmed : 'image';
}

function clamp(value: number): number {
  return Math.min(6, Math.max(0.2, value));
}
