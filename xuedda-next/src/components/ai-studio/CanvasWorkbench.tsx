import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Brush,
  Check,
  Hand,
  ImagePlus,
  LassoSelect,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

type Point = { x: number; y: number };
type Tool = 'select' | 'pan' | 'lasso' | 'rectangle' | 'brush' | 'text';
type Sticker = { id: string; src: string; x: number; y: number; width: number; height: number };
type TextDraft = { x: number; y: number; value: string };
export type CanvasAnnotationState = { preview: string; lasso: Point[] };

export type CanvasWorkbenchHandle = {
  exportComposite: () => Promise<string | null>;
  exportReferences: () => string[];
  clearCanvas: () => void;
};

type Props = {
  initialImage?: string;
  initialAnnotation?: CanvasAnnotationState | null;
  onCanvasImageChange?: (hasImage: boolean) => void;
  onMainImageSourceChange?: (source: string) => void;
  onAnnotationChange?: (annotation: CanvasAnnotationState | null) => void;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export const CanvasWorkbench = forwardRef<CanvasWorkbenchHandle, Props>(function CanvasWorkbench({ initialImage = '', initialAnnotation = null, onCanvasImageChange, onMainImageSourceChange, onAnnotationChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const stickerRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const startRef = useRef<Point>({ x: 0, y: 0 });
  const lassoRef = useRef<Point[]>([]);
  const previewRef = useRef<ImageData | null>(null);
  const panRef = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const stickerDragRef = useRef<{ id: string; resize: boolean; clientX: number; clientY: number; x: number; y: number; width: number; height: number } | null>(null);
  const mainImageSourceRef = useRef('');
  const [hasImage, setHasImage] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#111827');
  const [brushSize, setBrushSize] = useState(8);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedSticker, setSelectedSticker] = useState('');
  const [lassoSelection, setLassoSelection] = useState<Point[]>([]);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [notice, setNotice] = useState('');

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas?.width || !canvas.height) return;
    setZoom(Math.min(1, (viewport.clientWidth - 100) / canvas.width, (viewport.clientHeight - 100) / canvas.height));
    setPan({ x: 0, y: 0 });
  }, []);

  const persistAnnotation = useCallback((lasso = lassoSelection) => {
    const canvas = canvasRef.current;
    if (!canvas?.width || !canvas.height) return;
    onAnnotationChange?.({ preview: canvas.toDataURL('image/webp', .9), lasso });
  }, [lassoSelection, onAnnotationChange]);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !canvas.width) return;
    const snapshot = context.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), snapshot].slice(-30);
      setHistoryIndex(next.length - 1);
      return next;
    });
    persistAnnotation();
  }, [historyIndex, persistAnnotation]);

  const setMainImage = useCallback(async (src: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;
    try {
      const image = await loadImage(src);
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      mainImageSourceRef.current = src;
      const snapshot = context.getImageData(0, 0, canvas.width, canvas.height);
      setCanvasSize({ width: canvas.width, height: canvas.height });
      setHistory([snapshot]);
      setHistoryIndex(0);
      setHasImage(true);
      setStickers([]);
      setSelectedSticker('');
      setLassoSelection([]);
      setTextDraft(null);
      setNotice('');
      requestAnimationFrame(fit);
    } catch {
      setNotice('图片加载失败，请重新上传本地图片。');
    }
  }, [fit]);

  useEffect(() => { if (initialImage) void setMainImage(initialImage); }, [initialImage, setMainImage]);
  useEffect(() => {
    if (!hasImage || !initialAnnotation?.preview) return;
    let active = true;
    void loadImage(initialAnnotation.preview).then((image) => {
      if (!active) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const snapshot = context.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([snapshot]);
      setHistoryIndex(0);
      setLassoSelection(initialAnnotation.lasso || []);
    }).catch(() => setNotice('批注恢复失败，干净主图仍可正常使用。'));
    return () => { active = false; };
  }, [hasImage, initialAnnotation]);
  useEffect(() => { onCanvasImageChange?.(hasImage); }, [hasImage, onCanvasImageChange]);
  useEffect(() => {
    const observer = new ResizeObserver(() => fit());
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [fit]);

  async function uploadMain(file?: File) {
    if (!file?.type.startsWith('image/')) return;
    const source = await fileDataUrl(file);
    onAnnotationChange?.(null);
    await setMainImage(source);
    onMainImageSourceChange?.(source);
  }

  async function addSticker(file?: File) {
    if (!hasImage || !file?.type.startsWith('image/')) return;
    const src = await fileDataUrl(file);
    const image = await loadImage(src);
    const scale = Math.min(canvasSize.width * .28 / image.naturalWidth, canvasSize.height * .28 / image.naturalHeight, 1);
    const width = Math.max(60, image.naturalWidth * scale);
    const height = Math.max(60, image.naturalHeight * scale);
    const item = { id: crypto.randomUUID(), src, x: (canvasSize.width - width) / 2, y: (canvasSize.height - height) / 2, width, height };
    setStickers((current) => [...current, item]);
    setSelectedSticker(item.id);
    setNotice('贴图已加入，可拖动位置并从右下角缩放。');
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height };
  }

  function beginDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!hasImage) return;
    if (tool === 'pan' || event.button === 1 || event.altKey) {
      panRef.current = { ...pan, clientX: event.clientX, clientY: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'select') { setSelectedSticker(''); return; }
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const current = point(event);
    if (tool === 'text') {
      event.preventDefault();
      setTextDraft({ x: current.x, y: current.y, value: '' });
      setNotice('输入批注文字后点击确认；批注只用于沟通，不会合并进返图。');
      return;
    }
    drawingRef.current = true;
    startRef.current = current;
    previewRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
    canvas.setPointerCapture(event.pointerId);
    context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = color; context.fillStyle = color; context.lineWidth = brushSize / Math.max(zoom, .2);
    if (tool === 'brush') { context.beginPath(); context.moveTo(current.x, current.y); }
    if (tool === 'lasso') {
      lassoRef.current = [current];
      setLassoSelection([current]);
    }
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (panRef.current) {
      const start = panRef.current;
      setPan({ x: start.x + event.clientX - start.clientX, y: start.y + event.clientY - start.clientY });
      return;
    }
    if (!drawingRef.current) return;
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const current = point(event);
    context.strokeStyle = color; context.lineWidth = brushSize / Math.max(zoom, .2);
    if (tool === 'brush') { context.lineTo(current.x, current.y); context.stroke(); return; }
    if (!previewRef.current) return;
    context.putImageData(previewRef.current, 0, 0);
    context.beginPath();
    if (tool === 'rectangle') context.strokeRect(startRef.current.x, startRef.current.y, current.x - startRef.current.x, current.y - startRef.current.y);
    if (tool === 'lasso') {
      lassoRef.current.push(current);
      setLassoSelection([...lassoRef.current]);
    }
  }

  function endDraw() {
    panRef.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (tool === 'lasso' && previewRef.current) {
      const context = canvasRef.current?.getContext('2d');
      context?.putImageData(previewRef.current, 0, 0);
      persistAnnotation([...lassoRef.current]);
      setNotice('套索范围已标记，可用画笔继续局部标注。');
    } else saveSnapshot();
    previewRef.current = null;
  }

  function restore(index: number) {
    const context = canvasRef.current?.getContext('2d');
    if (!context || !history[index]) return;
    context.putImageData(history[index], 0, 0);
    setHistoryIndex(index);
    persistAnnotation();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    mainImageSourceRef.current = '';
    setHasImage(false); setCanvasSize({ width: 0, height: 0 }); setHistory([]); setHistoryIndex(-1); setStickers([]); setSelectedSticker(''); setLassoSelection([]); setTextDraft(null); setPan({ x: 0, y: 0 }); setNotice('');
    onMainImageSourceChange?.('');
    onAnnotationChange?.(null);
  }

  function commitText() {
    const draft = textDraft;
    const context = canvasRef.current?.getContext('2d');
    const value = draft?.value.trim();
    if (draft && context && value) {
      context.save();
      context.fillStyle = color;
      const fontSize = Math.max(18, brushSize * 3);
      context.font = `600 ${fontSize}px "Microsoft YaHei", sans-serif`;
      context.textBaseline = 'top';
      value.split(/\r?\n/).forEach((line, index) => context.fillText(line, draft.x, draft.y + index * fontSize * 1.35));
      context.restore();
      saveSnapshot();
      setNotice('文字批注已添加；生成时会自动使用无批注的原图。');
    }
    setTextDraft(null);
  }

  async function exportComposite() {
    const source = canvasRef.current;
    const mainImageSource = mainImageSourceRef.current;
    if (!source || !hasImage || !mainImageSource) return null;
    const output = document.createElement('canvas'); output.width = source.width; output.height = source.height;
    const context = output.getContext('2d'); if (!context) return null;
    // Rebuild from the untouched main image. Canvas marks are UI annotations and
    // must never be baked into the image sent to the generation provider.
    const mainImage = await loadImage(mainImageSource);
    context.drawImage(mainImage, 0, 0, output.width, output.height);
    for (const sticker of stickers) { const image = await loadImage(sticker.src); context.drawImage(image, sticker.x, sticker.y, sticker.width, sticker.height); }
    return output.toDataURL('image/jpeg', .9);
  }

  useImperativeHandle(ref, () => ({ exportComposite, exportReferences: () => [], clearCanvas }));

  function beginSticker(event: React.PointerEvent<HTMLDivElement>, sticker: Sticker, resize: boolean) {
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedSticker(sticker.id);
    stickerDragRef.current = { id: sticker.id, resize, clientX: event.clientX, clientY: event.clientY, x: sticker.x, y: sticker.y, width: sticker.width, height: sticker.height };
  }
  function moveSticker(event: React.PointerEvent<HTMLDivElement>) {
    const drag = stickerDragRef.current; if (!drag) return;
    const dx = (event.clientX - drag.clientX) / zoom, dy = (event.clientY - drag.clientY) / zoom;
    setStickers((current) => current.map((item) => item.id !== drag.id ? item : drag.resize
      ? { ...item, width: Math.max(40, drag.width + dx), height: Math.max(40, drag.height + dy) }
      : { ...item, x: drag.x + dx, y: drag.y + dy }));
  }

  const tools: Array<{ id: Tool; label: string; icon: typeof MousePointer2 }> = [
    { id: 'select', label: '选择', icon: MousePointer2 }, { id: 'pan', label: '拖动画布', icon: Hand },
    { id: 'rectangle', label: '框选', icon: SquareDashed }, { id: 'lasso', label: '套索', icon: LassoSelect },
    { id: 'brush', label: '画笔', icon: Brush }, { id: 'text', label: '文字', icon: Type },
  ];

  return <div className="compact-workbench" ref={viewportRef} onWheel={(event) => { if (!hasImage) return; event.preventDefault(); setZoom((value) => Math.min(3, Math.max(.1, value + (event.deltaY < 0 ? .1 : -.1)))); }}>
    {!hasImage && <button className="compact-empty" type="button" onClick={() => uploadRef.current?.click()}><Upload size={24}/><strong>上传主图，或从右侧开始创作</strong><span>主图是需要修改的基础图片 · 支持 JPG、PNG、WebP</span><b>上传主图</b></button>}
    <div className={`compact-canvas-wrap ${hasImage ? '' : 'is-empty'}`} style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom, transform: `translate(${pan.x}px,${pan.y}px)` }}>
      <canvas ref={canvasRef} onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw}/>
      {lassoSelection.length > 1 && <svg className="compact-lasso-overlay" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={lassoSelection.map((item) => `${item.x},${item.y}`).join(' ')} fill={lassoSelection.length > 2 ? color : 'none'} fillOpacity="0.08" stroke={color} strokeWidth={Math.max(1, brushSize / 3)} strokeDasharray="10 7" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      </svg>}
      {textDraft && <div
        className="compact-text-entry"
        style={{ left: textDraft.x * zoom, top: textDraft.y * zoom, color }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <textarea
          autoFocus
          value={textDraft.value}
          placeholder="输入批注文字，可换行"
          onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitText(); }
            if (event.key === 'Escape') setTextDraft(null);
          }}
        />
        <div>
          <small>Ctrl + Enter 确认</small>
          <button type="button" title="取消" onClick={() => setTextDraft(null)}><X size={14}/></button>
          <button type="button" title="确认文字" disabled={!textDraft.value.trim()} onClick={commitText}><Check size={14}/></button>
        </div>
      </div>}
      {stickers.map((sticker) => <div key={sticker.id} className={`compact-sticker ${selectedSticker === sticker.id ? 'selected' : ''}`} style={{ left: sticker.x * zoom, top: sticker.y * zoom, width: sticker.width * zoom, height: sticker.height * zoom }} onPointerDown={(event) => beginSticker(event, sticker, false)} onPointerMove={moveSticker} onPointerUp={() => stickerDragRef.current = null}>
        <img src={sticker.src} alt="贴图" draggable={false}/>{selectedSticker === sticker.id && <i onPointerDown={(event) => beginSticker(event, sticker, true)} onPointerMove={moveSticker} onPointerUp={() => stickerDragRef.current = null}/>}
      </div>)}
    </div>
    {hasImage && <div className="compact-zoom"><button onClick={() => setZoom((v) => Math.max(.1, v - .1))}><Minus size={14}/></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((v) => Math.min(3, v + .1))}><Plus size={14}/></button><button onClick={fit} title="适合画布"><Maximize2 size={14}/></button></div>}
    {hasImage && <div className="compact-tools">
      {tools.map(({id,label,icon:Icon}) => <button key={id} className={tool === id ? 'active' : ''} title={label} onClick={() => {
        setTool(id);
        if (id !== 'text') setTextDraft(null);
        setNotice(id === 'text' ? '文字工具已启用，请在画面上点击文字落点。' : '');
      }}><Icon size={16}/></button>)}
      <button title="更换主图" onClick={() => uploadRef.current?.click()}><Upload size={16}/></button>
      <button title="添加贴图" onClick={() => stickerRef.current?.click()} disabled={!hasImage}><ImagePlus size={16}/></button>
      <button title="撤销" onClick={() => restore(historyIndex - 1)} disabled={historyIndex <= 0}><Undo2 size={16}/></button>
      <button title="重做" onClick={() => restore(historyIndex + 1)} disabled={historyIndex >= history.length - 1}><Redo2 size={16}/></button>
      {selectedSticker && <button title="删除贴图" onClick={() => { setStickers((c) => c.filter((item) => item.id !== selectedSticker)); setSelectedSticker(''); }}><Trash2 size={16}/></button>}
      <button title="删除当前图像" onClick={clearCanvas}><Trash2 size={16}/></button>
    </div>}
    {hasImage && ['brush', 'rectangle', 'lasso', 'text'].includes(tool) && <div className="compact-brush">
      <label title="颜色"><input type="color" value={color} onChange={(e) => setColor(e.target.value)}/></label>
      <span>{tool === 'text' ? '字号' : '粗细'} {tool === 'text' ? Math.max(18, brushSize * 3) : brushSize}</span>
      <input type="range" min="2" max="40" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}/>
    </div>}
    {notice && <p className="compact-notice">{notice}</p>}
    <input ref={uploadRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadMain(event.target.files?.[0]); event.target.value=''; }}/>
    <input ref={stickerRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void addSticker(event.target.files?.[0]); event.target.value=''; }}/>
  </div>;
});
