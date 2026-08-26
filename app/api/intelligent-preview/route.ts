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

function isPromptPaint(value: unknown): value is PromptPaint {
  if (!value || typeof value !== "object") return false;
  const paint = value as Record<string, unknown>;
  return typeof paint.code === "string"
    && typeof paint.name === "string"
    && typeof paint.hex === "string"
    && /^#[0-9A-F]{6}$/i.test(paint.hex);
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

function buildPrompt(targetColors: number, profile: string, correction: string, palette: PromptPaint[], hasReference: boolean) {
  const subjectRules: Record<string, string> = {
    portrait: "Build the people first. Faces, identity, eyes, pupils, eyelids, eyebrows, nose planes, lips, ears, hairline, hands, fingers, clothing folds, jewelry and every recognizable accessory are protected details.",
    animal: "Build the animal first. Eyes, highlights, pupils, eyelids, nose, nostrils, mouth, ears, whisker roots, paws, claws and characteristic coat markings are protected details.",
    landscape: "Preserve the main architecture, windows, doors, signs, horizon, foreground objects and recognizable small silhouettes; simplify only random surface texture.",
    auto: "Detect every meaningful subject before simplifying anything. Protect faces, eyes, hands, animals, lettering, emblems, logos, signs, jewelry, accessories and every identity- or story-defining small object.",
  };
  const paletteList = palette.map((paint, index) => `${index + 1}. ${paint.code} · ${paint.name} · ${paint.hex}`).join("\n");

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
  const correction = String(data.get("correction") || "").slice(0, 2000);
  const quality = data.get("quality") === "medium" ? "medium" : "high";

  let reference: Blob | null = null;
  if (quality === "high") {
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
    openaiForm.append("image[]", image, image.name || "source.jpg");
    if (reference) openaiForm.append("image[]", reference, "hobruk-style-reference.jpg");
    openaiForm.set("prompt", buildPrompt(promptPalette.length, profile, correction, promptPalette, Boolean(reference)));
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
