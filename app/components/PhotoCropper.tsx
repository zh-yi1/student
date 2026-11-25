"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Props = { file: File; onSave: (file: File) => void; onClose: () => void };
type Rect = { x: number; y: number; width: number; height: number };
const whole: Rect = { x: 0, y: 0, width: 1, height: 1 };
const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const sourceLimit = 10 * 1024 * 1024;
const resultLimit = 10 * 1024 * 1024;
const button: CSSProperties = {
  minHeight: 44,
  borderRadius: 12,
  padding: "11px 18px",
  border: "1px solid #d9e3da",
  background: "#fff",
  color: "#35564b",
  font: "inherit",
  fontWeight: 650,
  cursor: "pointer",
};

/** Cropping stays in this browser. Only the saved File is passed to the upload flow. */
export default function PhotoCropper({ file, onSave, onClose }: Props) {
  const titleId = useId();
  const hintId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cancelled = useRef(false);
  const closeRef = useRef(onClose);
  const close = () => {
    cancelled.current = true;
    onClose();
  };
  closeRef.current = close;
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    previous: Rect;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<Rect>(whole);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
      );
      if (!elements?.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    cancelled.current = false;
    setCrop(whole);
    setSize({ width: 0, height: 0 });
    setError("");
    setUrl("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("请选择 JPG、PNG 或 WebP 格式的图片。");
      return;
    }
    if (!file.size || file.size > sourceLimit) {
      setError("原图须大于 0 字节且不超过 10 MiB，请选择其他图片。");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      cancelled.current = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const pixels = {
    x: Math.floor(crop.x * size.width),
    y: Math.floor(crop.y * size.height),
    width: Math.max(
      1,
      Math.ceil((crop.x + crop.width) * size.width) -
        Math.floor(crop.x * size.width),
    ),
    height: Math.max(
      1,
      Math.ceil((crop.y + crop.height) * size.height) -
        Math.floor(crop.y * size.height),
    ),
  };

  function point(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = imageRef.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }
  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy || !size.width || event.button !== 0 || drag.current) return;
    event.preventDefault();
    const p = point(event);
    drag.current = { id: event.pointerId, ...p, previous: crop };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setError("");
    setCrop({ x: p.x, y: p.y, width: 0, height: 0 });
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = drag.current;
    if (!origin || origin.id !== event.pointerId) return;
    const p = point(event);
    setCrop({
      x: Math.min(p.x, origin.x),
      y: Math.min(p.y, origin.y),
      width: Math.abs(p.x - origin.x),
      height: Math.abs(p.y - origin.y),
    });
  }
  function finish(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const origin = drag.current;
    if (!origin || origin.id !== event.pointerId) return;
    const p = point(event);
    const bounds = imageRef.current!.getBoundingClientRect();
    if (
      cancelled ||
      Math.abs(p.x - origin.x) * bounds.width < 6 ||
      Math.abs(p.y - origin.y) * bounds.height < 6
    )
      setCrop(origin.previous);
    else
      setCrop({
        x: Math.min(p.x, origin.x),
        y: Math.min(p.y, origin.y),
        width: Math.abs(p.x - origin.x),
        height: Math.abs(p.y - origin.y),
      });
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function adjust(field: keyof Rect, value: number) {
    if (!Number.isFinite(value) || !size.width || busy) return;
    setError("");
    setCrop((previous) => {
      const next = { ...previous };
      if (field === "x") {
        next.x = clamp(Math.round(value) / size.width, 0, 1 - 1 / size.width);
        next.width = Math.min(next.width, 1 - next.x);
      }
      if (field === "y") {
        next.y = clamp(Math.round(value) / size.height, 0, 1 - 1 / size.height);
        next.height = Math.min(next.height, 1 - next.y);
      }
      if (field === "width")
        next.width = clamp(
          Math.round(value) / size.width,
          1 / size.width,
          1 - next.x,
        );
      if (field === "height")
        next.height = clamp(
          Math.round(value) / size.height,
          1 / size.height,
          1 - next.y,
        );
      return next;
    });
  }
  async function save() {
    const image = imageRef.current;
    if (!image || !size.width || busy || dragging) return;
    setBusy(true);
    setError("");
    try {
      if (pixels.width < 2 || pixels.height < 2)
        throw new Error("选区太小，请重新框选完整的一道题。");
      const canvas = document.createElement("canvas");
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("浏览器无法创建裁剪画布，请换一张较小的图片。");
      context.drawImage(
        image,
        pixels.x,
        pixels.y,
        pixels.width,
        pixels.height,
        0,
        0,
        pixels.width,
        pixels.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("图片导出失败，请缩小选区后重试。")),
          "image/png",
        ),
      );
      canvas.width = 1;
      canvas.height = 1;
      if (blob.size > resultLimit)
        throw new Error(
          "裁剪结果超过识题接口的 10 MiB 上限。请缩小框选范围；图片不会被自动降低分辨率。",
        );
      if (!blob.size) throw new Error("图片导出失败，请重新框选。");
      if (cancelled.current) return;
      onSave(
        new File(
          [blob],
          `${file.name.replace(/\.[^.]+$/, "") || "question"}-cropped.png`,
          { type: "image/png", lastModified: Date.now() },
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "裁剪失败，请缩小选区后重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(29, 49, 41, .58)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={-1}
        style={{
          width: "min(920px, 100%)",
          maxHeight: "94dvh",
          overflowY: "auto",
          background: "#fcfdf9",
          borderRadius: 24,
          boxShadow: "0 24px 100px #14251f40",
          padding: "clamp(18px, 3vw, 30px)",
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              id={titleId}
              style={{ margin: "0 0 8px", color: "#254c3e", fontSize: 22 }}
            >
              拖动框选一道题
            </h2>
            <p
              id={hintId}
              style={{
                margin: 0,
                color: "#728077",
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              保留题干、全部选项与相关短文。初始选中整张图，也可以用下方数值精确调整。
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭裁剪窗口"
            style={{
              ...button,
              minWidth: 44,
              padding: "8px 12px",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {url && (
          <div
            style={{
              background: "#e9eee8",
              borderRadius: 16,
              padding: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 120,
              overflow: "hidden",
            }}
          >
            <div
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={(event) => finish(event)}
              onPointerCancel={(event) => finish(event, true)}
              style={{
                position: "relative",
                width: "fit-content",
                maxWidth: "100%",
                lineHeight: 0,
                touchAction: "none",
                userSelect: "none",
                cursor: busy ? "wait" : "crosshair",
                overflow: "hidden",
                borderRadius: 5,
              }}
            >
              {/* This is a local object URL; no image is uploaded by this component. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={url}
                alt="待裁剪的英语题目原图"
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setSize({
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  });
                }}
                onError={() => {
                  setError(
                    "无法读取这张图片，请选择有效的 JPG、PNG 或 WebP 文件。",
                  );
                  setSize({ width: 0, height: 0 });
                }}
                style={{
                  display: "block",
                  width: "auto",
                  height: "auto",
                  maxWidth: "100%",
                  maxHeight: "49dvh",
                  objectFit: "contain",
                  pointerEvents: "none",
                }}
              />
              {!!size.width && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                    border: "2px dashed #ffffff",
                    outline: "1px solid #2d8866",
                    outlineOffset: -3,
                    boxShadow: "0 0 0 9999px rgba(21, 39, 30, .45)",
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(149, 224, 185, .07)",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {!!size.width && (
          <div style={{ marginTop: 15 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "end",
              }}
            >
              {(
                [
                  ["x", "左边距"],
                  ["y", "上边距"],
                  ["width", "宽度"],
                  ["height", "高度"],
                ] as const
              ).map(([field, label]) => (
                <label
                  key={field}
                  style={{ flex: "1 1 100px", fontSize: 12, color: "#69796f" }}
                >
                  {label}（像素）
                  <input
                    type="number"
                    min={field === "width" || field === "height" ? 1 : 0}
                    max={
                      field === "x" || field === "width"
                        ? size.width
                        : size.height
                    }
                    step={1}
                    value={pixels[field]}
                    disabled={busy || dragging}
                    onChange={(event) =>
                      adjust(field, event.currentTarget.valueAsNumber)
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      boxSizing: "border-box",
                      marginTop: 5,
                      minHeight: 40,
                      padding: "8px 10px",
                      border: "1px solid #d9e3da",
                      borderRadius: 9,
                      color: "#35564b",
                      background: "white",
                      font: "inherit",
                      fontSize: 14,
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCrop(whole);
                  setError("");
                }}
                style={{
                  ...button,
                  minHeight: 40,
                  fontSize: 13,
                  padding: "9px 13px",
                }}
              >
                重置为整张
              </button>
            </div>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                lineHeight: 1.6,
                color: "#7b877f",
              }}
            >
              原图 {size.width} × {size.height} · 选区 {pixels.width} ×{" "}
              {pixels.height} · 保留原始像素导出 PNG
            </p>
          </div>
        )}
        {error && (
          <p
            role="alert"
            style={{
              background: "#fff0e7",
              color: "#a2573f",
              borderRadius: 10,
              padding: "11px 13px",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {error}
          </p>
        )}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "#879087",
              marginRight: "auto",
              flex: "1 1 220px",
              lineHeight: 1.6,
            }}
          >
            支持 JPG / PNG / WebP，原图及裁剪结果均 ≤ 10 MiB。
          </span>
          <button type="button" onClick={close} style={button}>
            取消
          </button>
          <button
            type="button"
            disabled={busy || dragging || !size.width}
            onClick={save}
            style={{
              ...button,
              color: "#fff",
              background: "#3f7b5e",
              borderColor: "#3f7b5e",
              opacity: busy || dragging || !size.width ? 0.55 : 1,
              cursor:
                busy || dragging || !size.width ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "正在裁剪…" : "使用裁剪结果"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
