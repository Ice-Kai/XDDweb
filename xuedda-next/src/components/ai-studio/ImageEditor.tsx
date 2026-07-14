"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import {
  Circle,
  Clipboard,
  Columns2,
  Download,
  Eraser,
  ImagePlus,
  ImageUp,
  Images,
  LassoSelect,
  LoaderCircle,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Redo2,
  ScanLine,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { ImageComparison } from "./ImageComparison";
import { saveLocalImageHistoryItem, type LocalImageHistoryItem } from "./localImageHistory";
import { requestImageGeneration } from "./requestImage";

type Tool = "brush" | "lasso" | "rectangle" | "text" | "eraser";

type StickerItem = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ReferenceImageItem = {
  id: string;
  src: string;
  name: string;
};

export type ImageEditorHandle = {
  triggerAiEdit: (promptOverride?: string) => void;
  setExternalPrompt: (v: string) => void;
  isEditing: () => boolean;
  cancelEdit: () => void;
  getElapsed: () => number;
  exportComposite: () => Promise<string | null>;
  exportReferences: () => string[];
  clearCanvas: () => void;
};

type ImageEditorProps = {
  open: boolean;
  inline?: boolean;
  initialImage?: string;
  initialPrompt?: string;
  provider?: "gpt" | "toapis";
  adminPassword?: string;
  quality?: "standard" | "4K";
  aspectRatio?: string;
  mode?: "edit" | "wash";
  onClose: () => void;
  /** When true, the inline AI-edit bar is hidden (parent drives prompt + submit externally). */
  hideInlineBar?: boolean;
  /** Text to show in the footer slot when hideInlineBar is true (e.g. announcement text). */
  footerText?: string;
  /** Pushes the editing state + elapsed seconds up so the parent composer can show a timer. */
  onEditingChange?: (editing: boolean, elapsed: number) => void;
  onCanvasImageChange?: (hasImage: boolean) => void;
};

const COLORS = ["#0ea5e9", "#111827", "#ffffff", "#f59e0b", "#ef4444", "#22c55e"];
const DEFAULT_WASH_PROMPT =
  "Improve image clarity, resolution, texture detail, denoise and remove compression artifacts or blur. Strictly preserve the original composition, people, objects, text, colors and content. Do not add or remove elements.";
const SUPPORTED_IMAGE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const MAX_REFERENCE_IMAGES = 3;
const MAX_REFERENCE_IMAGE_SIZE = 1280;

function friendlyEditorError(message: string, mode: "edit" | "wash") {
  if (/Unexpected token|not valid JSON|error code|502|503|504|Failed to fetch/i.test(message)) {
    return mode === "wash" ? "高清洗图服务暂时不可用，请稍后再试。" : "AI 改图服务暂时不可用，请稍后再试。";
  }
  if (/401|403|password|管理员密码/i.test(message)) return "管理员密码错误或服务鉴权失败。";
  if (/413|too large|payload|body/i.test(message)) return "图片太大了，请换一张小一点的图片。";
  return message || (mode === "wash" ? "高清洗图失败，请稍后再试。" : "AI 改图失败，请稍后再试。");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = source;
  });
}

async function imageFileToCompressedDataUrl(file: File) {
  const source = await fileToDataUrl(file);
  const image = await loadHtmlImage(source);
  const scale = Math.min(1, MAX_REFERENCE_IMAGE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let cursorY = y;
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        context.fillText(line, x, cursorY);
        line = character;
        cursorY += lineHeight;
      } else {
        line = candidate;
      }
    }
    if (line) context.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
}

function closestSupportedRatio(width: number, height: number, fallback: string) {
  if (SUPPORTED_IMAGE_RATIOS.includes(fallback)) return fallback;
  const sourceRatio = width / Math.max(1, height);
  return SUPPORTED_IMAGE_RATIOS.reduce((best, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split(":").map(Number);
    const [bestWidth, bestHeight] = best.split(":").map(Number);
    const candidateRatio = candidateWidth / candidateHeight;
    const bestRatio = bestWidth / bestHeight;
    return Math.abs(Math.log(candidateRatio / sourceRatio)) < Math.abs(Math.log(bestRatio / sourceRatio))
      ? candidate
      : best;
  }, "1:1");
}

export const ImageEditor = forwardRef<ImageEditorHandle, ImageEditorProps>(function ImageEditor({
  open,
  inline = false,
  initialImage,
  initialPrompt = "",
  provider = "gpt",
  adminPassword = "",
  quality = "standard",
  aspectRatio = "16:9",
  mode = "edit",
  onClose,
  hideInlineBar = false,
  footerText = "",
  onEditingChange,
  onCanvasImageChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const stickerFileRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const lassoRef = useRef<Array<{ x: number; y: number }>>([]);
  const startRef = useRef({ x: 0, y: 0 });
  const previewRef = useRef<ImageData | null>(null);
  const editAbortRef = useRef<AbortController | null>(null);
  const panningRef = useRef(false);
  const panStartRef = useRef({ clientX: 0, clientY: 0, x: 0, y: 0 });
  const spacePressedRef = useRef(false);
  const stickerDragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);
  const [hasImage, setHasImage] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [message, setMessage] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState("");
  const [lassoSelection, setLassoSelection] = useState<Array<{ x: number; y: number }>>([]);
  const [compareBefore, setCompareBefore] = useState("");
  const [compareAfter, setCompareAfter] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fitCanvas = useCallback(() => {
    const workspace = workspaceRef.current;
    const canvas = canvasRef.current;
    if (!workspace || !canvas || !canvas.width || !canvas.height) return;
    const availableWidth = Math.max(260, workspace.clientWidth - 72);
    const availableHeight = Math.max(260, workspace.clientHeight - 72);
    setZoom(Math.min(1, availableWidth / canvas.width, availableHeight / canvas.height));
    setPan({ x: 0, y: 0 });
  }, []);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !canvas.width || !canvas.height) return;
    const snapshot = context.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), snapshot].slice(-20);
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [historyIndex]);

  const loadImage = useCallback(async (source: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const image = await loadHtmlImage(source);
      const maxInputWidth = mode === "wash" ? 4096 : 2400;
      const scale = Math.min(1, maxInputWidth / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const snapshot = context.getImageData(0, 0, canvas.width, canvas.height);
      setCanvasSize({ width: canvas.width, height: canvas.height });
      setHistory([snapshot]);
      setHistoryIndex(0);
      setHasImage(true);
      setStickers([]);
      setSelectedStickerId("");
      setPan({ x: 0, y: 0 });
      setMessage("");
      window.requestAnimationFrame(fitCanvas);
    } catch {
      setMessage("图片加载失败；远程图片请先下载后再上传。");
    }
  }, [fitCanvas, mode]);

  useEffect(() => {
    if (open && initialImage) void loadImage(initialImage);
  }, [initialImage, loadImage, open]);

  useEffect(() => {
    if (open) setEditPrompt(initialPrompt);
  }, [initialPrompt, open]);

  useEffect(() => {
    if (!editing) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [editing]);

  useEffect(() => {
    onEditingChange?.(editing, elapsed);
  }, [editing, elapsed, onEditingChange]);

  useEffect(() => {
    onCanvasImageChange?.(hasImage);
  }, [hasImage, onCanvasImageChange]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => fitCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitCanvas, open]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenRef.current);
      window.requestAnimationFrame(fitCanvas);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [fitCanvas]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (event.code === "Space") {
        spacePressedRef.current = true;
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open]);

  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    try {
      const source = await fileToDataUrl(file);
      await loadImage(source);
    } catch {
      setMessage("图片读取失败，请换一张图片。");
    }
  }

  async function uploadReference(files?: FileList | File[]) {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const openSlots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length);
    if (openSlots === 0) {
      setMessage(`参考图最多 ${MAX_REFERENCE_IMAGES} 张，请先删除一张再添加。`);
      return;
    }
    const pickedFiles = imageFiles.slice(0, openSlots);
    try {
      const next = await Promise.all(
        pickedFiles.map(async (file) => ({
          id: crypto.randomUUID(),
          src: await imageFileToCompressedDataUrl(file),
          name: file.name,
        })),
      );
      setReferenceImages((current) => [...current, ...next].slice(0, MAX_REFERENCE_IMAGES));
      setMessage(
        imageFiles.length > pickedFiles.length
          ? `已添加 ${next.length} 张参考图，最多保留 ${MAX_REFERENCE_IMAGES} 张。参考图已自动压缩以避免上传过大。`
          : `已添加 ${next.length} 张参考图。参考图已自动压缩，AI 改图时会一起提交。`,
      );
    } catch {
      setMessage("参考图读取失败，请换一批图片。");
    }
  }

  function clearMainImage() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
    setHasImage(false);
    setCanvasSize({ width: 0, height: 0 });
    setHistory([]);
    setHistoryIndex(-1);
    setStickers([]);
    setSelectedStickerId("");
    setPan({ x: 0, y: 0 });
    setCompareBefore("");
    setCompareAfter("");
    setMessage("主图已移除，可以重新上传。");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addSticker(source: string) {
    if (!hasImage || !source) {
      setMessage("请先上传需要编辑的主图。");
      return;
    }
    try {
      const image = await loadHtmlImage(source);
      const maxWidth = canvasSize.width * 0.32;
      const maxHeight = canvasSize.height * 0.32;
      const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      const width = Math.max(48 / zoom, image.naturalWidth * scale);
      const height = Math.max(48 / zoom, image.naturalHeight * scale);
      const item: StickerItem = {
        id: crypto.randomUUID(),
        src: source,
        x: (canvasSize.width - width) / 2,
        y: (canvasSize.height - height) / 2,
        width,
        height,
      };
      setStickers((current) => [...current, item]);
      setSelectedStickerId(item.id);
      setMessage("贴图已放到画布，可拖动或从右下角缩放。");
    } catch {
      setMessage("贴图读取失败，请换一张图片。");
    }
  }

  async function uploadSticker(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      await addSticker(await fileToDataUrl(file));
    } catch {
      setMessage("贴图读取失败，请换一张图片。");
    }
  }

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function styleContext(context: CanvasRenderingContext2D) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = size / Math.max(zoom, 0.2);
    context.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    context.fillStyle = color;
  }

  function beginCanvasPan(event: React.PointerEvent<HTMLElement>) {
    if (!hasImage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panningRef.current = true;
    panStartRef.current = { clientX: event.clientX, clientY: event.clientY, x: pan.x, y: pan.y };
  }

  function moveCanvasPan(event: React.PointerEvent<HTMLElement>) {
    if (!panningRef.current) return false;
    const start = panStartRef.current;
    setPan({
      x: start.x + event.clientX - start.clientX,
      y: start.y + event.clientY - start.clientY,
    });
    return true;
  }

  function endCanvasPan() {
    if (!panningRef.current) return false;
    panningRef.current = false;
    return true;
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!hasImage) return;
    setSelectedStickerId("");
    const canvas = canvasRef.current!;
    if (mode === "wash" || event.button === 1 || event.altKey || spacePressedRef.current) {
      beginCanvasPan(event);
      return;
    }
    const context = canvas.getContext("2d")!;
    const current = getPoint(event);
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    startRef.current = current;
    previewRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
    styleContext(context);

    if (tool !== "lasso") setLassoSelection([]);

    if (tool === "text") {
      const text = window.prompt("输入要添加的文字，支持多行和长文本");
      if (text) {
        const fontSize = Math.max(18, size * 4) / Math.max(zoom, 0.4);
        context.font = `700 ${fontSize}px "Microsoft YaHei", sans-serif`;
        drawWrappedText(context, text, current.x, current.y, Math.max(100, canvas.width - current.x - 20), fontSize * 1.35);
        saveSnapshot();
      }
      drawingRef.current = false;
    } else if (tool === "lasso") {
      lassoRef.current = [current];
      context.save();
      context.setLineDash([8 / Math.max(zoom, .2), 6 / Math.max(zoom, .2)]);
      context.strokeStyle = "#111827";
      context.beginPath();
      context.moveTo(current.x, current.y);
      context.restore();
    } else if (tool === "brush" || tool === "eraser") {
      context.beginPath();
      context.moveTo(current.x, current.y);
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (moveCanvasPan(event)) return;
    if (!drawingRef.current) return;
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    const current = getPoint(event);
    styleContext(context);
    if (tool === "lasso") {
      if (!previewRef.current) return;
      lassoRef.current.push(current);
      context.putImageData(previewRef.current, 0, 0);
      context.save();
      context.setLineDash([8 / Math.max(zoom, .2), 6 / Math.max(zoom, .2)]);
      context.strokeStyle = "#111827";
      context.lineWidth = 2 / Math.max(zoom, .2);
      context.beginPath();
      lassoRef.current.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
      context.restore();
      return;
    }
    if (tool === "brush" || tool === "eraser") {
      context.lineTo(current.x, current.y);
      context.stroke();
      return;
    }
    if (!previewRef.current) return;
    context.putImageData(previewRef.current, 0, 0);
    const start = startRef.current;
    context.beginPath();
    if (tool === "rectangle") {
      context.strokeRect(start.x, start.y, current.x - start.x, current.y - start.y);
    } else if (tool === "circle") {
      context.arc(start.x, start.y, Math.hypot(current.x - start.x, current.y - start.y), 0, Math.PI * 2);
      context.stroke();
    }
  }

  function pointerUp() {
    if (endCanvasPan()) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (tool === "lasso" && previewRef.current) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        context.putImageData(previewRef.current, 0, 0);
        const points = lassoRef.current;
        if (points.length > 2) {
          setLassoSelection(points);
          context.save();
          context.setLineDash([8 / Math.max(zoom, .2), 6 / Math.max(zoom, .2)]);
          context.strokeStyle = "#111827";
          context.lineWidth = 2 / Math.max(zoom, .2);
          context.beginPath();
          points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.closePath();
          context.stroke();
          context.restore();
          setMessage("套索区域已选中，可点击左侧“删除选区”。");
        }
      }
      previewRef.current = null;
      return;
    }
    previewRef.current = null;
    saveSnapshot();
  }

  function deleteLassoSelection() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || lassoSelection.length < 3) return;
    const base = history[historyIndex];
    if (base) context.putImageData(base, 0, 0);
    context.save();
    context.beginPath();
    lassoSelection.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.closePath();
    context.clip();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    setLassoSelection([]);
    saveSnapshot();
    setMessage("已删除套索选区。");
  }

  function restore(index: number) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !history[index]) return;
    context.putImageData(history[index], 0, 0);
    setHistoryIndex(index);
  }

  async function toggleFullscreen() {
    const element = fullscreenRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch {
      setMessage("Full-screen preview is temporarily unavailable. Please try again.");
    }
  }

  function beginStickerDrag(event: React.PointerEvent<HTMLDivElement>, sticker: StickerItem, dragMode: "move" | "resize") {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedStickerId(sticker.id);
    stickerDragRef.current = {
      id: sticker.id,
      mode: dragMode,
      clientX: event.clientX,
      clientY: event.clientY,
      x: sticker.x,
      y: sticker.y,
      width: sticker.width,
      height: sticker.height,
    };
  }

  function moveSticker(event: React.PointerEvent<HTMLDivElement>) {
    const drag = stickerDragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.clientX) / zoom;
    const dy = (event.clientY - drag.clientY) / zoom;
    setStickers((current) => current.map((item) => {
      if (item.id !== drag.id) return item;
      if (drag.mode === "move") {
        return {
          ...item,
          x: Math.min(canvasSize.width - item.width, Math.max(0, drag.x + dx)),
          y: Math.min(canvasSize.height - item.height, Math.max(0, drag.y + dy)),
        };
      }
      const ratio = drag.width / drag.height;
      const width = Math.min(canvasSize.width - drag.x, Math.max(36 / zoom, drag.width + dx));
      const height = Math.min(canvasSize.height - drag.y, Math.max(36 / zoom, width / ratio));
      return { ...item, width, height };
    }));
  }

  function endStickerDrag() {
    stickerDragRef.current = null;
  }

  async function renderComposite() {
    const source = canvasRef.current;
    if (!source || !hasImage) return null;
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext("2d");
    if (!context) return null;
    const cleanSnapshot = lassoSelection.length > 2 ? history[historyIndex] : null;
    if (cleanSnapshot) context.putImageData(cleanSnapshot, 0, 0);
    else context.drawImage(source, 0, 0);
    for (const sticker of stickers) {
      const image = await loadHtmlImage(sticker.src);
      context.drawImage(image, sticker.x, sticker.y, sticker.width, sticker.height);
    }
    return output;
  }

  async function download() {
    const composite = await renderComposite();
    if (!composite) return;
    const link = document.createElement("a");
    link.download = `belongstoai-edited-${Date.now()}.png`;
    link.href = composite.toDataURL("image/png");
    link.click();
  }

  async function copyToClipboard() {
    const composite = await renderComposite();
    if (!composite) return;
    try {
      composite.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setMessage("已复制到剪贴板！");
      }, "image/png");
    } catch {
      setMessage("复制失败，请使用下载代替。");
    }
  }

  async function aiEdit(promptOverride?: string) {
    const effectivePrompt = (promptOverride ?? editPrompt).trim();
    if (!hasImage || (mode !== "wash" && !effectivePrompt) || editing) return;
    if (promptOverride !== undefined) setEditPrompt(promptOverride);
    const controller = new AbortController();
    editAbortRef.current = controller;
    setEditing(true);
    setElapsed(0);
    setMessage("");
    try {
      const composite = await renderComposite();
      if (!composite) throw new Error("请先上传需要编辑的图片。");
      const beforeDataUrl = composite.toDataURL("image/jpeg", 0.88);
      const finalPrompt = mode === "wash" && !effectivePrompt ? DEFAULT_WASH_PROMPT : effectivePrompt;
      const finalRatio =
        mode === "wash" || provider === "toapis"
          ? closestSupportedRatio(composite.width, composite.height, aspectRatio)
          : `${composite.width}:${composite.height}`;
      const result = await requestImageGeneration(
        mode === "wash" ? "/api/ai-image/comfy-wash" : "/api/ai-image/generate",
        {
          prompt: finalPrompt,
          ratio: finalRatio,
          image: composite.toDataURL("image/jpeg", 0.88),
          referenceImage: referenceImages[0]?.src || "",
          referenceImages: referenceImages.map((item) => item.src),
          provider: mode === "wash" ? "comfy" : provider,
          adminPassword,
          quality: mode === "wash" ? "4K" : quality,
          aspectRatio,
          resolution: mode === "wash" || quality === "4K" ? "4k" : "2k",
        },
        { asyncTask: mode === "wash" || provider === "toapis", signal: controller.signal },
      );
      if (!result.image) throw new Error(friendlyEditorError(result.error || "", mode));
      setCompareBefore(beforeDataUrl);
      setCompareAfter(result.image);
      const historyItem: LocalImageHistoryItem = {
        id: crypto.randomUUID(),
        prompt: mode === "wash" ? "4K 洗图" : finalPrompt,
        image: result.image,
        createdAt: new Date().toISOString(),
      };
      void saveLocalImageHistoryItem(historyItem).catch(() => {});
      window.dispatchEvent(new CustomEvent<LocalImageHistoryItem>("belongstoai:image-history-added", { detail: historyItem }));
      await loadImage(result.image);
      setMessage(mode === "wash" ? "高清处理完成，可以下载或打开对比查看。" : "AI 改图完成，可以继续标注、对比或下载。");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setMessage(mode === "wash" ? "已暂停高清处理。" : "已暂停改图。");
      } else {
        setMessage(friendlyEditorError(caught instanceof Error ? caught.message : "", mode));
      }
    } finally {
      if (editAbortRef.current === controller) editAbortRef.current = null;
      setEditing(false);
    }
  }

  function cancelEdit() {
    editAbortRef.current?.abort();
    editAbortRef.current = null;
    setEditing(false);
    setElapsed(0);
    setMessage(mode === "wash" ? "已暂停高清处理。" : "已暂停改图。");
  }

  useImperativeHandle(ref, () => ({
    triggerAiEdit: (promptOverride?: string) => void aiEdit(promptOverride),
    setExternalPrompt: (v: string) => setEditPrompt(v),
    isEditing: () => editing,
    cancelEdit,
    getElapsed: () => elapsed,
    exportComposite: async () => {
      const composite = await renderComposite();
      return composite?.toDataURL("image/jpeg", 0.9) || null;
    },
    exportReferences: () => referenceImages.map((item) => item.src),
    clearCanvas: clearMainImage,
  }));

  if (!open) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-24 right-5 z-[80] flex max-w-[calc(100vw-40px)] items-center gap-2 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_18px_60px_rgba(24,24,20,0.18)]">
        <button type="button" onClick={() => setMinimized(false)} className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#292925] transition hover:bg-[#f3f3f1]">
          {editing ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#d97757]" /> : <ImageUp className="h-4 w-4 shrink-0 text-[#77766f]" />}
          <span className="truncate">{mode === "wash" ? "4K 洗图" : "图片编辑器"}{editing ? ` · ${elapsed}s` : ""}</span>
        </button>
        <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#f1f1ed] text-[#77766f] transition hover:bg-[#e7e6df] hover:text-black">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const tools: Array<{ id: Tool; label: string; icon: typeof Pencil }> = [
    { id: "brush", label: "画笔", icon: Pencil },
    { id: "lasso", label: "套索", icon: LassoSelect },
    { id: "rectangle", label: "矩形", icon: Square },
    { id: "text", label: "文字", icon: Type },
    { id: "eraser", label: "白色涂抹", icon: Eraser },
  ];
  const zoomPercent = Math.round(zoom * 100);
  const shellClassName = inline
    ? "w-full"
    : "fixed inset-0 z-[80] grid place-items-center bg-black/50 p-3 backdrop-blur-md sm:p-5";
  const sectionClassName = inline
    ? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
    : "mx-auto flex h-full max-h-[calc(100vh-48px)] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_32px_100px_rgba(24,24,20,0.28)]";

  return (
    <div className={shellClassName}>
      <section className={sectionClassName}>

        {/* ── Header ── */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-[#fafafa] px-3">
          {/* Mode badge */}
          <div className="flex min-w-0 items-center gap-2">
            {mode === "wash"
              ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700"><ScanLine className="h-3.5 w-3.5" />4K 洗图</span>
              : <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#efefec] px-2.5 py-1 text-[11px] font-bold text-[#55544e]"><Pencil className="h-3.5 w-3.5" />图片编辑器</span>
            }
            {canvasSize.width > 0 && (
              <span className="hidden text-[11px] font-medium text-[#c0bfb8] sm:inline">{canvasSize.width} × {canvasSize.height}</span>
            )}
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-1">
            {mode !== "wash" && (
              <button type="button" onClick={() => referenceFileRef.current?.click()} disabled={referenceImages.length >= MAX_REFERENCE_IMAGES} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[11px] font-semibold text-[#55544e] transition hover:bg-[#f1f1ed] disabled:opacity-40">
                <Images className="h-3.5 w-3.5" /><span className="hidden sm:inline">参考图 {referenceImages.length}/{MAX_REFERENCE_IMAGES}</span>
              </button>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[11px] font-semibold text-[#55544e] transition hover:bg-[#f1f1ed]">
              <ImageUp className="h-3.5 w-3.5" /><span className="hidden sm:inline">上传</span>
            </button>
            <button type="button" onClick={clearMainImage} disabled={!hasImage || editing} title="删除主图" className="grid h-8 w-8 place-items-center rounded-lg text-[#c0bfb8] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {mode === "wash" && (
              <button type="button" onClick={editing ? cancelEdit : () => void aiEdit()} disabled={!hasImage && !editing} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white transition disabled:opacity-35 ${editing ? "bg-[#999892] hover:bg-[#88877f]" : "bg-[#d97757] hover:bg-[#c86848]"}`}>
                {editing ? <X className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {editing ? `暂停 ${elapsed}s` : "开始处理"}
              </button>
            )}

            <div className="mx-1 h-4 w-px bg-black/[0.08]" />
            <button type="button" onClick={() => setCompareOpen(true)} disabled={!compareBefore || !compareAfter} title="对比前后" className="grid h-8 w-8 place-items-center rounded-lg text-[#c0bfb8] transition hover:bg-[#f1f1ed] hover:text-[#20201d] disabled:opacity-30">
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => void copyToClipboard()} disabled={!hasImage} title="复制到剪贴板" className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.08] bg-white text-[#c0bfb8] transition hover:bg-[#f1f1ed] hover:text-[#20201d] disabled:opacity-30">
              <Clipboard className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => void download()} disabled={!hasImage} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#20201d] px-3 text-[11px] font-semibold text-white transition hover:bg-black disabled:opacity-35">
              <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">下载</span>
            </button>
            <div className="mx-1 h-4 w-px bg-black/[0.08]" />
            <button type="button" onClick={() => setMinimized(true)} title="最小化" className="grid h-8 w-8 place-items-center rounded-lg text-[#c0bfb8] transition hover:bg-[#f1f1ed] hover:text-[#20201d]">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#c0bfb8] transition hover:bg-red-50 hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(e.target.files?.[0])} className="hidden" />
          <input ref={referenceFileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { void uploadReference(e.target.files || undefined); e.currentTarget.value = ""; }} className="hidden" />
          <input ref={stickerFileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void uploadSticker(e.target.files?.[0])} className="hidden" />
        </header>

        {/* ── Wash info bar ── */}
        {mode === "wash" && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">ComfyUI · 本地 GPU</span>
            <span className="text-[11px] text-amber-700/60">上传图片后点击「开始处理」，完成后下载结果</span>
            {canvasSize.width > 0 && <span className="ml-auto text-[11px] font-semibold text-amber-600/80">{canvasSize.width} × {canvasSize.height}</span>}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left sidebar */}
          {mode !== "wash" && (
            <aside className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-black/[0.06] bg-[#fafafa] p-3">
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-[#d0cfc8]">绘图工具</p>
              {tools.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => { setTool(id); if (id !== "lasso") setLassoSelection([]); }} className={`flex h-9 items-center gap-2.5 rounded-xl px-3 text-xs font-semibold transition ${tool === id ? "bg-[#20201d] text-white shadow-sm" : "text-[#66655f] hover:bg-white hover:text-[#20201d] hover:shadow-[0_1px_4px_rgba(24,24,20,0.08)]"}`}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />{label}
                </button>
              ))}
              {lassoSelection.length > 2 && (
                <button type="button" onClick={deleteLassoSelection} className="flex h-9 items-center gap-2.5 rounded-xl bg-red-50 px-3 text-xs font-semibold text-red-600 transition hover:bg-red-100">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />删除选区
                </button>
              )}
              <button type="button" onClick={() => stickerFileRef.current?.click()} disabled={!hasImage} className="flex h-9 items-center gap-2.5 rounded-xl px-3 text-xs font-semibold text-[#66655f] transition hover:bg-white hover:text-[#20201d] hover:shadow-[0_1px_4px_rgba(24,24,20,0.08)] disabled:opacity-35">
                <ImagePlus className="h-3.5 w-3.5 shrink-0" />添加贴图
              </button>

              <div className="my-2 h-px bg-black/[0.06]" />
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-[#d0cfc8]">颜色 / 粗细</p>
              <div className="flex flex-wrap gap-2 px-1">
                {COLORS.map((value) => (
                  <button key={value} type="button" aria-label={value} onClick={() => setColor(value)} className={`h-7 w-7 rounded-full border-2 transition hover:scale-110 ${color === value ? "scale-110 border-[#d97757] shadow-md" : "border-black/10"}`} style={{ backgroundColor: value }} />
                ))}
              </div>
              <label className="mt-1 flex items-center gap-2 px-1 text-[11px] font-medium text-[#aaa9a3]">
                <span className="w-5 shrink-0 text-right text-[11px] font-bold tabular-nums">{size}</span>
                <input type="range" min="2" max="40" value={size} onChange={(e) => setSize(Number(e.target.value))} className="min-w-0 flex-1 accent-[#d97757]" />
              </label>

              <div className="my-2 h-px bg-black/[0.06]" />
              <div className="flex items-center gap-1.5 px-1">
                <button type="button" title="撤销" onClick={() => restore(historyIndex - 1)} disabled={historyIndex <= 0} className="grid h-8 w-8 place-items-center rounded-lg text-[#77766f] transition hover:bg-white hover:shadow-sm disabled:opacity-30">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="重做" onClick={() => restore(historyIndex + 1)} disabled={historyIndex >= history.length - 1} className="grid h-8 w-8 place-items-center rounded-lg text-[#77766f] transition hover:bg-white hover:shadow-sm disabled:opacity-30">
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
                <span className="ml-auto text-[10px] font-medium text-[#d0cfc8]">{historyIndex + 1}/{history.length}</span>
              </div>

              <div className="my-2 h-px bg-black/[0.06]" />
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-[#d0cfc8]">参考图 {referenceImages.length}/{MAX_REFERENCE_IMAGES}</p>
              {referenceImages.length > 0 ? (
                <div className="space-y-2">
                  <button type="button" onClick={() => referenceFileRef.current?.click()} disabled={referenceImages.length >= MAX_REFERENCE_IMAGES} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/[0.10] py-1.5 text-[10px] font-semibold text-[#aaa9a3] transition hover:border-[#d97757]/40 hover:text-[#55544e] disabled:opacity-35">
                    <ImagePlus className="h-3 w-3" />{referenceImages.length >= MAX_REFERENCE_IMAGES ? "已满 3 张" : "继续添加"}
                  </button>
                  {referenceImages.map((item, index) => (
                    <div key={item.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/[0.06]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.src} alt={`参考图 ${index + 1}`} className="h-24 w-full object-cover" />
                      <div className="flex gap-1.5 p-1.5">
                        <button type="button" onClick={() => void addSticker(item.src)} disabled={!hasImage} className="flex-1 rounded-lg bg-[#20201d] py-1 text-[10px] font-semibold text-white transition hover:bg-black disabled:opacity-35">贴到画布</button>
                        <button type="button" onClick={() => setReferenceImages((c) => c.filter((e) => e.id !== item.id))} className="grid w-7 shrink-0 place-items-center rounded-lg bg-[#f3f3f1] text-[#888780] transition hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <button type="button" onClick={() => referenceFileRef.current?.click()} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-black/[0.10] px-2.5 py-3 text-left text-[10px] font-medium leading-4 text-[#aaa9a3] transition hover:border-[#d97757]/40 hover:bg-white hover:text-[#66655f]">
                  <Images className="h-4 w-4 shrink-0" />上传参考图，最多 3 张，会自动压缩
                </button>
              )}
            </aside>
          )}

          {/* Canvas area */}
          <div ref={fullscreenRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ececea]">

            {/* Floating zoom toolbar */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-xl border border-black/[0.07] bg-white/95 px-1.5 py-1 shadow-sm backdrop-blur-sm">
              <button type="button" onClick={() => setZoom((v) => Math.max(0.1, v - 0.1))} disabled={!hasImage} title="缩小" className="grid h-6 w-6 place-items-center rounded-lg text-[#77766f] hover:bg-[#f0f0ec] disabled:opacity-30"><Minus className="h-3 w-3" /></button>
              <input type="range" min="10" max="300" value={zoomPercent} onChange={(e) => setZoom(Number(e.target.value) / 100)} disabled={!hasImage} className="w-20 accent-[#d97757] disabled:opacity-30" />
              <button type="button" onClick={() => setZoom((v) => Math.min(3, v + 0.1))} disabled={!hasImage} title="放大" className="grid h-6 w-6 place-items-center rounded-lg text-[#77766f] hover:bg-[#f0f0ec] disabled:opacity-30"><Plus className="h-3 w-3" /></button>
              <span className="w-9 text-center text-[10px] font-bold tabular-nums text-[#aaa9a3]">{zoomPercent}%</span>
              <div className="mx-0.5 h-3 w-px bg-black/[0.08]" />
              <button type="button" onClick={fitCanvas} disabled={!hasImage} title="适合窗口" className="grid h-6 w-6 place-items-center rounded-lg text-[#77766f] hover:bg-[#f0f0ec] disabled:opacity-30"><Maximize2 className="h-3 w-3" /></button>
              <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={!hasImage} className="rounded-lg px-1.5 text-[10px] font-bold text-[#aaa9a3] hover:bg-[#f0f0ec] disabled:opacity-30">1:1</button>
              <button type="button" onClick={() => void toggleFullscreen()} disabled={!hasImage} title={isFullscreen ? "退出全屏" : "全屏"} className="grid h-6 w-6 place-items-center rounded-lg text-[#77766f] hover:bg-[#f0f0ec] disabled:opacity-30"><Maximize2 className="h-3 w-3" /></button>
            </div>

            {selectedStickerId && (
              <button type="button" onClick={() => { setStickers((c) => c.filter((item) => item.id !== selectedStickerId)); setSelectedStickerId(""); }} className="absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-xl bg-red-500 px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-red-600">
                <Trash2 className="h-3.5 w-3.5" /> 删除贴图
              </button>
            )}

            <div
              ref={workspaceRef}
              onPointerDown={(e) => { if (e.target === e.currentTarget) beginCanvasPan(e); }}
              onPointerMove={moveCanvasPan}
              onPointerUp={endCanvasPan}
              onPointerCancel={endCanvasPan}
              onWheel={(e) => { if (!hasImage) return; e.preventDefault(); setZoom((v) => Math.min(3, Math.max(0.1, v + (e.deltaY < 0 ? 0.1 : -0.1)))); }}
              className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
            >
              {!hasImage && (
                <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-4 grid place-items-center rounded-2xl border-2 border-dashed border-black/[0.10] bg-white/40 transition hover:border-[#d97757]/50 hover:bg-white/70">
                  <span className="flex flex-col items-center gap-3">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#c0bfb8] shadow-sm"><ImageUp className="h-7 w-7" /></div>
                    <span className="text-sm font-semibold text-[#77766f]">点击上传需要编辑的图片</span>
                    <span className="text-xs font-medium text-[#aaa9a3]">支持 JPG · PNG · WebP，画布自动匹配原图尺寸</span>
                  </span>
                </button>
              )}
              <div
                className={hasImage ? "grid min-h-full min-w-full place-items-center p-6 sm:p-10" : "hidden"}
                onPointerDown={(e) => { if (e.target === e.currentTarget) beginCanvasPan(e); }}
                onPointerMove={moveCanvasPan}
                onPointerUp={endCanvasPan}
                onPointerCancel={endCanvasPan}
              >
                <div
                  className="relative shrink-0 shadow-[0_24px_70px_rgba(24,24,20,0.22)]"
                  style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom, transform: `translate(${pan.x}px, ${pan.y}px)` }}
                  onPointerDown={() => setSelectedStickerId("")}
                >
                  <canvas
                    ref={canvasRef}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={pointerUp}
                    className={`absolute inset-0 h-full w-full touch-none ${mode === "wash" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
                  />
                  {stickers.map((sticker) => {
                    const selected = selectedStickerId === sticker.id;
                    return (
                      <div
                        key={sticker.id}
                        onPointerDown={(e) => beginStickerDrag(e, sticker, "move")}
                        onPointerMove={moveSticker}
                        onPointerUp={endStickerDrag}
                        onPointerCancel={endStickerDrag}
                        className={`absolute touch-none cursor-move select-none ${selected ? "ring-2 ring-[#d97757] ring-offset-2" : "hover:ring-1 hover:ring-[#d97757]/60"}`}
                        style={{ left: sticker.x * zoom, top: sticker.y * zoom, width: sticker.width * zoom, height: sticker.height * zoom }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sticker.src} alt="贴图" draggable={false} className="pointer-events-none h-full w-full object-fill" />
                        {selected && (
                          <div
                            onPointerDown={(e) => beginStickerDrag(e, sticker, "resize")}
                            onPointerMove={moveSticker}
                            onPointerUp={endStickerDrag}
                            onPointerCancel={endStickerDrag}
                            className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize rounded-full border-2 border-white bg-[#d97757] shadow"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {message && (
              <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
                <p className="max-w-sm rounded-2xl bg-[#20201d]/90 px-4 py-2.5 text-center text-xs font-semibold leading-5 text-white shadow-lg backdrop-blur-sm">{message}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer: announcement text when hideInlineBar, otherwise the AI-edit input */}
        {mode !== "wash" && inline && hideInlineBar && footerText && (
          <div className="shrink-0 border-t border-black/[0.07] bg-[#fafafa] px-4 py-2">
            <p className="whitespace-pre-line text-center text-xs font-medium leading-5 text-[#aaa9a3]">{footerText}</p>
          </div>
        )}
        {mode !== "wash" && inline && !hideInlineBar && (
          <div className="shrink-0 border-t border-black/[0.07] bg-[#fafafa] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void aiEdit(); } }}
                rows={1}
                placeholder="描述修改要求… Enter 发送，Shift+Enter 换行"
                className="max-h-24 min-h-9 min-w-0 flex-1 resize-none rounded-xl border border-black/[0.09] bg-white px-3 py-2 text-sm font-medium text-[#20201d] outline-none placeholder:text-[#aaa9a3] focus:border-[#d97757]/50"
              />
              <button
                type="button"
                onClick={editing ? cancelEdit : () => void aiEdit()}
                disabled={!editing && (!hasImage || !editPrompt.trim())}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-[#e5e4df] disabled:text-[#aaa9a3] ${editing ? "bg-[#999892] hover:bg-[#88877f]" : "bg-[#d97757] hover:bg-[#c86848]"}`}
              >
                {editing ? <><X className="h-3.5 w-3.5" /><span>{elapsed}s 暂停</span></> : <><Sparkles className="h-3.5 w-3.5" /><span>AI 改图</span></>}
              </button>
            </div>
          </div>
        )}
      </section>

      {mode !== "wash" && !inline && (
        <section className="mx-auto mt-4 w-full max-w-[980px]">
          <div className="rounded-[28px] border border-black/[0.07] bg-white p-3 shadow-[0_18px_50px_rgba(24,24,20,0.08)] sm:px-5 sm:py-4">
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void aiEdit(); }}
              rows={3}
              placeholder="输入详细要求，支持多行文本；Ctrl + Enter 开始 AI 改图"
              className="min-h-16 max-h-36 w-full resize-y rounded-2xl border border-black/[0.09] bg-white px-4 py-3 text-base font-medium leading-7 text-[#20201d] shadow-sm outline-none transition placeholder:text-[#aaa9a3] focus:border-[#d97757]/50"
            />
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={editing ? cancelEdit : () => void aiEdit()} disabled={!editing && (!hasImage || !editPrompt.trim())} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#20201d] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#e5e4df] disabled:text-[#aaa9a3]">
                {editing ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {editing ? `暂停 AI 改图 ${elapsed}s` : "开始 AI 改图"}
              </button>
            </div>
          </div>
        </section>
      )}

      {compareOpen && compareBefore && compareAfter && (
        <ImageComparison initialOriginalImage={compareBefore} resultImage={compareAfter} downloadName={`belongstoai-compare-${Date.now()}.png`} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  );
});
