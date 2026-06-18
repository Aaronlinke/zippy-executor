import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = { code?: string; language?: string; filename?: string };

const SYSTEM = `Du bist ein UI-Generator. Eingabe: ein Skript (Python oder JavaScript).
Aufgabe: Erzeuge eine eigenständige, schöne, interaktive HTML5-Seite mit inline CSS und JS,
die zeigt, was das Skript tut — als spielbare/benutzbare Simulation.
Dunkles Theme (Slate Hintergrund, Cyan-Akzente). Antworte AUSSCHLIESSLICH mit vollständigem HTML,
beginnend mit <!doctype html>. Kein Markdown, keine Code-Fences, keine Erklärung.`;

function stripFences(s: string) {
  return s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

export const Route = createFileRoute("/api/ai/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { code, language, filename } = (await request.json()) as Body;
        if (!code || typeof code !== "string") {
          return new Response("missing code", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("missing key", { status: 500 });

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");
          const { text } = await generateText({
            model,
            system: SYSTEM,
            prompt: `Sprache: ${language ?? "unbekannt"}\nDatei: ${filename ?? ""}\n\n---\n${code.slice(0, 20000)}\n---`,
          });
          const html = stripFences(text);
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } catch {
          return new Response("ai_error", { status: 502 });
        }
      },
    },
  },
});
