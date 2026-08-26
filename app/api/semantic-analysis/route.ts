import { env } from "cloudflare:workers";
import { ensureWorkspaceUser } from "../../../lib/tenant";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MODEL = "gpt-5.6-terra";

type RawRegion = {
  kind: "face" | "eye" | "text" | "logo" | "hand" | "key-detail";
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  priority: "critical" | "protected";
};

type ChatCompletion = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: string };
};

function imageDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunkSize)));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function costUsd(usage: ChatCompletion["usage"]) {
  if (!usage) return null;
  // Standard gpt-5.6-terra pricing: $2/M input, $12/M output.
  const input = usage.prompt_tokens || 0;
  const output = usage.completion_tokens || 0;
  return Number((input * 2 / 1_000_000 + output * 12 / 1_000_000).toFixed(6));
}

function friendlyError(result: ChatCompletion, status: number) {
  const message = result.error?.message || "Не удалось распознать важные детали изображения.";
  if (/billing|credit|quota|limit reached/i.test(message)) return "На аккаунте OpenAI API закончился лимит.";
  if (/invalid api key|incorrect api key|authentication/i.test(message) || status === 401) return "OpenAI отклонил API-ключ.";
  return message;
}

export async function POST(request: Request) {
  const session = await ensureWorkspaceUser();
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });

  const runtime = env as unknown as { OPENAI_API_KEY?: string };
  if (!runtime.OPENAI_API_KEY) {
    return Response.json({ error: "Для защиты деталей нужен OPENAI_API_KEY.", code: "not_configured" }, { status: 503 });
  }

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return Response.json({ error: "production preview is required" }, { status: 400 });
  if (!allowedTypes.has(image.type)) return Response.json({ error: "only JPG, PNG and WEBP are supported" }, { status: 415 });
  if (image.size > 25 * 1024 * 1024) return Response.json({ error: "image is larger than 25 MB" }, { status: 413 });

  const bytes = new Uint8Array(await image.arrayBuffer());
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "none",
      messages: [
        {
          role: "system",
          content: "You locate identity-critical visual regions for paint-by-numbers production. Return tight, accurate boxes; never redesign the image.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Inspect this already approved color preview.",
                "Return normalized 0..1000 boxes for every visible face, EACH eye separately, every readable text fragment, logo, emblem, hand, and any small object/detail essential to identity or story.",
                "Eyes, text, logos and emblems are critical. Faces, hands and other identity details are protected.",
                "Boxes must be tight but include the full painted shape. Do not mark random texture, shadows, folds, background noise, grass, hair strands or decorative speckles.",
                "A face box and its two individual eye boxes are all required when a face is visible.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: { url: imageDataUrl(bytes, image.type), detail: "original" },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "paint_protection_regions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              regions: {
                type: "array",
                maxItems: 80,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    kind: { type: "string", enum: ["face", "eye", "text", "logo", "hand", "key-detail"] },
                    label: { type: "string" },
                    x0: { type: "number", minimum: 0, maximum: 1000 },
                    y0: { type: "number", minimum: 0, maximum: 1000 },
                    x1: { type: "number", minimum: 0, maximum: 1000 },
                    y1: { type: "number", minimum: 0, maximum: 1000 },
                    priority: { type: "string", enum: ["critical", "protected"] },
                  },
                  required: ["kind", "label", "x0", "y0", "x1", "y1", "priority"],
                },
              },
            },
            required: ["regions"],
          },
        },
      },
      max_completion_tokens: 2400,
    }),
  });

  const responseText = await response.text();
  let result: ChatCompletion = {};
  try { result = JSON.parse(responseText) as ChatCompletion; } catch { /* A readable fallback follows. */ }
  if (!response.ok) {
    return Response.json({
      error: friendlyError(result, response.status),
      code: result.error?.code || "semantic_analysis_failed",
      requestId: response.headers.get("x-request-id"),
    }, { status: response.status || 502 });
  }

  let parsed: { regions?: RawRegion[] } = {};
  try { parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}") as typeof parsed; } catch { /* Validated below. */ }
  const regions = (parsed.regions || []).flatMap((region) => {
    const x0 = Math.max(0, Math.min(1000, Number(region.x0)));
    const y0 = Math.max(0, Math.min(1000, Number(region.y0)));
    const x1 = Math.max(0, Math.min(1000, Number(region.x1)));
    const y1 = Math.max(0, Math.min(1000, Number(region.y1)));
    if (!(x1 > x0 && y1 > y0)) return [];
    return [{
      kind: region.kind,
      label: String(region.label || region.kind).slice(0, 80),
      x: x0 / 1000,
      y: y0 / 1000,
      width: (x1 - x0) / 1000,
      height: (y1 - y0) / 1000,
      priority: region.kind === "eye" || region.kind === "text" || region.kind === "logo" ? "critical" as const : region.priority,
    }];
  });

  if (!regions.length) {
    return Response.json({ error: "ИИ не нашёл ни одной защищаемой детали; карта не изменена.", code: "no_regions" }, { status: 422 });
  }

  return Response.json({
    regions,
    model: MODEL,
    usage: result.usage || null,
    costUsd: costUsd(result.usage),
    costBasis: "gpt-5.6-terra standard: input $2/M, output $12/M",
  });
}
