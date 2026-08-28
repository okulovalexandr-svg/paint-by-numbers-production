"use client";

import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createProductionFailureOverlay,
  correctNonSemanticGeometry,
  correctNonSemanticNoise,
  processPaintImage,
  selectProductionColors,
  snapImageToProductionPalette,
  validateProductionReadiness,
  type ProductionReadinessResult,
  type SemanticRegion,
} from "../lib/paint-processor";
import { productionPalette } from "../lib/production-palette";

type Section = "projects" | "editor" | "palettes" | "templates" | "makers" | "limits";
type ProjectStatus = "Готов" | "Нужны правки" | "В обработке" | "Черновик";
type ProductionCorrectionStrategy = "global-rebuild" | "local-repair";

type PaintColor = { id: number; code: string; name: string; hex: string };
type Project = {
  id: number;
  title: string;
  article: string;
  status: ProjectStatus;
  colors: number;
  updated: string;
  accent: string;
  sourceUrl?: string;
  aiPreviewUrl?: string;
  aiPalette?: PaintColor[];
  productionPreviewUrl?: string;
  productionSchemeUrl?: string;
  productionSvgUrl?: string;
  productionPdfUrl?: string;
  approvedPreviewUrl?: string;
  previewUrl?: string;
  schemeUrl?: string;
  svgUrl?: string;
  pdfUrl?: string;
  checkpointId?: string;
  usedColorIds?: number[];
  usedPaints?: PaintColor[];
  regionCount?: number;
  numberCount?: number;
  removedAreas?: number;
  unlabeledRegionCount?: number;
  stackedNumberCount?: number;
  repairedRegionCount?: number;
  protectedRegionCount?: number;
  minimumRegionArea?: number;
  semanticRegions?: SemanticRegion[];
  semanticPreviewUrl?: string;
  semanticAnalysisCostUsd?: number;
  aiCostUsd?: number;
  lastAiCostUsd?: number;
  aiGenerationCount?: number;
  productionReadiness?: ProductionReadinessResult;
  productionFailureOverlayUrl?: string;
  semanticFailCount?: number;
  nonSemanticFailCount?: number;
  productionCorrectionStrategy?: ProductionCorrectionStrategy;
};

type TemplateKind = "canvas" | "sticker";
type ProductionTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  widthMm: number;
  heightMm: number;
  version: number;
  isDefault: boolean;
  fileName?: string;
  updated: string;
  elements: string[];
};

const new174Palette: PaintColor[] = [
  { id: 1, code: "00YY-26/520", name: "Dulux / ACC", hex: "#B97B37" },
  { id: 2, code: "10RR-25/437", name: "Dulux / ACC", hex: "#B8609F" },
  { id: 3, code: "30RR-10/321", name: "Dulux / ACC", hex: "#7C3F63" },
  { id: 4, code: "30RR-15/375", name: "Dulux / ACC", hex: "#984A75" },
  { id: 5, code: "40RR-11/430", name: "Dulux / ACC", hex: "#903A67" },
  { id: 6, code: "50RR-15/400", name: "Dulux / ACC", hex: "#9D486E" },
  { id: 7, code: "RAL-340-1", name: "RAL EFFECT", hex: "#C2AAAF" },
  { id: 8, code: "RAL-530-5", name: "RAL EFFECT", hex: "#6E2E48" },
  { id: 9, code: "RAL-540-2", name: "RAL EFFECT", hex: "#C8A2C7" },
  { id: 10, code: "RAL-540-4", name: "RAL EFFECT", hex: "#A36B9E" },
  { id: 11, code: "RAL-540-5", name: "RAL EFFECT", hex: "#8E5884" },
  { id: 12, code: "RAL-560-1", name: "RAL EFFECT", hex: "#D2BFCD" },
  { id: 13, code: "RAL-570-3", name: "RAL EFFECT", hex: "#BAABE1" },
  { id: 14, code: "RAL-570-4", name: "RAL EFFECT", hex: "#AC98D4" },
  { id: 15, code: "RAL-570-5", name: "RAL EFFECT", hex: "#9275B8" },
  { id: 16, code: "RAL-570-6", name: "RAL EFFECT", hex: "#8867A1" },
  { id: 17, code: "RAL-590-2", name: "RAL EFFECT", hex: "#58467E" },
  { id: 18, code: "RAL-590-3", name: "RAL EFFECT", hex: "#453A73" },
  { id: 19, code: "RAL-590-4", name: "RAL EFFECT", hex: "#3B3764" },
  { id: 20, code: "RAL-590-5", name: "RAL EFFECT", hex: "#333562" },
  { id: 21, code: "RAL-590-6", name: "RAL EFFECT", hex: "#3A3C82" },
  { id: 22, code: "RAL-620-6", name: "RAL EFFECT", hex: "#31394C" },
  { id: 23, code: "RAL-760-4", name: "RAL EFFECT", hex: "#86A380" },
  { id: 24, code: "RAL-790-6", name: "RAL EFFECT", hex: "#30313B" },
  { id: 25, code: "S-7502-B", name: "NCS S", hex: "#292D2F" },
  { id: 26, code: "S-8502-G", name: "NCS S", hex: "#131411" },
  { id: 27, code: "S-8505-G20Y", name: "NCS S", hex: "#172016" },
  { id: 28, code: "S-9000-N", name: "NCS S", hex: "#111410" },
];

// Verified flat colors used across the approved FT159–FT163 previews. Exact
// production codes can be assigned in the palette editor; keeping this shared
// reference range prevents portrait and animal previews from being forced into
// the much narrower purple NEW174 subset.
const historicalReferenceHexes = `
#001209 #091115 #111410 #131411 #172016 #0C2517 #002C0F #13280F #00300D #262824 #222C20 #003B16
#292D2F #2B2E2C #30313B #2F3235 #3C3E42 #57383C #404040 #434241 #4F3F3C #583F38 #6A3F3A #7E3C32
#863C34 #4C4C41 #64483B #554C43 #46584B #735036 #685441 #675445 #BE3C34 #4D5E40 #73553F #6E584B
#C44134 #566065 #81583B #915440 #7A5C3E #4F6D3F #5D665D #935A3E #5D666A #9C5A38 #647036 #8F633B
#8F6538 #836654 #7C695B #63717B #767165 #886F5B #906F50 #707676 #A66E36 #9D703D #9B744C #D26636
#C86B29 #6D7E9C #82816E #6B8697 #788A4D #B97B37 #719145 #A18267 #818A7B #9B8575 #B28254 #7E8E94
#B8864B #AD8B58 #879D40 #A48F81 #C48493 #92948D #D28B3D #BD9244 #AD9380 #8AA25C #9A9A9A #B19F8F
#D29D56 #BBA389 #CEA177 #B8A79B #DAA567 #8FB2D2 #BCAB9D #E0A971 #CAAF98 #AEB4BA #C4B5AA #E0B380
#CBB8A5 #CEB8A7 #B3C0CB #A0C5D8 #ACC7A3 #EEB4A0 #EFBB71 #F2BB6E #D6C2B5 #C4C7CB #F4C37E
#C0CADF #CACBC4 #C7CDCA #BFCEE2 #F6C973 #DBCEC1 #F4C8BB #F8CE8E #F7D092 #E3D2BE #D5D4D5
#B6DBEC #D1D5D9 #D7D7D7 #D6DAD2 #DADCDC #D9DEE0 #E7DCCF #E0E1D9 #F2E6D2 #E6EBEB #F5EACC
#F9EBC4 #F5EEE1 #F0F1E7 #F5F6D3 #F6F4ED
`.trim().split(/\s+/);

const knownHexes = new Set(new174Palette.map((paint) => paint.hex.toUpperCase()));
const initialPalette: PaintColor[] = productionPalette;

const initialProjects: Project[] = [
  { id: 1, title: "Кот среди цветов", article: "NEW174", status: "Готов", colors: 28, updated: "Эталон из готового пакета", accent: "scene-cat", sourceUrl: "/reference/new174/source.webp", approvedPreviewUrl: "/reference/new174/approved-preview.png", previewUrl: "/reference/new174/approved-preview.png", schemeUrl: "/reference/new174/production-contours.png", usedColorIds: Array.from({ length: 28 }, (_, index) => index + 1), regionCount: 541, numberCount: 541, removedAreas: 349, unlabeledRegionCount: 0 },
  { id: 2, title: "Пара в горах", article: "FT159", status: "Готов", colors: 45, updated: "Эталон из истории", accent: "scene-dress", sourceUrl: "/reference/history/ft159-source.jpg", approvedPreviewUrl: "/reference/history/ft159-approved.png", previewUrl: "/reference/history/ft159-approved.png" },
  { id: 3, title: "Пара под салютом", article: "FT160", status: "Готов", colors: 45, updated: "Эталон из истории", accent: "scene-arch", sourceUrl: "/reference/history/ft160-source.jpg", approvedPreviewUrl: "/reference/history/ft160-approved.png", previewUrl: "/reference/history/ft160-approved.png" },
  { id: 4, title: "Французский бульдог", article: "FT161", status: "Готов", colors: 41, updated: "Эталон из истории", accent: "scene-hockey", sourceUrl: "/reference/history/ft161-source.jpg", approvedPreviewUrl: "/reference/history/ft161-approved.png", previewUrl: "/reference/history/ft161-approved.png" },
  { id: 5, title: "Портрет пары", article: "FT162", status: "Готов", colors: 45, updated: "Эталон из истории", accent: "scene-dress", sourceUrl: "/reference/history/ft162-source.jpg", approvedPreviewUrl: "/reference/history/ft162-approved.png", previewUrl: "/reference/history/ft162-approved.png" },
  { id: 6, title: "Кот крупным планом", article: "FT163", status: "Готов", colors: 43, updated: "Эталон из истории", accent: "scene-cat", sourceUrl: "/reference/history/ft163-source.jpg", approvedPreviewUrl: "/reference/history/ft163-approved.png", previewUrl: "/reference/history/ft163-approved.png" },
];

const manufacturers = [
  { name: "Hobruk", plan: "Владелец", used: 18, total: 999, people: 4, color: "#E75D4E" },
  { name: "Bright Color", plan: "Пакет 50", used: 31, total: 50, people: 2, color: "#486B84" },
  { name: "АртФабрика", plan: "Пакет 20", used: 14, total: 20, people: 1, color: "#6F8462" },
];

const initialTemplates: ProductionTemplate[] = [
  { id: "tpl-canvas-main", name: "Холст 40×50 · основной", kind: "canvas", widthMm: 475, heightMm: 575, version: 3, isDefault: true, updated: "Сегодня", elements: ["Артикул", "QR контрольного листа", "QR инструкции", "Техническая рамка"] },
  { id: "tpl-canvas-oem", name: "Холст OEM · 2 QR", kind: "canvas", widthMm: 475, heightMm: 575, version: 2, isDefault: false, updated: "24 августа", elements: ["Логотип производителя", "Артикул", "QR контрольного листа", "QR сборки", "Номер партии"] },
  { id: "tpl-sticker-box", name: "Стикер на коробку 90×120", kind: "sticker", widthMm: 90, heightMm: 120, version: 5, isDefault: true, updated: "22 августа", elements: ["Превью", "Артикул", "Штрихкод", "Количество цветов"] },
];

const nav: { id: Section; label: string; icon: string }[] = [
  { id: "projects", label: "Сюжеты", icon: "grid" },
  { id: "editor", label: "Редактор", icon: "edit" },
  { id: "palettes", label: "Палитры", icon: "palette" },
  { id: "templates", label: "Шаблоны", icon: "layers" },
  { id: "makers", label: "Производители", icon: "users" },
  { id: "limits", label: "Лимиты", icon: "meter" },
];

const detailKindLabels: Record<SemanticRegion["kind"], string> = {
  eye: "Глаз",
  text: "Надпись",
  logo: "Логотип",
  "key-detail": "Важная деталь",
  face: "Лицо",
  hand: "Рука",
};

function productionReadinessFailure(result: ProductionReadinessResult) {
  return `Превью не готово к производству: всего областей — ${result.regionCount}; без размещения 5 pt — ${result.failCount}; покрытие — ${result.fitCoverage.toFixed(2)}%; проблемная площадь — ${result.failedAreaPercent.toFixed(3)}%; плотность — ${result.densityPer100Cm2.toFixed(2)}/100 см². Исправьте превью перед утверждением.`;
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    palette: <><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 22a10 10 0 1 1 10-10c0 2-1 3-3 3h-2.2a2 2 0 0 0-1.8 2.9c.7 1.5-.4 4.1-3 4.1Z"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    meter: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-8"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
    upload: <><path d="M12 3v12m0-12 4 4m-4-4L8 7"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    spark: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
    comment: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function QrPreview({ label }: { label: string }) {
  const cells = [1,1,1,0,1,1,1,1,0,1,0,0,0,1,1,1,1,0,1,1,1,0,0,1,1,0,0,1,1,1,0,1,0,1,0,1,1,0,1,1,1,0,1,1,1,1,0,1,1];
  return <span className="qr-block" title={label}><i>{cells.map((cell, index) => <b key={index} className={cell ? "filled" : ""}/>)}</i><small>{label}</small></span>;
}

function TemplatePreview({ template, large = false }: { template: ProductionTemplate; large?: boolean }) {
  return (
    <div className={`template-sheet ${template.kind} ${large ? "large" : ""}`}>
      <span className="template-safe-zone"/>
      <b className="template-logo">HOBRUK</b>
      <span className="template-article">{template.kind === "canvas" ? "NEW-184 · 40×50" : "NEW-184"}</span>
      {template.elements.filter((item) => item.startsWith("QR")).slice(0, 3).map((item, index) => <QrPreview key={item} label={`QR ${index + 1}`}/>)}
      {template.elements.includes("Превью") && <span className="template-picture"><i/><i/><i/></span>}
      {template.elements.includes("Штрихкод") && <span className="template-barcode"/>}
      {template.elements.includes("Количество цветов") && <span className="template-colors">30 цветов</span>}
      <span className="template-caption">{template.widthMm} × {template.heightMm} мм</span>
    </div>
  );
}

function statusClass(status: ProjectStatus) {
  return `status status-${status === "Готов" ? "ready" : status === "Нужны правки" ? "review" : status === "В обработке" ? "working" : "draft"}`;
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const AI_UPLOAD_ECONOMY_BYTES = 700 * 1024;
const AI_UPLOAD_ECONOMY_EDGE = 1800;
const AI_UPLOAD_EXACT_BYTES = 2.5 * 1024 * 1024;
const AI_UPLOAD_EXACT_EDGE = 2560;

function canvasJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Не удалось подготовить изображение")),
      "image/jpeg",
      quality,
    );
  });
}

async function prepareImageForAi(file: File, quality: "medium" | "high") {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Файл больше 25 МБ");

  const bitmap = await createImageBitmap(file);
  try {
    const targetBytes = quality === "high" ? AI_UPLOAD_EXACT_BYTES : AI_UPLOAD_ECONOMY_BYTES;
    const maxEdge = quality === "high" ? AI_UPLOAD_EXACT_EDGE : AI_UPLOAD_ECONOMY_EDGE;
    const initialScale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    let best: Blob | null = null;

    for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Браузер не смог обработать изображение");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);

      const compressionSteps = quality === "high"
        ? [0.95, 0.92, 0.88, 0.84, 0.8]
        : [0.9, 0.82, 0.74, 0.66, 0.58];
      for (const jpegQuality of compressionSteps) {
        const blob = await canvasJpeg(canvas, jpegQuality);
        best = blob;
        if (blob.size <= targetBytes) {
          const name = file.name.replace(/\.[^.]+$/, "") || "source";
          return new File([blob], `${name}-ai.jpg`, { type: "image/jpeg" });
        }
      }

      const shrink = quality === "high" ? 0.9 : 0.82;
      width = Math.max(1, Math.round(width * shrink));
      height = Math.max(1, Math.round(height * shrink));
    }

    if (!best) throw new Error("Не удалось подготовить изображение");
    const name = file.name.replace(/\.[^.]+$/, "") || "source";
    return new File([best], `${name}-ai.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

type ImageApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
};

function imageApiCostUsd(usage?: ImageApiUsage) {
  if (!usage || typeof usage.output_tokens !== "number") return 0;
  const imageInput = usage.input_tokens_details?.image_tokens;
  const textInput = usage.input_tokens_details?.text_tokens;
  const inputCost = typeof imageInput === "number" && typeof textInput === "number"
    ? imageInput * 8 / 1_000_000 + textInput * 5 / 1_000_000
    : (usage.input_tokens || 0) * 8 / 1_000_000;
  return Number((inputCost + usage.output_tokens * 30 / 1_000_000).toFixed(6));
}

async function intelligentPreviewPayload(
  response: Response,
  onPartial: () => void,
): Promise<{ image?: string; error?: string; code?: string; costUsd?: number | null }> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const responseText = await response.text();
    try { return JSON.parse(responseText) as { image?: string; error?: string; code?: string; costUsd?: number | null }; }
    catch { return { error: response.ok ? "Сервер вернул неполный ответ" : `Ошибка сервера ${response.status}` }; }
  }
  if (!response.body) return { error: "Поток генерации не открылся" };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: { b64_json?: string; output_format?: string; usage?: ImageApiUsage } | null = null;
  let partialShown = false;
  const consume = (block: string) => {
    const serialized = block.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!serialized || serialized === "[DONE]") return;
    let event: { type?: string; b64_json?: string; output_format?: string; usage?: ImageApiUsage; error?: string } = {};
    try { event = JSON.parse(serialized) as typeof event; } catch { return; }
    if (event.type === "image_edit.partial_image" && !partialShown) {
      partialShown = true;
      onPartial();
    }
    if (event.type === "image_edit.completed") completed = event;
    if (event.type === "hobruk.error") throw new Error(event.error || "Поток генерации был прерван");
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) consume(block);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!completed?.b64_json) return { error: "OpenAI завершил поток без готового изображения" };
  const format = completed.output_format === "webp" ? "webp" : completed.output_format === "jpeg" ? "jpeg" : "png";
  return {
    image: `data:image/${format};base64,${completed.b64_json}`,
    costUsd: imageApiCostUsd(completed.usage),
  };
}

async function analyzeSemanticPreview(imageUrl: string) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("Не удалось открыть превью для проверки деталей");
  const blob = await imageResponse.blob();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const body = new FormData();
  body.set("image", new File([blob], `production-preview.${extension}`, { type: blob.type || "image/jpeg" }));
  const response = await fetch("/api/semantic-analysis", { method: "POST", body });
  const payload = await response.json().catch(() => ({})) as {
    regions?: SemanticRegion[];
    costUsd?: number | null;
    error?: string;
  };
  if (!response.ok || !payload.regions?.length) {
    throw new Error(payload.error || "ИИ не смог проверить глаза, надписи и важные детали");
  }
  return { regions: payload.regions, costUsd: payload.costUsd || 0 };
}

async function imageUrlFile(imageUrl: string, name: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Не удалось открыть изображение для производственной коррекции");
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export default function Studio({ viewer }: { viewer: { name: string; email: string } }) {
  const [section, setSection] = useState<Section>("projects");
  const [projects, setProjects] = useState(initialProjects);
  const [palette, setPalette] = useState(initialPalette);
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateKind, setTemplateKind] = useState<"all" | TemplateKind>("all");
  const [activeTemplate, setActiveTemplate] = useState<ProductionTemplate>(initialTemplates[0]);
  const [activeProject, setActiveProject] = useState<Project>(initialProjects[0]);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newColorOpen, setNewColorOpen] = useState(false);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [detailEditorOpen, setDetailEditorOpen] = useState(false);
  const [detailEditorLoading, setDetailEditorLoading] = useState(false);
  const [detailEditorRegions, setDetailEditorRegions] = useState<SemanticRegion[]>([]);
  const [detailKind, setDetailKind] = useState<SemanticRegion["kind"]>("key-detail");
  const [detailDraftStart, setDetailDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [detailDraftRect, setDetailDraftRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiProfile, setAiProfile] = useState("auto");
  const [aiQuality, setAiQuality] = useState<"medium" | "high">("high");
  const [aiColorCount, setAiColorCount] = useState(45);
  const [aiCorrection, setAiCorrection] = useState("");
  const [aiError, setAiError] = useState("");
  const [productionError, setProductionError] = useState("");
  const [processingStage, setProcessingStage] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [colorCount, setColorCount] = useState(28);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [toast, setToast] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const approvedPreviewRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<File | null>(null);
  const aiSourceFileRef = useRef<File | null>(null);
  const aiSourceQualityRef = useRef<"medium" | "high" | null>(null);

  const filteredProjects = useMemo(
    () => projects.filter((project) => `${project.title} ${project.article}`.toLowerCase().includes(search.toLowerCase())),
    [projects, search],
  );
  const activePaints = useMemo(() => {
    if (activeProject.usedPaints?.length) return activeProject.usedPaints;
    if (activeProject.aiPreviewUrl && activeProject.aiPalette?.length) return activeProject.aiPalette;
    if (activeProject.approvedPreviewUrl && !activeProject.usedColorIds?.length) return [];
    if (!activeProject.usedColorIds?.length) return palette.slice(0, Math.min(colorCount, palette.length));
    return activeProject.usedColorIds.map((id) => palette.find((paint) => paint.id === id)).filter((paint): paint is PaintColor => Boolean(paint));
  }, [activeProject.aiPalette, activeProject.aiPreviewUrl, activeProject.approvedPreviewUrl, activeProject.usedColorIds, activeProject.usedPaints, colorCount, palette]);
  const hasProductionMap = Boolean(
    activeProject.productionPreviewUrl
    && activeProject.productionSchemeUrl
    && activeProject.productionSvgUrl
    && activeProject.productionPdfUrl,
  );
  const displayedPreviewUrl = showAiDraft && activeProject.aiPreviewUrl
    ? activeProject.aiPreviewUrl
    : activeProject.previewUrl;
  const workflowError = productionError || aiError;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/templates")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { templates?: ProductionTemplate[] }) => {
        if (!cancelled && payload.templates?.length) {
          setTemplates(payload.templates);
          setActiveTemplate(payload.templates[0]);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void fetch("/api/intelligent-preview")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { configured?: boolean }) => setAiConfigured(Boolean(payload.configured)))
      .catch(() => setAiConfigured(false));
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function readinessFailureProject(
    base: Project,
    failedRaster: string,
    selectedPalette: PaintColor[],
    semanticRegions: SemanticRegion[],
    readiness: ProductionReadinessResult,
    costUpdate: { semanticCostUsd?: number; operationCostUsd?: number; generationIncrement?: number } = {},
    correctionStrategy?: ProductionCorrectionStrategy,
  ) {
    const overlay = await createProductionFailureOverlay(failedRaster, selectedPalette, semanticRegions);
    if (overlay.semanticFailCount + overlay.nonSemanticFailCount !== readiness.failCount) {
      throw new Error("Диагностический overlay не совпал с production readiness result");
    }
    const operationCost = costUpdate.operationCostUsd || 0;
    return {
      ...base,
      aiPreviewUrl: failedRaster,
      previewUrl: failedRaster,
      aiPalette: selectedPalette,
      productionReadiness: readiness,
      productionFailureOverlayUrl: overlay.overlay,
      semanticFailCount: overlay.semanticFailCount,
      nonSemanticFailCount: overlay.nonSemanticFailCount,
      productionCorrectionStrategy: correctionStrategy,
      productionPreviewUrl: undefined,
      productionSchemeUrl: undefined,
      productionSvgUrl: undefined,
      productionPdfUrl: undefined,
      approvedPreviewUrl: undefined,
      schemeUrl: undefined,
      svgUrl: undefined,
      pdfUrl: undefined,
      checkpointId: undefined,
      usedColorIds: undefined,
      usedPaints: undefined,
      regionCount: readiness.regionCount,
      numberCount: readiness.fitCount,
      unlabeledRegionCount: readiness.failCount,
      semanticRegions,
      semanticPreviewUrl: failedRaster,
      semanticAnalysisCostUsd: costUpdate.semanticCostUsd ?? base.semanticAnalysisCostUsd,
      aiCostUsd: Number(((base.aiCostUsd || 0) + operationCost).toFixed(6)),
      lastAiCostUsd: operationCost ? Number(operationCost.toFixed(6)) : base.lastAiCostUsd,
      aiGenerationCount: (base.aiGenerationCount || 0) + (costUpdate.generationIncrement || 0),
      status: "Нужны правки" as ProjectStatus,
      updated: "Превью требует производственной коррекции",
    };
  }

  function downloadProduction(format: "svg" | "pdf") {
    const url = format === "svg" ? activeProject.svgUrl : activeProject.pdfUrl;
    if (!url || !activeProject.approvedPreviewUrl) {
      notify("Сначала утвердите контрольную карту");
      return;
    }
    const safeArticle = (activeProject.article || "HOBRUK").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const checkpoint = activeProject.checkpointId || "checkpoint";
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeArticle}_${checkpoint}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    notify(`${format.toUpperCase()} выгружен из ${checkpoint}`);
  }

  function openEditor(project: Project) {
    sourceFileRef.current = null;
    aiSourceFileRef.current = null;
    aiSourceQualityRef.current = null;
    setAiError("");
    setProductionError("");
    setProcessingStage("");
    setProcessingProgress(0);
    setShowAiDraft(false);
    setActiveProject(project);
    setColorCount(project.colors);
    setAiColorCount(Math.max(24, Math.min(60, project.colors || 45)));
    setSection("editor");
  }

  async function loadImage(file: File) {
    if (file.size > MAX_SOURCE_BYTES) {
      notify("Файл больше 25 МБ — выберите изображение меньшего размера");
      return;
    }
    sourceFileRef.current = file;
    aiSourceFileRef.current = null;
    aiSourceQualityRef.current = null;
    setAiError("");
    setProductionError("");
    const sourceUrl = URL.createObjectURL(file);
    setShowAiDraft(false);
    const updated = { ...activeProject, sourceUrl, aiPreviewUrl: undefined, aiPalette: undefined, productionPreviewUrl: undefined, productionSchemeUrl: undefined, productionSvgUrl: undefined, productionPdfUrl: undefined, approvedPreviewUrl: undefined, previewUrl: undefined, schemeUrl: undefined, svgUrl: undefined, pdfUrl: undefined, checkpointId: undefined, usedColorIds: undefined, usedPaints: undefined, regionCount: undefined, numberCount: undefined, removedAreas: undefined, unlabeledRegionCount: undefined, stackedNumberCount: undefined, repairedRegionCount: undefined, protectedRegionCount: undefined, minimumRegionArea: undefined, semanticRegions: undefined, semanticPreviewUrl: undefined, semanticAnalysisCostUsd: undefined, productionReadiness: undefined, productionFailureOverlayUrl: undefined, semanticFailCount: undefined, nonSemanticFailCount: undefined, productionCorrectionStrategy: undefined, aiCostUsd: 0, lastAiCostUsd: undefined, aiGenerationCount: 0, status: "Черновик" as ProjectStatus };
    setActiveProject(updated);
    setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSection("editor");
    notify("Оригинал загружен");
  }

  async function loadApprovedPreview(file: File) {
    if (file.size > MAX_SOURCE_BYTES) {
      notify("Файл больше 25 МБ — выберите превью меньшего размера");
      return;
    }
    setAiError("");
    setProductionError("");
    setShowAiDraft(true);
    const uploadedPreviewUrl = URL.createObjectURL(file);
    const updated: Project = {
      ...activeProject,
      aiPreviewUrl: uploadedPreviewUrl,
      aiPalette: undefined,
      productionPreviewUrl: undefined,
      productionSchemeUrl: undefined,
      productionSvgUrl: undefined,
      productionPdfUrl: undefined,
      aiCostUsd: 0,
      lastAiCostUsd: undefined,
      aiGenerationCount: 0,
      approvedPreviewUrl: undefined,
      previewUrl: uploadedPreviewUrl,
      schemeUrl: undefined,
      svgUrl: undefined,
      pdfUrl: undefined,
      checkpointId: undefined,
      usedColorIds: undefined,
      usedPaints: undefined,
      regionCount: undefined,
      numberCount: undefined,
      removedAreas: undefined,
      unlabeledRegionCount: undefined,
      stackedNumberCount: undefined,
      repairedRegionCount: undefined,
      protectedRegionCount: undefined,
      minimumRegionArea: undefined,
      semanticRegions: undefined,
      semanticPreviewUrl: undefined,
      semanticAnalysisCostUsd: undefined,
      productionReadiness: undefined,
      productionFailureOverlayUrl: undefined,
      semanticFailCount: undefined,
      nonSemanticFailCount: undefined,
      productionCorrectionStrategy: undefined,
      status: "Нужны правки",
    };
    setActiveProject(updated);
    setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    notify("Превью загружено — оно станет единой картой для цвета, SVG и PDF");
  }

  async function sourceFile() {
    if (sourceFileRef.current) return sourceFileRef.current;
    if (!activeProject.sourceUrl) return null;
    const response = await fetch(activeProject.sourceUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], `${activeProject.article || "source"}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type || "image/jpeg" });
  }

  async function openDetailEditor() {
    if (!activeProject.aiPreviewUrl || activeProject.approvedPreviewUrl) return;
    setDetailEditorOpen(true);
    setDetailDraftRect(null);
    setDetailDraftStart(null);
    if (activeProject.semanticRegions?.length) {
      setDetailEditorRegions(activeProject.semanticRegions);
      return;
    }
    setDetailEditorLoading(true);
    try {
      const semantic = await analyzeSemanticPreview(activeProject.aiPreviewUrl);
      setDetailEditorRegions(semantic.regions);
      const updated: Project = {
        ...activeProject,
        semanticRegions: semantic.regions,
        semanticPreviewUrl: activeProject.aiPreviewUrl,
        semanticAnalysisCostUsd: semantic.costUsd,
        aiCostUsd: Number(((activeProject.aiCostUsd || 0) + semantic.costUsd).toFixed(6)),
        lastAiCostUsd: semantic.costUsd || activeProject.lastAiCostUsd,
      };
      setActiveProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось распознать важные детали";
      setProductionError(message);
      notify(message);
      setDetailEditorOpen(false);
    } finally {
      setDetailEditorLoading(false);
    }
  }

  function detailPointerPosition(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function beginDetailSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (detailEditorLoading) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = detailPointerPosition(event);
    setDetailDraftStart(point);
    setDetailDraftRect({ ...point, width: 0, height: 0 });
  }

  function moveDetailSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!detailDraftStart) return;
    const point = detailPointerPosition(event);
    setDetailDraftRect({
      x: Math.min(detailDraftStart.x, point.x),
      y: Math.min(detailDraftStart.y, point.y),
      width: Math.abs(point.x - detailDraftStart.x),
      height: Math.abs(point.y - detailDraftStart.y),
    });
  }

  function finishDetailSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!detailDraftStart) return;
    const point = detailPointerPosition(event);
    const region = {
      x: Math.min(detailDraftStart.x, point.x),
      y: Math.min(detailDraftStart.y, point.y),
      width: Math.abs(point.x - detailDraftStart.x),
      height: Math.abs(point.y - detailDraftStart.y),
    };
    if (region.width >= 0.008 && region.height >= 0.008) {
      setDetailEditorRegions((items) => [...items, {
        ...region,
        kind: detailKind,
        label: `Ручная область: ${detailKindLabels[detailKind]}`,
        priority: "critical",
      }]);
    }
    setDetailDraftStart(null);
    setDetailDraftRect(null);
  }

  function saveDetailRegions() {
    const updated: Project = {
      ...activeProject,
      semanticRegions: detailEditorRegions,
      productionPreviewUrl: undefined,
      productionSchemeUrl: undefined,
      productionSvgUrl: undefined,
      productionPdfUrl: undefined,
      approvedPreviewUrl: undefined,
      schemeUrl: undefined,
      svgUrl: undefined,
      pdfUrl: undefined,
      checkpointId: undefined,
      regionCount: undefined,
      numberCount: undefined,
      productionReadiness: undefined,
      productionFailureOverlayUrl: undefined,
      semanticFailCount: undefined,
      nonSemanticFailCount: undefined,
      productionCorrectionStrategy: undefined,
      status: "Нужны правки",
      updated: "Защищённые детали проверены",
    };
    setActiveProject(updated);
    setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    setDetailEditorOpen(false);
    notify(`${detailEditorRegions.length} важных зон сохранено — заново зафиксируйте карту`);
  }

  async function generateIntelligentPreview() {
    if (!activeProject.sourceUrl) { uploadRef.current?.click(); return; }
    if (aiConfigured === false) {
      setAiSettingsOpen(true);
      notify("Нужно подключить секрет OPENAI_API_KEY в настройках приложения");
      return;
    }
    setIsGeneratingAi(true);
    setAiError("");
    setProductionError("");
    const processing = { ...activeProject, status: "В обработке" as ProjectStatus };
    setActiveProject(processing);
    setProjects((items) => items.map((item) => item.id === processing.id ? processing : item));
    try {
      const original = await sourceFile();
      if (!original) throw new Error("Исходное изображение недоступно");
      const targetBytes = aiQuality === "high" ? AI_UPLOAD_EXACT_BYTES : AI_UPLOAD_ECONOMY_BYTES;
      notify(original.size > targetBytes ? "Подготавливаем большое фото без потери важных деталей…" : "Подготавливаем изображение…");
      const file = aiSourceFileRef.current && aiSourceQualityRef.current === aiQuality
        ? aiSourceFileRef.current
        : await prepareImageForAi(original, aiQuality);
      aiSourceFileRef.current = file;
      aiSourceQualityRef.current = aiQuality;
      const selectedProductionPalette = await selectProductionColors(
        activeProject.sourceUrl,
        palette,
        Math.min(aiColorCount, palette.length),
      );
      const body = new FormData();
      body.set("image", file);
      body.set("targetColors", String(selectedProductionPalette.length));
      body.set("palette", JSON.stringify(selectedProductionPalette.map(({ code, name, hex }) => ({ code, name, hex }))));
      body.set("profile", aiProfile);
      body.set("quality", aiQuality);
      body.set("correction", aiCorrection);
      const response = await fetch("/api/intelligent-preview", { method: "POST", body });
      const payload = await intelligentPreviewPayload(response, () => notify("ИИ закончил черновой проход — уточняем детали…"));
      if (response.status === 413) throw new Error("Фотография не прошла подготовку. Попробуйте загрузить её ещё раз.");
      if (!response.ok || !payload.image) throw new Error(payload.error || "Не удалось создать ИИ-превью");
      const generationCost = typeof payload.costUsd === "number" ? payload.costUsd : 0;
      setIsProcessing(true);
      setProcessingProgress(4);
      setProcessingStage("Распознаём глаза, надписи и важные детали…");
      const palettePreview = await snapImageToProductionPalette(payload.image, selectedProductionPalette);
      const semantic = await analyzeSemanticPreview(palettePreview);
      setProcessingStage("Убираем безопасные шумовые микрообласти…");
      const correction = await correctNonSemanticNoise(palettePreview, selectedProductionPalette, semantic.regions);
      setProcessingStage("Расширяем безопасные узкие области…");
      const geometryCorrection = await correctNonSemanticGeometry(correction.correctedRaster, selectedProductionPalette, semantic.regions);
      setProcessingStage("Проверяем готовность каждой области к номеру 5 pt…");
      const readiness = await validateProductionReadiness(geometryCorrection.correctedRaster, selectedProductionPalette, {
        semanticAvailable: semantic.regions.length > 0,
      });
      if (readiness.status === "FAIL") {
        const failed = await readinessFailureProject(
          activeProject,
          geometryCorrection.correctedRaster,
          selectedProductionPalette,
          semantic.regions,
          readiness,
          { semanticCostUsd: semantic.costUsd, operationCostUsd: generationCost + semantic.costUsd, generationIncrement: 1 },
        );
        setActiveProject(failed);
        setProjects((items) => items.map((item) => item.id === failed.id ? failed : item));
        setShowAiDraft(true);
        setAiSettingsOpen(false);
        setProductionError(productionReadinessFailure(readiness));
        notify("Превью сохранено: требуется производственная коррекция");
        return;
      }
      setProcessingStage("Фиксируем единую карту областей из ИИ-превью…");
      const result = await processPaintImage(
        geometryCorrection.correctedRaster,
        selectedProductionPalette,
        selectedProductionPalette.length,
        "approved",
        {
          productionReadiness: readiness,
          preserveSemanticDetails: true,
          semanticRegions: semantic.regions,
          onProgress: (stage, progress) => {
            setProcessingStage(stage);
            setProcessingProgress(progress);
          },
        },
      );
      if (result.unlabeledRegionCount !== 0) {
        throw new Error(`Контроль не пройден: ${result.unlabeledRegionCount} областей без цифры`);
      }
      const updated: Project = {
        ...activeProject,
        // What the user sees is already the immutable colour map used by SVG
        // and PDF. There is no second, hidden simplification after approval.
        aiPreviewUrl: result.preview,
        aiPalette: selectedProductionPalette,
        productionPreviewUrl: result.preview,
        productionSchemeUrl: result.scheme,
        productionSvgUrl: result.svg,
        productionPdfUrl: result.pdf,
        approvedPreviewUrl: undefined,
        previewUrl: result.preview,
        schemeUrl: undefined,
        svgUrl: undefined,
        pdfUrl: undefined,
        checkpointId: result.checkpointId,
        usedColorIds: result.usedColors.map((paint) => paint.id),
        usedPaints: result.usedColors,
        regionCount: result.regionCount,
        numberCount: result.numberCount,
        removedAreas: result.removedAreas,
        unlabeledRegionCount: result.unlabeledRegionCount,
        stackedNumberCount: result.stackedNumberCount,
        repairedRegionCount: result.repairedRegionCount,
        protectedRegionCount: result.protectedRegionCount,
        minimumRegionArea: result.minimumRegionArea,
        semanticRegions: semantic.regions,
        semanticPreviewUrl: geometryCorrection.correctedRaster,
        semanticAnalysisCostUsd: semantic.costUsd,
        aiCostUsd: Number(((activeProject.aiCostUsd || 0) + generationCost + semantic.costUsd).toFixed(6)),
        lastAiCostUsd: Number((generationCost + semantic.costUsd).toFixed(6)) || undefined,
        aiGenerationCount: (activeProject.aiGenerationCount || 0) + 1,
        productionReadiness: readiness,
        productionFailureOverlayUrl: undefined,
        semanticFailCount: 0,
        nonSemanticFailCount: 0,
        productionCorrectionStrategy: undefined,
        colors: result.usedColors.length,
        status: "Нужны правки",
        updated: "Единая производственная карта на проверке",
      };
      setActiveProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
      setShowAiDraft(false);
      setAiSettingsOpen(false);
      setAiError("");
      const totalOperationCost = generationCost + semantic.costUsd;
      notify(`Единая карта готова: ${result.regionCount} областей · API ${totalOperationCost ? `$${totalOperationCost.toFixed(3)}` : "учтено"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать ИИ-превью";
      const failed = { ...activeProject, status: "Черновик" as ProjectStatus };
      setActiveProject(failed);
      setProjects((items) => items.map((item) => item.id === failed.id ? failed : item));
      setAiError(message);
      notify(message);
    } finally {
      setIsGeneratingAi(false);
      setIsProcessing(false);
      setProcessingStage("");
      setProcessingProgress(0);
    }
  }

  async function prepareProductionMap() {
    if (!activeProject.aiPreviewUrl) return;
    setIsProcessing(true);
    setProductionError("");
    setProcessingProgress(2);
    setProcessingStage("Подготавливаем утверждённое превью…");
    try {
      let exactPaletteSubset: PaintColor[] | undefined;
      if (!activeProject.aiPalette?.length) {
        const image = new Image();
        image.src = activeProject.aiPreviewUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const paletteKeys = new Set(palette.map((paint) => Number.parseInt(paint.hex.slice(1), 16)));
        const usedKeys = new Set<number>();
        let isExactPaletteRaster = true;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const key = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
          if (pixels[offset + 3] !== 255 || !paletteKeys.has(key)) {
            isExactPaletteRaster = false;
            break;
          }
          usedKeys.add(key);
        }
        if (isExactPaletteRaster) {
          exactPaletteSubset = palette.filter((paint) => usedKeys.has(Number.parseInt(paint.hex.slice(1), 16)));
        }
      }
      const aiPalette = activeProject.aiPalette?.length
        ? activeProject.aiPalette
        : exactPaletteSubset
          ? exactPaletteSubset
        : await selectProductionColors(activeProject.aiPreviewUrl, palette, Math.min(aiColorCount, palette.length));
      const paletteReadyPreview = activeProject.aiPalette?.length || exactPaletteSubset
        ? activeProject.aiPreviewUrl
        : await snapImageToProductionPalette(activeProject.aiPreviewUrl, aiPalette);
      setProcessingProgress(8);
      setProcessingStage("Проверяем глаза, надписи и важные детали…");
      const semantic = activeProject.semanticRegions?.length
        ? { regions: activeProject.semanticRegions, costUsd: activeProject.semanticAnalysisCostUsd || 0 }
        : await analyzeSemanticPreview(paletteReadyPreview);
      setProcessingStage("Убираем безопасные шумовые микрообласти…");
      const correction = await correctNonSemanticNoise(paletteReadyPreview, aiPalette, semantic.regions);
      setProcessingStage("Расширяем безопасные узкие области…");
      const geometryCorrection = await correctNonSemanticGeometry(correction.correctedRaster, aiPalette, semantic.regions);
      setProcessingStage("Проверяем готовность каждой области к номеру 5 pt…");
      const readiness = await validateProductionReadiness(geometryCorrection.correctedRaster, aiPalette, {
        semanticAvailable: semantic.regions.length > 0,
      });
      if (readiness.status === "FAIL") {
        const newSemanticCost = activeProject.semanticRegions?.length ? 0 : semantic.costUsd;
        const failed = await readinessFailureProject(
          activeProject,
          geometryCorrection.correctedRaster,
          aiPalette,
          semantic.regions,
          readiness,
          { semanticCostUsd: semantic.costUsd, operationCostUsd: newSemanticCost },
        );
        setActiveProject(failed);
        setProjects((items) => items.map((item) => item.id === failed.id ? failed : item));
        setShowAiDraft(true);
        setProductionError(productionReadinessFailure(readiness));
        notify("Превью сохранено: требуется производственная коррекция");
        return;
      }
      setProcessingStage("Фиксируем загруженное превью как единую карту областей…");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const result = await processPaintImage(
        geometryCorrection.correctedRaster,
        aiPalette,
        aiPalette.length,
        "approved",
        {
          productionReadiness: readiness,
          preserveSemanticDetails: true,
          semanticRegions: semantic.regions,
          onProgress: (stage, progress) => {
            setProcessingStage(stage);
            setProcessingProgress(progress);
          },
        },
      );
      if (result.unlabeledRegionCount !== 0) {
        throw new Error(`Контроль не пройден: ${result.unlabeledRegionCount} областей без цифры`);
      }
      const updated: Project = {
        ...activeProject,
        aiPreviewUrl: result.preview,
        aiPalette,
        // The preview and hidden scheme are rendered in the same processing
        // pass from one cleaned label map. Approval below only freezes this
        // pair; it never traces the displayed PNG a second time.
        productionPreviewUrl: result.preview,
        productionSchemeUrl: result.scheme,
        productionSvgUrl: result.svg,
        productionPdfUrl: result.pdf,
        approvedPreviewUrl: undefined,
        previewUrl: result.preview,
        schemeUrl: undefined,
        svgUrl: undefined,
        pdfUrl: undefined,
        checkpointId: result.checkpointId,
        colors: result.usedColors.length,
        usedColorIds: result.usedColors.map((paint) => paint.id),
        usedPaints: result.usedColors,
        regionCount: result.regionCount,
        numberCount: result.numberCount,
        removedAreas: result.removedAreas,
        unlabeledRegionCount: result.unlabeledRegionCount,
        stackedNumberCount: result.stackedNumberCount,
        repairedRegionCount: result.repairedRegionCount,
        protectedRegionCount: result.protectedRegionCount,
        minimumRegionArea: result.minimumRegionArea,
        semanticRegions: semantic.regions,
        semanticPreviewUrl: geometryCorrection.correctedRaster,
        semanticAnalysisCostUsd: semantic.costUsd,
        aiCostUsd: Number(((activeProject.aiCostUsd || 0) + (activeProject.semanticRegions?.length ? 0 : semantic.costUsd)).toFixed(6)),
        lastAiCostUsd: activeProject.semanticRegions?.length
          ? activeProject.lastAiCostUsd
          : semantic.costUsd || activeProject.lastAiCostUsd,
        productionReadiness: readiness,
        productionFailureOverlayUrl: undefined,
        semanticFailCount: 0,
        nonSemanticFailCount: 0,
        productionCorrectionStrategy: undefined,
        status: "Нужны правки",
        updated: "Производственная карта на проверке",
      };
      setActiveProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
      setShowAiDraft(false);
      setProductionError("");
      notify(`Checkpoint ${result.checkpointId}: превью, SVG и PDF построены из одной карты · цифры 5–8 pt`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подготовить производственную карту";
      setProductionError(message);
      notify(message);
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
      setProcessingProgress(0);
    }
  }

  async function correctPreviewForProduction() {
    const selectedProductionPalette = activeProject.aiPalette;
    const currentReadiness = activeProject.productionReadiness;
    if (
      !activeProject.aiPreviewUrl
      || !activeProject.productionFailureOverlayUrl
      || !selectedProductionPalette?.length
      || currentReadiness?.status !== "FAIL"
    ) return;
    if (aiConfigured === false) {
      notify("Нужно подключить секрет OPENAI_API_KEY в настройках приложения");
      return;
    }
    setIsGeneratingAi(true);
    setAiError("");
    setProductionError("");
    try {
      const correctionStrategy: ProductionCorrectionStrategy = currentReadiness.fitCoverage < 25
        ? "global-rebuild"
        : "local-repair";
      const body = new FormData();
      body.set("mode", "production-correction");
      body.set("image", await imageUrlFile(activeProject.aiPreviewUrl, "failed-production-preview.png"));
      body.set("failureOverlay", await imageUrlFile(activeProject.productionFailureOverlayUrl, "production-failure-overlay.png"));
      const original = await sourceFile();
      if (original) body.set("sourceReference", original);
      body.set("targetColors", String(selectedProductionPalette.length));
      body.set("palette", JSON.stringify(selectedProductionPalette.map(({ code, name, hex }) => ({ code, name, hex }))));
      body.set("profile", aiProfile);
      body.set("quality", aiQuality);
      body.set("readinessDiagnostics", JSON.stringify({
        regionCount: currentReadiness.regionCount,
        failCount: currentReadiness.failCount,
        fitCoverage: currentReadiness.fitCoverage,
        failedAreaPercent: currentReadiness.failedAreaPercent,
        densityPer100Cm2: currentReadiness.densityPer100Cm2,
        semanticFailCount: activeProject.semanticFailCount || 0,
        nonSemanticFailCount: activeProject.nonSemanticFailCount || 0,
      }));
      const response = await fetch("/api/intelligent-preview", { method: "POST", body });
      const payload = await intelligentPreviewPayload(response, () => notify("ИИ исправляет выделенные производственные зоны…"));
      if (!response.ok || !payload.image) throw new Error(payload.error || "Не удалось исправить превью под производство");
      const generationCost = typeof payload.costUsd === "number" ? payload.costUsd : 0;
      setIsProcessing(true);
      setProcessingProgress(4);
      setProcessingStage("Возвращаем исправление в выбранную производственную палитру…");
      const palettePreview = await snapImageToProductionPalette(payload.image, selectedProductionPalette);
      setProcessingStage("Повторно проверяем важные детали…");
      const semantic = await analyzeSemanticPreview(palettePreview);
      setProcessingStage("Убираем безопасные шумовые микрообласти…");
      const noiseCorrection = await correctNonSemanticNoise(palettePreview, selectedProductionPalette, semantic.regions);
      setProcessingStage("Расширяем безопасные узкие области…");
      const geometryCorrection = await correctNonSemanticGeometry(noiseCorrection.correctedRaster, selectedProductionPalette, semantic.regions);
      setProcessingStage("Проверяем готовность каждой области к номеру 5 pt…");
      const readiness = await validateProductionReadiness(geometryCorrection.correctedRaster, selectedProductionPalette, {
        semanticAvailable: semantic.regions.length > 0,
      });
      const operationCost = generationCost + semantic.costUsd;
      if (readiness.status === "FAIL") {
        const failed = await readinessFailureProject(
          activeProject,
          geometryCorrection.correctedRaster,
          selectedProductionPalette,
          semantic.regions,
          readiness,
          { semanticCostUsd: semantic.costUsd, operationCostUsd: operationCost, generationIncrement: 1 },
          correctionStrategy,
        );
        setActiveProject(failed);
        setProjects((items) => items.map((item) => item.id === failed.id ? failed : item));
        setShowAiDraft(true);
        setProductionError(productionReadinessFailure(readiness));
        notify("Исправленное превью сохранено, но ещё требует коррекции");
        return;
      }
      setProcessingStage("Готовим исправленную карту к обычному визуальному утверждению…");
      const result = await processPaintImage(
        geometryCorrection.correctedRaster,
        selectedProductionPalette,
        selectedProductionPalette.length,
        "approved",
        {
          productionReadiness: readiness,
          preserveSemanticDetails: true,
          semanticRegions: semantic.regions,
          onProgress: (stage, progress) => {
            setProcessingStage(stage);
            setProcessingProgress(progress);
          },
        },
      );
      if (result.unlabeledRegionCount !== 0) throw new Error(`Контроль не пройден: ${result.unlabeledRegionCount} областей без цифры`);
      const updated: Project = {
        ...activeProject,
        aiPreviewUrl: result.preview,
        previewUrl: result.preview,
        aiPalette: selectedProductionPalette,
        productionPreviewUrl: result.preview,
        productionSchemeUrl: result.scheme,
        productionSvgUrl: result.svg,
        productionPdfUrl: result.pdf,
        approvedPreviewUrl: undefined,
        schemeUrl: undefined,
        svgUrl: undefined,
        pdfUrl: undefined,
        checkpointId: result.checkpointId,
        usedColorIds: result.usedColors.map((paint) => paint.id),
        usedPaints: result.usedColors,
        regionCount: result.regionCount,
        numberCount: result.numberCount,
        removedAreas: result.removedAreas,
        unlabeledRegionCount: result.unlabeledRegionCount,
        stackedNumberCount: result.stackedNumberCount,
        repairedRegionCount: result.repairedRegionCount,
        protectedRegionCount: result.protectedRegionCount,
        minimumRegionArea: result.minimumRegionArea,
        semanticRegions: semantic.regions,
        semanticPreviewUrl: geometryCorrection.correctedRaster,
        semanticAnalysisCostUsd: semantic.costUsd,
        aiCostUsd: Number(((activeProject.aiCostUsd || 0) + operationCost).toFixed(6)),
        lastAiCostUsd: Number(operationCost.toFixed(6)) || undefined,
        aiGenerationCount: (activeProject.aiGenerationCount || 0) + 1,
        productionReadiness: readiness,
        productionFailureOverlayUrl: undefined,
        semanticFailCount: 0,
        nonSemanticFailCount: 0,
        productionCorrectionStrategy: correctionStrategy,
        colors: result.usedColors.length,
        status: "Нужны правки",
        updated: "Исправленная производственная карта на проверке",
      };
      setActiveProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
      setShowAiDraft(false);
      notify(`Исправление прошло readiness: ${result.regionCount} областей · можно утвердить карту`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось исправить превью под производство";
      setAiError(message);
      notify(message);
    } finally {
      setIsGeneratingAi(false);
      setIsProcessing(false);
      setProcessingStage("");
      setProcessingProgress(0);
    }
  }

  function approveProductionMap() {
    if (!activeProject.productionPreviewUrl || !activeProject.productionSchemeUrl || !activeProject.productionSvgUrl || !activeProject.productionPdfUrl) return;
    const updated: Project = {
      ...activeProject,
      approvedPreviewUrl: activeProject.productionPreviewUrl,
      previewUrl: activeProject.productionPreviewUrl,
      schemeUrl: activeProject.productionSchemeUrl,
      svgUrl: activeProject.productionSvgUrl,
      pdfUrl: activeProject.productionPdfUrl,
      status: "Готов",
      updated: "Контрольная карта зафиксирована",
    };
    setShowAiDraft(false);
    setActiveProject(updated);
    setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    notify(`Зафиксировано: ${activeProject.checkpointId || "единая карта"} · SVG и PDF готовы`);
  }

  async function generateFreeProductionMap() {
    if (!activeProject.sourceUrl) { uploadRef.current?.click(); return; }
    setIsProcessing(true);
    setProductionError("");
    setProcessingStage("Создаём локальную карту…");
    setProcessingProgress(2);
    const processing = { ...activeProject, status: "В обработке" as ProjectStatus };
    setActiveProject(processing);
    setProjects((items) => items.map((item) => item.id === processing.id ? processing : item));
    try {
      const result = await processPaintImage(
        activeProject.sourceUrl,
        palette,
        Math.min(colorCount, palette.length),
        "source",
        {
          onProgress: (stage, progress) => {
            setProcessingStage(stage);
            setProcessingProgress(progress);
          },
        },
      );
      const updated: Project = {
        ...activeProject,
        aiPreviewUrl: undefined,
        aiPalette: undefined,
        productionPreviewUrl: result.preview,
        productionSchemeUrl: result.scheme,
        productionSvgUrl: result.svg,
        productionPdfUrl: result.pdf,
        approvedPreviewUrl: undefined,
        colors: result.usedColors.length,
        previewUrl: result.preview,
        schemeUrl: undefined,
        svgUrl: undefined,
        pdfUrl: undefined,
        checkpointId: result.checkpointId,
        usedColorIds: result.usedColors.map((paint) => paint.id),
        usedPaints: result.usedColors,
        regionCount: result.regionCount,
        numberCount: result.numberCount,
        removedAreas: result.removedAreas,
        unlabeledRegionCount: result.unlabeledRegionCount,
        stackedNumberCount: result.stackedNumberCount,
        minimumRegionArea: result.minimumRegionArea,
        status: "Нужны правки",
        updated: "Бесплатная карта на проверке",
      };
      setActiveProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
      setShowAiDraft(false);
      notify(`Бесплатная карта готова: ${result.usedColors.length} цветов · API $0`);
    } catch (error) {
      const failed = { ...activeProject, status: "Черновик" as ProjectStatus };
      setActiveProject(failed);
      setProjects((items) => items.map((item) => item.id === failed.id ? failed : item));
      const message = error instanceof Error ? error.message : "Не удалось создать бесплатную производственную карту";
      setProductionError(message);
      notify(message);
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
      setProcessingProgress(0);
    }
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "Новый сюжет");
    const article = String(data.get("article") || `NEW-${projects.length + 181}`);
    const file = data.get("image");
    if (file instanceof File && file.size > MAX_SOURCE_BYTES) {
      notify("Файл больше 25 МБ — выберите изображение меньшего размера");
      return;
    }
    const project: Project = {
      id: Date.now(), title, article, status: "Черновик", colors: colorCount,
      updated: "Только что", accent: "scene-new",
      sourceUrl: file instanceof File && file.size ? URL.createObjectURL(file) : undefined,
    };
    sourceFileRef.current = file instanceof File && file.size ? file : null;
    aiSourceFileRef.current = null;
    aiSourceQualityRef.current = null;
    setProjects((items) => [project, ...items]);
    setActiveProject(project);
    setNewProjectOpen(false);
    setSection("editor");
    void fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, article, colorCount, paletteId: "palette_hobruk_v1" }),
    });
    notify("Проект создан");
  }

  function createColor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const color = {
      id: Date.now(), code: String(data.get("code") || `H${palette.length + 181}`),
      name: String(data.get("name") || "Новый цвет"), hex: String(data.get("hex") || "#E75D4E"),
    };
    setPalette((items) => [...items, color]);
    void fetch("/api/palettes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paletteId: "palette_hobruk_v1", code: color.code, name: color.name, hex: color.hex, sortOrder: palette.length }),
    });
    setNewColorOpen(false);
    notify("Цвет добавлен в палитру");
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const kind = String(data.get("kind")) as TemplateKind;
    const name = String(data.get("name") || "Новый шаблон");
    const widthMm = Math.max(10, Number(data.get("widthMm") || (kind === "canvas" ? 475 : 90)));
    const heightMm = Math.max(10, Number(data.get("heightMm") || (kind === "canvas" ? 575 : 120)));
    const elements = data.getAll("elements").map(String);
    const file = data.get("file");
    let fileKey: string | undefined;
    let fileName: string | undefined;

    if (file instanceof File && file.size) {
      fileName = file.name;
      const upload = new FormData();
      upload.set("file", file);
      try {
        const response = await fetch("/api/template-files", { method: "POST", body: upload });
        if (response.ok) fileKey = ((await response.json()) as { key: string }).key;
      } catch { /* Keep the local draft when storage is temporarily unavailable. */ }
    }

    const template: ProductionTemplate = {
      id: crypto.randomUUID(), name, kind, widthMm, heightMm, version: 1,
      isDefault: templates.every((item) => item.kind !== kind), fileName,
      updated: "Только что", elements,
    };
    setTemplates((items) => [template, ...items]);
    setActiveTemplate(template);
    setTemplateKind(kind);
    setNewTemplateOpen(false);
    void fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...template, fileKey }),
    }).then(async (response) => {
      if (!response.ok) return;
      const saved = ((await response.json()) as { template: ProductionTemplate }).template;
      setTemplates((items) => items.map((item) => item.id === template.id ? saved : item));
      setActiveTemplate(saved);
    }).catch(() => undefined);
    notify("Шаблон добавлен");
  }

  function makeDefaultTemplate(template: ProductionTemplate) {
    setTemplates((items) => items.map((item) => ({ ...item, isDefault: item.kind === template.kind ? item.id === template.id : item.isDefault })));
    setActiveTemplate({ ...template, isDefault: true });
    void fetch("/api/templates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: template.id, isDefault: true }),
    });
    notify("Основной шаблон изменён");
  }

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setSection("projects")} aria-label="Hobruk Paint Studio">
          <span className="brand-mark"><i/><i/><i/><i/></span>
          <span><b>Hobruk</b><small>Paint Studio</small></span>
        </button>
        <nav className="nav-list" aria-label="Основная навигация">
          <p>Рабочее пространство</p>
          {nav.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
              <Icon name={item.icon}/><span>{item.label}</span>{item.id === "projects" && <em>{projects.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-usage">
          <div><span>Лимит августа</span><strong>18 / 50</strong></div>
          <div className="usage-track"><i style={{ width: "36%" }}/></div>
          <small>32 сюжета доступно</small>
        </div>
        <div className="user-card"><span className="avatar">АО</span><span><b>{viewer.name.split(" ")[0]}</b><small>Администратор</small></span><Icon name="more" size={18}/></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <label className="search-box"><Icon name="search" size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти сюжет или артикул"/></label>
          <div className="top-actions"><button className="icon-button" aria-label="Уведомления"><Icon name="bell"/></button><button className="primary" onClick={() => setNewProjectOpen(true)}><Icon name="plus" size={18}/>Новый сюжет</button></div>
        </header>

        {section === "projects" && (
          <div className="page-content">
            <div className="page-heading"><div><p className="eyebrow">Производство · Август 2026</p><h1>Сюжеты</h1><p>Создавайте и доводите картины до готовых производственных файлов.</p></div><div className="heading-stat"><span>Готовность</span><b>76%</b><small>+8% за неделю</small></div></div>
            <section className="metrics">
              <article><span className="metric-icon coral"><Icon name="grid"/></span><div><small>Всего сюжетов</small><b>{projects.length}</b><p>4 добавлено за неделю</p></div></article>
              <article><span className="metric-icon blue"><Icon name="spark"/></span><div><small>Готовы к печати</small><b>{projects.filter((p) => p.status === "Готов").length}</b><p>SVG и PDF сформированы</p></div></article>
              <article><span className="metric-icon amber"><Icon name="comment"/></span><div><small>Ожидают правок</small><b>{projects.filter((p) => p.status === "Нужны правки").length}</b><p>Есть новые комментарии</p></div></article>
            </section>
            <div className="section-head"><div><h2>Последние проекты</h2><span>{filteredProjects.length} сюжета</span></div><button className="text-button">Все проекты <Icon name="arrow" size={16}/></button></div>
            <section className="project-grid">
              {filteredProjects.map((project) => (
                <article className="project-card" key={project.id} onClick={() => openEditor(project)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && openEditor(project)}>
                  <div className={`project-thumb ${project.accent}`} style={project.sourceUrl ? { backgroundImage: `url(${project.sourceUrl})` } : undefined}>
                    <span className={statusClass(project.status)}>{project.status}</span><button aria-label="Меню проекта" onClick={(event) => event.stopPropagation()}><Icon name="more" size={18}/></button><div className="contour-overlay"/>
                  </div>
                  <div className="project-info"><div><h3>{project.title}</h3><span>{project.article}</span></div><dl><div><dt>Цветов</dt><dd>{project.colors}</dd></div><div><dt>Формат</dt><dd>40×50</dd></div></dl><footer><span>{project.updated}</span><span className="open-project">Открыть <Icon name="arrow" size={14}/></span></footer></div>
                </article>
              ))}
              <button className="new-project-card" onClick={() => setNewProjectOpen(true)}><span><Icon name="plus" size={26}/></span><b>Создать новый сюжет</b><small>Загрузите фотографию или изображение</small></button>
            </section>
          </div>
        )}

        {section === "editor" && (
          <div className="editor-page">
            <div className="editor-toolbar">
              <div><button className="back-button" onClick={() => setSection("projects")}>←</button><span><small>{activeProject.article}</small><b>{activeProject.title}</b></span><span className={statusClass(activeProject.status)}>{activeProject.status}</span></div>
              <div>{activeProject.approvedPreviewUrl ? <div className="approved-color-count"><small>Карта зафиксирована</small><b>{activeProject.colors} цветов</b></div> : <label className="color-control">Цветов <b>{aiColorCount}</b><input type="range" min="24" max="60" value={aiColorCount} onChange={(event) => setAiColorCount(Number(event.target.value))}/></label>}{activeProject.sourceUrl && !activeProject.aiPreviewUrl && !hasProductionMap && !activeProject.approvedPreviewUrl && <button className="secondary free-mode-button" disabled={isProcessing || isGeneratingAi} onClick={generateFreeProductionMap}><Icon name="palette" size={17}/>Без ИИ · $0</button>}<button className="secondary" disabled={isProcessing || isGeneratingAi} onClick={() => approvedPreviewRef.current?.click()}><Icon name="upload" size={17}/>Готовое превью</button><button className="secondary correction-button" disabled={isProcessing || isGeneratingAi} onClick={() => setAiSettingsOpen(true)}><Icon name="comment" size={17}/>ИИ-настройки</button>{activeProject.aiPreviewUrl && !activeProject.approvedPreviewUrl && <button className="secondary detail-editor-button" disabled={isProcessing || isGeneratingAi} onClick={openDetailEditor}><Icon name="edit" size={17}/>Детали{activeProject.semanticRegions?.length ? ` · ${activeProject.semanticRegions.length}` : ""}</button>}<button className="primary" disabled={isProcessing || isGeneratingAi || Boolean(activeProject.approvedPreviewUrl)} onClick={hasProductionMap ? approveProductionMap : activeProject.aiPreviewUrl ? prepareProductionMap : generateIntelligentPreview}><Icon name={hasProductionMap ? "check" : "spark"} size={17}/>{isProcessing ? `Фиксируем карту · ${processingProgress}%` : isGeneratingAi ? "ИИ создаёт карту…" : activeProject.approvedPreviewUrl ? "Карта и контуры готовы" : hasProductionMap ? "Утвердить карту и контуры" : activeProject.aiPreviewUrl ? "Зафиксировать готовое превью" : "Создать единую ИИ-карту"}</button></div>
            </div>
            <div className="editor-main">
              <section className="canvas-area">
                <div className={`workflow-note ${workflowError ? "error" : isProcessing ? "processing" : activeProject.approvedPreviewUrl ? "approved" : hasProductionMap ? "production-review" : activeProject.aiPreviewUrl ? "ai-review" : "draft"}`}><span>{productionError ? "Ошибка карты" : aiError ? "Ошибка ИИ" : isProcessing ? `Расчёт ${processingProgress}%` : activeProject.approvedPreviewUrl ? "Контрольная точка зафиксирована" : hasProductionMap ? "Единая производственная карта на проверке" : activeProject.aiPreviewUrl ? "Готовое превью" : "Выберите способ создания"}</span><p>{workflowError || (isProcessing ? processingStage || "Фиксируем единую производственную карту…" : activeProject.approvedPreviewUrl ? `Превью, SVG и PDF сохранены из одной неизменяемой карты ${activeProject.checkpointId || "областей"}. PNG контуров — только экранный просмотр.` : hasProductionMap ? `Это уже точная карта областей для будущих SVG и PDF. Глаза, текст и логотипы сохранены отдельным source-first слоем; основная карта проверена цифрами не меньше 5 pt.` : activeProject.aiPreviewUrl ? `Приложение автоматически найдёт важные детали. Кнопка «Детали» позволяет проверить и поправить их до утверждения.` : aiConfigured === false ? "Можно создать карту полностью локально за $0 или подключить OPENAI_API_KEY для более качественной единой карты." : `ИИ создаёт детальную карту с лицами и надписями; локальный этап только убирает цветовой шум, проверяет 5 pt и строит SVG/PDF.`)}</p>{isProcessing && <i className="workflow-progress" style={{ width: `${processingProgress}%` }}/>}</div>
                {activeProject.productionReadiness?.status === "FAIL" && activeProject.productionFailureOverlayUrl && (
                  <section className="readiness-failure" aria-label="Production readiness FAIL">
                    <img src={activeProject.productionFailureOverlayUrl} alt="Диагностический overlay областей, не вместивших номер 5 pt"/>
                    <div>
                      <header><b>{activeProject.productionReadiness.regionCount} regions</b><strong>FAIL</strong></header>
                      <dl>
                        <div><dt>Coverage</dt><dd>{activeProject.productionReadiness.fitCoverage.toFixed(2)}%</dd></div>
                        <div><dt>Failed area</dt><dd>{activeProject.productionReadiness.failedAreaPercent.toFixed(3)}%</dd></div>
                        <div><dt>Semantic FAIL</dt><dd>{activeProject.semanticFailCount || 0}</dd></div>
                        <div><dt>Nonsemantic FAIL</dt><dd>{activeProject.nonSemanticFailCount || 0}</dd></div>
                      </dl>
                      <p><i className="semantic-key"/> semantic <i className="nonsemantic-key"/> nonsemantic</p>
                      <button className="primary" disabled={isProcessing || isGeneratingAi || aiConfigured === false} onClick={correctPreviewForProduction}><Icon name="spark" size={16}/>{isGeneratingAi ? "Исправляем…" : "Исправить превью под производство"}</button>
                    </div>
                  </section>
                )}
                <div className="api-cost-bar"><div><small>API по этому сюжету</small><b>${(activeProject.aiCostUsd || 0).toFixed(3)}</b></div><div><small>Генераций изображения</small><b>{activeProject.aiGenerationCount || 0}</b></div><div><small>Последняя API-операция</small><b>{activeProject.lastAiCostUsd ? `$${activeProject.lastAiCostUsd.toFixed(3)}` : "$0"}</b></div><p>API создаёт изображение и один раз распознаёт важные зоны. Палитра, области, контуры, цифры, SVG и PDF затем строятся локально за $0.{activeProject.productionCorrectionStrategy && <> Стратегия correction: <b>{activeProject.productionCorrectionStrategy}</b>.</>}</p></div>
                <div className="canvas-tabs"><button className="active">Три вида</button><button>Превью</button><button>Схема</button><span>{activeProject.regionCount ? `${activeProject.regionCount} областей · ${activeProject.numberCount} номеров` : "LAB-подбор · границы деталей"}</span></div>
                <div className="canvas-grid">
                  <figure><figcaption><span>01</span> Оригинал</figcaption><div className="artboard source-board">{activeProject.sourceUrl ? <img src={activeProject.sourceUrl} alt="Загруженный оригинал"/> : <button onClick={() => uploadRef.current?.click()}><Icon name="upload" size={28}/><b>Загрузить изображение</b><small>JPG или PNG до 25 МБ · оптимизируется автоматически</small></button>}</div></figure>
                  <figure><figcaption><span>02</span> {activeProject.approvedPreviewUrl ? "Утверждённая единая карта" : hasProductionMap ? "Единая карта на проверке" : activeProject.aiPreviewUrl ? "Готовое превью" : "Цветная карта"}</figcaption><div className="artboard preview-board">{displayedPreviewUrl ? <img src={displayedPreviewUrl} alt="Единая производственная цветная карта"/> : <button className="empty-result result-upload" onClick={generateIntelligentPreview}><Icon name="spark" size={26}/><b>Создать единую ИИ-карту</b><small>Или используйте бесплатный локальный режим в верхней панели</small></button>}</div></figure>
                  <figure><figcaption><span>03</span> Контурная схема</figcaption><div className="artboard scheme-board">{activeProject.schemeUrl ? <img src={activeProject.schemeUrl} alt="Контурная схема из зафиксированной карты"/> : hasProductionMap ? <div className="empty-result checkpoint-ready"><span className="number-dot">✓</span><b>Контуры рассчитаны из этой карты</b><small>Утвердите производственное превью — схема откроется без повторной трассировки</small></div> : <div className="empty-result"><span className="number-dot">12</span><b>Схема появится здесь</b><small>Сначала создайте единую производственную карту</small></div>}</div></figure>
                </div>
                <input ref={uploadRef} className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && loadImage(event.target.files[0])}/>
                <input ref={approvedPreviewRef} className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files?.[0] && loadApprovedPreview(event.target.files[0])}/>
              </section>
              <aside className="editor-panel">
                <div className="panel-head"><div><h3>Палитра Hobruk</h3><span>{activeProject.approvedPreviewUrl && !activeProject.usedPaints?.length && !activeProject.usedColorIds?.length ? `${activeProject.colors} цветов в утверждённом превью` : `${activePaints.length} из ${palette.length} производственных цветов выбрано по изображению`}</span></div><button onClick={() => setSection("palettes")}><Icon name="edit" size={16}/></button></div>
                <div className="swatch-list">{activePaints.map((paint, index) => <button key={paint.id} title={paint.name}><i style={{ background: paint.hex }}/><span><b>{index + 1}</b><small>{paint.code}</small></span></button>)}</div>
                <div className="panel-divider"/>
                <div className="checklist"><h4>Проверка контрольной карты</h4><p className={hasProductionMap || Boolean(activeProject.approvedPreviewUrl) ? "done" : ""}><span><Icon name={hasProductionMap || activeProject.approvedPreviewUrl ? "check" : "meter"} size={14}/></span>Полное производственное разрешение до 1600 px</p><p className={(hasProductionMap || activeProject.schemeUrl) && activeProject.unlabeledRegionCount === 0 ? "done" : ""}><span><Icon name={(hasProductionMap || activeProject.schemeUrl) && activeProject.unlabeledRegionCount === 0 ? "check" : "meter"} size={14}/></span>{hasProductionMap || activeProject.schemeUrl ? `Без цифры: ${activeProject.unlabeledRegionCount || 0} областей` : "Проверка всех областей и цифр"}</p><p className={hasProductionMap || Boolean(activeProject.schemeUrl) ? "done" : ""}><span><Icon name={hasProductionMap || activeProject.schemeUrl ? "check" : "meter"} size={14}/></span>{hasProductionMap || activeProject.schemeUrl ? `Цифры строго 5–8 pt · вертикальных: ${activeProject.stackedNumberCount || 0}` : "Цифры 5–8 pt, поворот и вертикальная запись"}</p><p className={hasProductionMap || Boolean(activeProject.schemeUrl) ? "done" : ""}><span><Icon name={hasProductionMap || activeProject.schemeUrl ? "check" : "meter"} size={14}/></span>Лица, глаза, надписи и логотипы входят в эту же карту</p><p className={hasProductionMap || Boolean(activeProject.schemeUrl) ? "done" : ""}><span><Icon name={hasProductionMap || activeProject.schemeUrl ? "check" : "meter"} size={14}/></span>{hasProductionMap || activeProject.schemeUrl ? `Непоместившихся микрозон объединено: ${activeProject.removedAreas || 0}` : "Только микрозоны без места для 5 pt объединяются"}</p><p className={Boolean(activeProject.checkpointId) ? "done" : ""}><span><Icon name={activeProject.checkpointId ? "check" : "meter"} size={14}/></span>{activeProject.checkpointId || "Единый checkpoint для превью, SVG и PDF"}</p></div>
                <div className="export-actions"><button className="export-button" disabled={!activeProject.approvedPreviewUrl || !activeProject.svgUrl} onClick={() => downloadProduction("svg")}><Icon name="download" size={18}/>Скачать SVG</button><button className="export-button" disabled={!activeProject.approvedPreviewUrl || !activeProject.pdfUrl} onClick={() => downloadProduction("pdf")}><Icon name="download" size={18}/>Скачать PDF</button></div>
              </aside>
            </div>
          </div>
        )}

        {section === "palettes" && (
          <div className="page-content">
            <div className="page-heading compact"><div><p className="eyebrow">Цветовая система</p><h1>Палитры</h1><p>Все проекты используют только фактически доступные производственные краски.</p></div><button className="primary" onClick={() => setNewColorOpen(true)}><Icon name="plus" size={18}/>Добавить цвет</button></div>
            <div className="palette-summary"><div className="palette-fan">{palette.slice(0, 8).map((paint, index) => <i key={paint.id} style={{ background: paint.hex, transform: `rotate(${index * 4 - 14}deg)` }}/>)}</div><div><span>Основная палитра</span><h2>Hobruk Production</h2><p>Версия 4 · обновлена сегодня</p></div><dl><div><dt>Цветов</dt><dd>{palette.length}</dd></div><div><dt>В проектах</dt><dd>{projects.length}</dd></div></dl></div>
            <section className="palette-table"><header><span>Цвет</span><span>Код</span><span>Название</span><span>HEX</span><span>Использование</span><span/></header>{palette.map((paint, index) => <div key={paint.id}><span><i style={{ background: paint.hex }}/><b>{index + 1}</b></span><strong>{paint.code}</strong><span>{paint.name}</span><code>{paint.hex.toUpperCase()}</code><span>{Math.max(1, (paint.id * 7) % 24)} сюжетов</span><button aria-label={`Удалить ${paint.name}`} onClick={() => { setPalette((items) => items.filter((item) => item.id !== paint.id)); notify("Цвет удалён"); }}><Icon name="trash" size={16}/></button></div>)}</section>
          </div>
        )}

        {section === "templates" && (
          <div className="page-content">
            <div className="page-heading compact">
              <div><p className="eyebrow">Производственные макеты</p><h1>Шаблоны</h1><p>Холсты и стикеры с динамическими артикулами, QR-кодами и другими переменными полями.</p></div>
              <button className="primary" onClick={() => setNewTemplateOpen(true)}><Icon name="plus" size={18}/>Добавить шаблон</button>
            </div>
            <div className="template-tabs">
              {([ ["all", "Все"], ["canvas", "Холсты"], ["sticker", "Стикеры"] ] as const).map(([id, label]) => <button key={id} className={templateKind === id ? "active" : ""} onClick={() => setTemplateKind(id)}>{label}<span>{id === "all" ? templates.length : templates.filter((item) => item.kind === id).length}</span></button>)}
            </div>
            <div className="templates-layout">
              <section className="template-grid">
                {templates.filter((item) => templateKind === "all" || item.kind === templateKind).map((template) => (
                  <article key={template.id} className={`template-card ${activeTemplate.id === template.id ? "selected" : ""}`} onClick={() => setActiveTemplate(template)}>
                    <div className="template-preview"><TemplatePreview template={template}/>{template.isDefault && <span className="default-badge"><Icon name="check" size={11}/>Основной</span>}</div>
                    <div className="template-card-info"><div><span>{template.kind === "canvas" ? "Холст" : "Стикер"} · версия {template.version}</span><h3>{template.name}</h3><p>{template.widthMm} × {template.heightMm} мм · {template.elements.length} элементов</p></div><button aria-label="Меню шаблона"><Icon name="more" size={18}/></button></div>
                  </article>
                ))}
                <button className="new-template-card" onClick={() => setNewTemplateOpen(true)}><span><Icon name="plus" size={24}/></span><b>Загрузить свой шаблон</b><small>SVG, PDF, PNG или JPG</small></button>
              </section>
              <aside className="template-inspector">
                <header><div><p>{activeTemplate.kind === "canvas" ? "Шаблон холста" : "Шаблон стикера"}</p><h2>{activeTemplate.name}</h2></div><span>v{activeTemplate.version}</span></header>
                <div className="template-large-preview"><TemplatePreview template={activeTemplate} large/></div>
                <div className="template-specs"><div><span>Размер</span><b>{activeTemplate.widthMm} × {activeTemplate.heightMm} мм</b></div><div><span>Файл основы</span><b>{activeTemplate.fileName ?? "Встроенный макет"}</b></div></div>
                <div className="layer-list"><div className="layer-title"><h3>Переменные элементы</h3><button onClick={() => setNewTemplateOpen(true)}><Icon name="plus" size={14}/>Добавить</button></div>{activeTemplate.elements.map((element, index) => <div key={`${element}-${index}`}><span className={element.startsWith("QR") ? "layer-icon qr" : "layer-icon"}>{element.startsWith("QR") ? "QR" : "Aa"}</span><span><b>{element}</b><small>{element.startsWith("QR") ? `{{${element.toLowerCase().replaceAll(" ", "_")}}}` : "Заполняется из проекта"}</small></span><Icon name="more" size={16}/></div>)}</div>
                {!activeTemplate.isDefault && <button className="secondary template-default" onClick={() => makeDefaultTemplate(activeTemplate)}><Icon name="check" size={16}/>Сделать основным</button>}
              </aside>
            </div>
          </div>
        )}

        {section === "makers" && (
          <div className="page-content">
            <div className="page-heading compact"><div><p className="eyebrow">Доступ к платформе</p><h1>Производители</h1><p>Выдавайте доступ, назначайте роли и контролируйте расход сюжетов.</p></div><button className="primary" onClick={() => notify("Приглашение подготовлено")}><Icon name="plus" size={18}/>Пригласить</button></div>
            <section className="maker-grid">{manufacturers.map((maker) => <article key={maker.name}><header><span style={{ background: maker.color }}>{maker.name.slice(0, 2).toUpperCase()}</span><button><Icon name="more" size={18}/></button></header><h2>{maker.name}</h2><p>{maker.plan} · {maker.people} пользователя</p><div className="maker-limit"><div><span>Использовано</span><b>{maker.used} из {maker.total === 999 ? "∞" : maker.total}</b></div><div className="usage-track"><i style={{ width: `${Math.min(100, maker.used / maker.total * 100)}%`, background: maker.color }}/></div></div><footer><span className="online-dot"/> Активен <button onClick={() => notify(`Добавлено 10 сюжетов для ${maker.name}`)}>+10 сюжетов</button></footer></article>)}</section>
          </div>
        )}

        {section === "limits" && (
          <div className="page-content">
            <div className="page-heading compact"><div><p className="eyebrow">Учёт использования</p><h1>Лимиты и списания</h1><p>Сюжет списывается только при первом производственном экспорте.</p></div></div>
            <section className="limit-banner"><div><span>Остаток общего лимита</span><b>32</b><small>сюжета до 31 августа</small></div><div className="ring" style={{ "--value": "36%" } as CSSProperties}><span>36%</span></div><dl><div><dt>Начислено</dt><dd>50</dd></div><div><dt>Списано</dt><dd>18</dd></div><div><dt>Возвращено</dt><dd>2</dd></div></dl></section>
            <section className="ledger"><header><span>Дата</span><span>Производитель</span><span>Операция</span><span>Проект</span><span>Изменение</span></header>{[
              ["25 авг, 17:42", "Hobruk", "Производственный экспорт", "NEW-184", "−1"],
              ["25 авг, 14:18", "Bright Color", "Производственный экспорт", "BC-442", "−1"],
              ["24 авг, 18:03", "АртФабрика", "Возврат после ошибки", "AF-091", "+1"],
              ["23 авг, 11:25", "Bright Color", "Пополнение пакета", "—", "+20"],
            ].map((row) => <div key={row.join()}>{row.map((cell, index) => <span key={index} className={index === 4 ? (cell.startsWith("+") ? "positive" : "negative") : ""}>{cell}</span>)}</div>)}</section>
          </div>
        )}
      </main>

      {newProjectOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="new-project-title"><form className="modal" onSubmit={createProject}><header><div><p className="eyebrow">Новый проект</p><h2 id="new-project-title">Создать сюжет</h2></div><button type="button" onClick={() => setNewProjectOpen(false)}><Icon name="close"/></button></header><label>Название<input name="title" required placeholder="Например, Кот среди цветов" autoFocus/></label><label>Артикул<input name="article" placeholder="NEW-185"/></label><label className="file-drop"><Icon name="upload" size={26}/><b>Выберите исходное изображение</b><small>JPG или PNG до 25 МБ · приложение подготовит копию само</small><input name="image" type="file" accept="image/png,image/jpeg"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setNewProjectOpen(false)}>Отмена</button><button className="primary">Создать проект</button></div></form></div>}
      {newColorOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="new-color-title"><form className="modal small" onSubmit={createColor}><header><div><p className="eyebrow">Палитра Hobruk</p><h2 id="new-color-title">Добавить цвет</h2></div><button type="button" onClick={() => setNewColorOpen(false)}><Icon name="close"/></button></header><label>Код краски<input name="code" required placeholder="H181"/></label><label>Название<input name="name" required placeholder="Красный тёплый"/></label><label>Цвет<input className="color-input" name="hex" type="color" defaultValue="#E75D4E"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setNewColorOpen(false)}>Отмена</button><button className="primary">Добавить</button></div></form></div>}
      {newTemplateOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="new-template-title"><form className="modal template-modal" onSubmit={createTemplate}><header><div><p className="eyebrow">Производственный макет</p><h2 id="new-template-title">Добавить шаблон</h2></div><button type="button" onClick={() => setNewTemplateOpen(false)}><Icon name="close"/></button></header><div className="field-row"><label>Тип<select name="kind" defaultValue="canvas"><option value="canvas">Холст</option><option value="sticker">Стикер</option></select></label><label>Название<input name="name" required placeholder="Холст 40×50 OEM" autoFocus/></label></div><div className="field-row sizes"><label>Ширина, мм<input name="widthMm" type="number" min="10" defaultValue="475"/></label><label>Высота, мм<input name="heightMm" type="number" min="10" defaultValue="575"/></label></div><label className="file-drop"><Icon name="upload" size={25}/><b>Загрузить основу шаблона</b><small>SVG, PDF, PNG или JPG до 25 МБ</small><input name="file" type="file" accept="image/svg+xml,application/pdf,image/png,image/jpeg"/></label><fieldset className="element-picker"><legend>Переменные элементы</legend>{["Артикул","Логотип производителя","QR контрольного листа","QR инструкции","QR сборки","Штрихкод","Номер партии","Количество цветов","Превью","Техническая рамка"].map((element) => <label key={element}><input name="elements" type="checkbox" value={element} defaultChecked={["Артикул","QR контрольного листа","Техническая рамка"].includes(element)}/><span><i><Icon name="check" size={12}/></i>{element}</span></label>)}</fieldset><p className="template-help">Каждый QR-код будет получать своё значение из проекта. Например, ссылка на контрольный лист и ссылка на инструкцию могут отличаться.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setNewTemplateOpen(false)}>Отмена</button><button className="primary">Сохранить шаблон</button></div></form></div>}
      {detailEditorOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="detail-editor-title"><div className="modal detail-editor-modal"><header><div><p className="eyebrow">Source-first</p><h2 id="detail-editor-title">Защищённые детали</h2></div><button type="button" onClick={() => setDetailEditorOpen(false)}><Icon name="close"/></button></header><div className="detail-editor-toolbar"><label>Новая область<select value={detailKind} onChange={(event) => setDetailKind(event.target.value as SemanticRegion["kind"])}>{(["key-detail","eye","text","logo","face","hand"] as const).map((kind) => <option key={kind} value={kind}>{detailKindLabels[kind]}</option>)}</select></label><p>Выберите тип и обведите деталь мышью или пальцем. Красные рамки сохраняются из утверждённого превью отдельным точным слоем.</p></div><div className="detail-editor-layout"><div className="detail-editor-canvas" onPointerDown={beginDetailSelection} onPointerMove={moveDetailSelection} onPointerUp={finishDetailSelection}>{activeProject.aiPreviewUrl && <img src={activeProject.aiPreviewUrl} alt="Превью для разметки деталей" draggable={false}/>} {detailEditorRegions.map((region, index) => <span key={`${region.kind}-${index}`} className={`detail-box detail-${region.kind}`} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}><b>{index + 1}</b></span>)}{detailDraftRect && <span className="detail-box draft" style={{ left: `${detailDraftRect.x * 100}%`, top: `${detailDraftRect.y * 100}%`, width: `${detailDraftRect.width * 100}%`, height: `${detailDraftRect.height * 100}%` }}/>} {detailEditorLoading && <div className="detail-loading">ИИ находит глаза, текст и логотипы…</div>}</div><aside className="detail-region-list"><h3>Области · {detailEditorRegions.length}</h3>{detailEditorRegions.length ? detailEditorRegions.map((region, index) => <div key={`${region.label}-${index}`}><span><b>{index + 1}. {detailKindLabels[region.kind]}</b><small>{region.label}</small></span><button type="button" aria-label={`Удалить область ${index + 1}`} onClick={() => setDetailEditorRegions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Icon name="trash" size={15}/></button></div>) : <p>Области ещё не найдены. Можно обвести их вручную прямо на изображении.</p>}</aside></div><p className="detail-editor-help">Мелкие детали не получают цифры меньше 5 pt. Под ними остаётся пронумерованная базовая область, а точные линии входят в отдельную группу SVG/PDF.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setDetailEditorOpen(false)}>Отмена</button><button type="button" className="primary" disabled={detailEditorLoading || !detailEditorRegions.length} onClick={saveDetailRegions}>Сохранить детали</button></div></div></div>}
      {aiSettingsOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title"><div className="modal ai-settings-modal"><header><div><p className="eyebrow">Интеллектуальное создание</p><h2 id="ai-settings-title">Настройки единой ИИ-карты</h2></div><button type="button" onClick={() => setAiSettingsOpen(false)}><Icon name="close"/></button></header><div className={`ai-status ${aiConfigured === false ? "offline" : ""}`}><span><Icon name={aiConfigured === false ? "meter" : "check"} size={15}/></span><div><b>{aiConfigured === false ? "Нужно подключить модуль" : aiConfigured === null ? "Проверяем подключение…" : "GPT Image 2 подключён"}</b><small>{aiConfigured === false ? "Добавьте OPENAI_API_KEY в секреты приложения — не вставляйте ключ в чат." : "Ключ хранится только на сервере и не попадает в браузер."}</small></div></div><div className="ai-settings-grid"><label>Тип сюжета<select value={aiProfile} onChange={(event) => setAiProfile(event.target.value)}><option value="auto">Определить автоматически</option><option value="portrait">Портрет / люди</option><option value="animal">Животное</option><option value="landscape">Пейзаж</option></select></label><label>Режим детализации<select value={aiQuality} onChange={(event) => setAiQuality(event.target.value as "medium" | "high")}><option value="high">Точный · лица и сложные детали · $0.18–0.22</option><option value="medium">Экономичный · простые сюжеты · $0.05–0.08</option></select></label></div><label className="ai-range">Количество цветов <b>{aiColorCount}</b><input type="range" min="24" max="60" value={aiColorCount} onChange={(event) => setAiColorCount(Number(event.target.value))}/><small>Для лиц и сложных животных обычно лучше 40–50 цветов.</small></label><label>Правка к результату<textarea value={aiCorrection} onChange={(event) => setAiCorrection(event.target.value)} placeholder="Например: сохранить надпись на форме, платье сделать розовым, фон упростить сильнее…" rows={4}/></label><p className="ai-help"><b>Есть одна генерация изображения и короткая проверка важных зон.</b> Затем приложение фиксирует ту же карту для превью, SVG и PDF без повторной перерисовки. Каждая повторная ИИ-правка считается новой платной генерацией.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setAiSettingsOpen(false)}>Отмена</button><button type="button" className="primary" disabled={aiConfigured === false || isGeneratingAi} onClick={generateIntelligentPreview}><Icon name="spark" size={17}/>{isGeneratingAi ? "Создаём…" : activeProject.aiPreviewUrl || activeProject.approvedPreviewUrl ? "Создать новую карту" : "Создать единую ИИ-карту"}</button></div></div></div>}
      {toast && <div className="toast"><Icon name="check" size={16}/>{toast}</div>}
    </div>
  );
}
