"use client";

import { useRef, useState } from "react";
import { Columns2, Download, ImageUp, RefreshCw, X } from "lucide-react";

type ImageComparisonProps = {
  resultImage: string;
  initialOriginalImage?: string;
  downloadName: string;
  onClose: () => void;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function ImageComparison({ resultImage, initialOriginalImage = "", downloadName, onClose }: ImageComparisonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [originalImage, setOriginalImage] = useState(initialOriginalImage);
  const [position, setPosition] = useState(50);
  const [message, setMessage] = useState("");

  async function uploadOriginal(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    try {
      setOriginalImage(await fileToDataUrl(file));
      setPosition(50);
      setMessage("");
    } catch {
      setMessage("原图读取失败，请换一张图片。");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-[#171715]/80 p-3 backdrop-blur-xl sm:p-6" onClick={onClose}>
      <section className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#20201e] shadow-[0_32px_100px_rgba(0,0,0,0.35)]" onClick={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Columns2 className="h-4 w-4 text-[#ef8867]" />
              图片对比
            </div>
            <p className="mt-1 text-[11px] font-medium text-white/45">拖动中间分割线，对比原图与生成结果。原图只在当前浏览器中使用。</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/8 px-3 text-xs font-semibold text-white/75 transition hover:bg-white/14 hover:text-white">
              {originalImage ? <RefreshCw className="h-4 w-4" /> : <ImageUp className="h-4 w-4" />}
              {originalImage ? "更换原图" : "上传原图"}
            </button>
            <a href={resultImage} download={downloadName} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ef8867] px-3 text-xs font-semibold text-white transition hover:bg-[#e27452]">
              <Download className="h-4 w-4" /> 下载结果
            </a>
            <button type="button" onClick={onClose} title="关闭对比" className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-white/65 transition hover:bg-white/14 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadOriginal(event.target.files?.[0])} className="hidden" />
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#11110f]">
          {!originalImage ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-5 grid place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] text-center text-sm font-semibold text-white/55 transition hover:border-[#ef8867]/50 hover:bg-white/[0.045] hover:text-white">
              <span>
                <ImageUp className="mx-auto mb-4 h-10 w-10 text-[#ef8867]" />
                上传需要对比的原图
                <small className="mt-2 block font-medium text-white/35">建议上传与生成结果构图相同的图片</small>
              </span>
            </button>
          ) : (
            <div className="absolute inset-0 p-4 sm:p-8">
              <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={originalImage} alt="对比原图" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultImage} alt="生成结果" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
                </div>

                <span className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-white/85 backdrop-blur">原图</span>
                <span className="absolute right-4 top-4 rounded-full bg-[#ef8867] px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-white shadow-lg">生成结果</span>

                <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_0_18px_rgba(0,0,0,0.35)]" style={{ left: `${position}%` }}>
                  <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#242421]/90 text-white shadow-xl backdrop-blur">
                    <Columns2 className="h-5 w-5" />
                  </span>
                </div>
                <input aria-label="拖动图片对比线" type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
              </div>
            </div>
          )}
          {message && <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">{message}</p>}
        </div>
      </section>
    </div>
  );
}
