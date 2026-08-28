import { env } from "cloudflare:workers";
import { ensureWorkspaceUser } from "../../../lib/tenant";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageResponse = {
  data?: Array<{ b64_json?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  };
  error?: { message?: string; code?: string };
};

type OpenAiImageOutcome = { response: Response; result: ImageResponse; streaming: boolean };

type PromptPaint = { code: string; name: string; hex: string };
type ProductionCorrectionStrategy = "global-rebuild" | "local-repair";
type ProductionReadinessDiagnostics = {
  regionCount: number;
  failCount: number;
  fitCoverage: number;
  failedAreaPercent: number;
  densityPer100Cm2: number;
  semanticFailCount: number;
  nonSemanticFailCount: number;
};

function isPromptPaint(value: unknown): value is PromptPaint {
  if (!value || typeof value !== "object") return false;
  const paint = value as Record<string, unknown>;
  return typeof paint.code === "string"
    && typeof paint.name === "string"
    && typeof paint.hex === "string"
    && /^#[0-9A-F]{6}$/i.test(paint.hex);
}

function parseProductionReadinessDiagnostics(value: FormDataEntryValue | null): ProductionReadinessDiagnostics | null {
  try {
    const parsed = JSON.parse(String(value || "")) as Record<string, unknown>;
    const keys = [
      "regionCount",
      "failCount",
      "fitCoverage",
      "failedAreaPercent",
      "densityPer100Cm2",
      "semanticFailCount",
      "nonSemanticFailCount",
    ] as const;
    if (keys.some((key) => typeof parsed[key] !== "number" || !Number.isFinite(parsed[key]))) return null;
    return Object.fromEntries(keys.map((key) => [key, parsed[key]])) as ProductionReadinessDiagnostics;
  } catch {
    return null;
  }
}

function friendlyOpenAiError(result: ImageResponse, status: number) {
  const message = result.error?.message || "Не удалось создать интеллектуальное превью.";
  if (/billing|credit|quota|limit reached/i.test(message)) {
    return "На аккаунте OpenAI API не настроена оплата или закончился доступный лимит.";
  }
  if (/verif/i.test(message)) {
    return "Для генерации изображений нужно подтвердить организацию в настройках OpenAI API.";
  }
  if (/invalid api key|incorrect api key|authentication/i.test(message) || status === 401) {
    return "OpenAI отклонил API-ключ. Создайте новый ключ и замените секрет OPENAI_API_KEY.";
  }
  return message;
}

function relayImageRequest(execute: () => Promise<OpenAiImageOutcome>) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": hobruk-connected\n\n"));
      heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": hobruk-heartbeat\n\n")); } catch { /* The client closed the stream. */ }
      }, 8_000);
      void (async () => {
        try {
          const { response, result, streaming } = await execute();
          if (streaming && response.body) {
            reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } else if (response.ok && result.data?.[0]?.b64_json) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "image_edit.completed",
              b64_json: result.data[0].b64_json,
              output_format: "png",
              usage: result.usage || null,
            })}\n\n`));
          } else {
            console.error("OpenAI image edit failed", JSON.stringify({
              status: response.status,
              requestId: response.headers.get("x-request-id"),
              code: result.error?.code || "image_generation_failed",
              message: result.error?.message || "non-json response",
            }));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "hobruk.error",
              error: friendlyOpenAiError(result, response.status),
              code: result.error?.code || "image_generation_failed",
              requestId: response.headers.get("x-request-id"),
            })}\n\n`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Поток OpenAI был прерван";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "hobruk.error", error: message })}\n\n`));
        } finally {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          controller.close();
        }
      })();
    },
    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      await reader?.cancel();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function buildPrompt(
  targetColors: number,
  profile: string,
  correction: string,
  palette: PromptPaint[],
  hasReference: boolean,
  mode: string,
  correctionStrategy?: ProductionCorrectionStrategy,
  readiness?: ProductionReadinessDiagnostics | null,
) {
  const subjectRules: Record<string, string> = {
    portrait: "Build the people first. Faces, identity, eyes, pupils, eyelids, eyebrows, nose planes, lips, ears, hairline, hands, fingers, clothing folds, jewelry and every recognizable accessory are protected details.",
    animal: "Build the animal first. Eyes, highlights, pupils, eyelids, nose, nostrils, mouth, ears, whisker roots, paws, claws and characteristic coat markings are protected details.",
    landscape: "Preserve the main architecture, windows, doors, signs, horizon, foreground objects and recognizable small silhouettes; simplify only random surface texture.",
    auto: "Detect every meaningful subject before simplifying anything. Protect faces, eyes, hands, animals, lettering, emblems, logos, signs, jewelry, accessories and every identity- or story-defining small object.",
  };
  const paletteList = palette.map((paint, index) => `${index + 1}. ${paint.code} · ${paint.name} · ${paint.hex}`).join("\n");

  if (mode === "production-correction" && correctionStrategy && readiness) {
    const inputLabels = correctionStrategy === "global-rebuild"
      ? hasReference
        ? `- Image 1 is the original source and is the primary identity, composition, pose and crop reference.
- Image 2 is the failed palette-ready preview. Use it only as a production-palette and broad layout reference; do not preserve its microgeometry.
- Image 3 is the diagnostic failure overlay. Use it only to understand the scale and location of failures; it must never appear in the result.`
        : `- Image 1 is the failed palette-ready preview. Use it as a production-palette and broad composition/layout reference; do not preserve its microgeometry.
- Image 2 is the diagnostic failure overlay. Use it only to understand the scale and location of failures; it must never appear in the result.`
      : `- Image 1 is the current failed palette-ready preview and is the primary edit target.
- Image 2 is the diagnostic failure overlay made from the exact failed 4-connected regions. Magenta marks semantic failures; orange marks nonsemantic failures. It is reference-only and must never appear in the result.
${hasReference ? "- Image 3 is the original source reference. Use it only to preserve identity, composition and meaningful details." : ""}`;
    const strategyRules = correctionStrategy === "global-rebuild"
      ? `GLOBAL REBUILD STRATEGY
- The current map is globally over-fragmented. Reconstruct the whole image into substantially larger coherent flat paint regions, especially across faces, eyes, hands, hair/fur and clothing.
- Prefer the original source for identity and composition when it is provided. The failed preview is not microgeometry that must be preserved.
- Preserve identity, pose, crop, silhouette, proportions and recognizable important details, while simplifying tonal modelling into broad contiguous shapes instead of texture or micro-shading.
- Substantially reduce connected-region density and microfragmentation across the full image. Do not invent a new numeric pass threshold.`
      : `LOCAL REPAIR STRATEGY
- Keep Image 1 as the primary edit target and preserve its already-good coherent regions.
- Rework highlighted FAIL zones only as much as needed to create larger coherent paintable shapes.
- Preserve composition, crop, identity, pose, proportions and all already-good major forms.`;
    return `
You are correcting an existing palette-ready paint-by-numbers preview for production.

INPUTS
${inputLabels}

CURRENT READINESS DIAGNOSTICS
- Regions: ${readiness.regionCount}
- FAIL regions: ${readiness.failCount}
- Fit coverage: ${readiness.fitCoverage.toFixed(2)}%
- Failed area: ${readiness.failedAreaPercent.toFixed(3)}%
- Region density: ${readiness.densityPer100Cm2.toFixed(2)} per 100 cm²
- Semantic FAIL: ${readiness.semanticFailCount}
- Nonsemantic FAIL: ${readiness.nonSemanticFailCount}

${strategyRules}

REQUIRED CORRECTION
- Merge unnecessary local tonal fragmentation into larger coherent paint regions.
- Face and skin: use broad planes; no stippling, freckles-as-dots, narrow tonal ribbons or crumb-like highlights.
- Eyes: preserve recognizable eye shape, pupil and highlight only when they can be coherent paintable regions; do not multiply tiny eyelid or highlight fragments.
- Hands and fingers: preserve readable structure with fewer wider regions, never many thin slivers.
- Hair and fur: preserve direction and characteristic markings with grouped strands and patches, never hundreds of tiny streaks.
- White clothing and light areas: avoid near-identical alternating microtones and isolated highlight islands.
- Bouquets, foliage and repeated texture: group small repeated elements into larger coherent clusters where visually acceptable.
- Total connected-region count must not increase as a way of adding detail. Never replace one failed semantic region with multiple smaller tonal fragments.
- No dots, crumbs, narrow rings, one-pixel or very-thin bands, checker-like palette alternation, dithering, gradients, noise, antialiasing or micro-islands.
- Every visible 4-connected paint region must physically fit one internal production number at 5 pt or larger.
- Use only exact solid colors from the selected production palette below. It is NOT necessary to use every listed color. Never create tiny regions merely to preserve a rarely used palette color.
- Do not add numbers, contours, leader lines, annotations, overlay colors or diagnostic marks.

SELECTED PRODUCTION PALETTE (${targetColors} colors)
${paletteList}

Return only the corrected full-frame color preview.`.trim();
  }

  return `
You are preparing a professional paint-by-numbers production preview for Hobruk.

INPUTS
- Image 1 is the source artwork. Preserve its exact composition, crop, pose, identity, proportions, camera angle and object placement.
${hasReference ? "- Image 2 is a style-only reference sheet of previously approved Hobruk previews. Do not copy any person, animal, object or composition from it." : "- Follow the Hobruk production rules below without introducing a new artistic style."}

REQUIRED RESULT
- Convert Image 1 into the FINAL immutable paint-by-numbers colour-region map, not a draft illustration. The application will trace this exact returned geometry into SVG/PDF; there is no later artistic redraw.
- This is a faithful structural transcription, not a new illustration. Do not delete, replace, invent or move any meaningful object, facial feature, marking, sign, logo or piece of lettering.
- Use only the ${targetColors} Hobruk production paints listed below. Do not invent intermediate shades or use colors outside this list.
- Every region must be filled with the exact solid RGB/HEX value of one listed paint. Reuse the same paint wherever the visual color is the same.
- The paint count is NOT the region count. Reuse the paints across hundreds or thousands of separate closed regions. Use the FT155 standard (about 930 coherent regions) for a calm people scene and allow FT154-level detail (about 2483 coherent regions) for genuinely dense texture. Never manufacture detail from random speckles.
- Use clean piecewise-constant, vector-like solid fills only: no gradients, no photographic noise, no paper or jersey texture, no brush grain, no stippling, no halftone, no dithering, no hatching, no semi-transparent pixels and no anti-aliased colour crumbs inside a region.
- Regions must be closed, contiguous and suitable for later vector tracing and numbering.
- Construct protected details before simplifying the background. Preserve meaningful thin details when they define a face, eye, hand, expression, logo, lettering, animal feature, product detail or object boundary.
- Preserve readable lettering and logo geometry as connected paint regions. Never turn lettering into an empty patch or an invented symbol. Simplify the surrounding colour plane when necessary so each meaningful letter stroke remains a clean paintable shape instead of being deleted.
- Keep at least several distinct color planes in each visible face; eyes, nose, mouth and face outline must remain separately recognizable at normal viewing size.
- Simplify random texture, grass noise, hair noise and background speckles into larger coherent shapes.
- Every small region must be a deliberate paintable shape, not a dot, crumb, ring, JPEG artifact or cluster of one-pixel islands. Build faces from coherent tonal planes, not stippling.
- Anticipate a minimum printed number size of 5 pt: retain narrow meaningful details, but make their paintable shapes wide enough for a 5 pt number by simplifying adjacent shading. Merge meaningless micro-texture before returning the image. Do not expect a later cleanup pass to rescue an eye, letter or logo.
- Keep smooth skies and walls relatively simple while keeping the main subject substantially more detailed.
- Do not add outlines, numbers, captions, frames, margins or new objects.
- Do not beautify or change a person's identity. Do not change clothing colors unless requested below.
- ${subjectRules[profile] || subjectRules.auto}

ALLOWED HOBRUK PRODUCTION PALETTE
${paletteList}

USER CORRECTION
${correction || "No additional correction. Preserve the source faithfully."}

FINAL SELF-CHECK BEFORE RETURNING
- Compare the result with Image 1 at the same crop.
- If any face, eye, hand, animal feature, lettering, logo, accessory or meaningful small object disappeared or became unrecognizable, restore it using closed solid-color regions from the allowed palette.
- Make sure the main subject has visibly finer segmentation than the background.
- Zoom into every flat plane, especially dark logos, uniforms, hair and backgrounds. Remove all pepper noise and isolated colour flecks; a uniform plane must contain one uniform palette colour.

Return only the finished full-frame color preview.`.trim();
}

export async function GET() {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const runtime = env as unknown as { OPENAI_API_KEY?: string };
  return Response.json({ configured: Boolean(runtime.OPENAI_API_KEY), model: "gpt-image-2" });
}

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });

  const runtime = env as unknown as { OPENAI_API_KEY?: string };
  if (!runtime.OPENAI_API_KEY) {
    return Response.json({
      error: "Интеллектуальный модуль подготовлен, но ключ OpenAI API ещё не подключён.",
      code: "not_configured",
    }, { status: 503 });
  }

  const data = await request.formData();
  const image = data.get("image");
  if (!(image instanceof File)) return Response.json({ error: "source image is required" }, { status: 400 });
  if (!allowedTypes.has(image.type)) return Response.json({ error: "only JPG, PNG and WEBP are supported" }, { status: 415 });
  if (image.size > 25 * 1024 * 1024) return Response.json({ error: "image is larger than 25 MB" }, { status: 413 });

  const targetColors = Math.max(24, Math.min(60, Number(data.get("targetColors")) || 45));
  let promptPalette: PromptPaint[] = [];
  try {
    const parsed = JSON.parse(String(data.get("palette") || "[]"));
    if (Array.isArray(parsed)) {
      promptPalette = parsed.filter(isPromptPaint).slice(0, targetColors).map((paint) => ({ code: paint.code.slice(0, 40), name: paint.name.slice(0, 40), hex: paint.hex.toUpperCase() }));
    }
  } catch {
    // A clear validation response follows below.
  }
  if (!promptPalette.length) return Response.json({ error: "production palette is required" }, { status: 400 });
  const profile = String(data.get("profile") || "auto");
  const mode = data.get("mode") === "production-correction" ? "production-correction" : "standard";
  const correction = String(data.get("correction") || "").slice(0, 2000);
  const quality = data.get("quality") === "medium" ? "medium" : "high";
  const readinessDiagnostics = mode === "production-correction"
    ? parseProductionReadinessDiagnostics(data.get("readinessDiagnostics"))
    : null;
  if (mode === "production-correction" && !readinessDiagnostics) {
    return Response.json({ error: "production readiness diagnostics are required" }, { status: 400 });
  }
  const correctionStrategy: ProductionCorrectionStrategy | undefined = readinessDiagnostics
    ? readinessDiagnostics.fitCoverage < 25 ? "global-rebuild" : "local-repair"
    : undefined;

  const failureOverlay = data.get("failureOverlay");
  if (mode === "production-correction" && !(failureOverlay instanceof File)) {
    return Response.json({ error: "production failure overlay is required" }, { status: 400 });
  }
  if (failureOverlay instanceof File && (!allowedTypes.has(failureOverlay.type) || failureOverlay.size > 25 * 1024 * 1024)) {
    return Response.json({ error: "invalid production failure overlay" }, { status: 415 });
  }
  const sourceReference = data.get("sourceReference");
  if (sourceReference instanceof File && (!allowedTypes.has(sourceReference.type) || sourceReference.size > 25 * 1024 * 1024)) {
    return Response.json({ error: "invalid source reference" }, { status: 415 });
  }

  let reference: Blob | null = null;
  if (quality === "high" && mode !== "production-correction") {
    try {
      const referenceResponse = await fetch(new URL("/reference/history/style-reference.jpg", request.url));
      if (referenceResponse.ok) {
        reference = await referenceResponse.blob();
      }
    } catch {
      // The source image and prompt remain sufficient if the static reference is unavailable.
    }
  }

  const callOpenAi = async (standardCompatibility = false) => {
    const openaiForm = new FormData();
    openaiForm.set("model", "gpt-image-2");
    if (mode === "production-correction") {
      if (correctionStrategy === "global-rebuild" && sourceReference instanceof File) {
        openaiForm.append("image[]", sourceReference, sourceReference.name || "original-source.jpg");
        openaiForm.append("image[]", image, image.name || "failed-production-preview.png");
        openaiForm.append("image[]", failureOverlay as File, "production-failure-overlay.png");
      } else {
        openaiForm.append("image[]", image, image.name || "failed-production-preview.png");
        openaiForm.append("image[]", failureOverlay as File, "production-failure-overlay.png");
        if (sourceReference instanceof File) openaiForm.append("image[]", sourceReference, sourceReference.name || "original-source.jpg");
      }
    } else if (reference) {
      openaiForm.append("image[]", image, image.name || "source.jpg");
      openaiForm.append("image[]", reference, "hobruk-style-reference.jpg");
    } else {
      openaiForm.append("image[]", image, image.name || "source.jpg");
    }
    openaiForm.set("prompt", buildPrompt(
      promptPalette.length,
      profile,
      correction,
      promptPalette,
      mode === "production-correction" ? sourceReference instanceof File : Boolean(reference),
      mode,
      correctionStrategy,
      readinessDiagnostics,
    ));
    openaiForm.set("quality", quality);
    openaiForm.set("size", standardCompatibility ? "1024x1536" : quality === "medium" ? "800x1008" : "1024x1280");
    openaiForm.set("stream", "true");
    openaiForm.set("partial_images", "1");
    if (!standardCompatibility) {
      openaiForm.set("output_format", "png");
      openaiForm.set("background", "opaque");
      openaiForm.set("user", session.user.id);
    }
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}` },
      body: openaiForm,
    });
    const streaming = response.ok && response.headers.get("content-type")?.includes("text/event-stream") && Boolean(response.body);
    if (streaming) return { response, result: {} as ImageResponse, streaming: true };
    const responseText = await response.text();
    let result: ImageResponse = {};
    try { result = JSON.parse(responseText) as ImageResponse; } catch { /* Keep a readable fallback below. */ }
    return { response, result, streaming: false };
  };

  return relayImageRequest(async () => {
    let outcome = await callOpenAi(false);
    const firstError = outcome.result.error?.message || "";
    if (outcome.response.status === 400 && /size|background|parameter|invalid value/i.test(firstError)) {
      outcome = await callOpenAi(true);
    }
    return outcome;
  });
}
