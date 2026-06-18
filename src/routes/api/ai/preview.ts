import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = {
  mainName?: string;
  fileKind?: string;
  fileList?: string[];
  textSamples?: { name: string; content: string }[];
};

const SYSTEM = `Du bist ein UI-Generator. Eingabe: Metadaten und Auszüge aus einer ZIP-Datei
(Programmdatei, Skript, App, APK, EXE, JAR oder Ähnliches).

Aufgabe: Erzeuge eine eigenständige, schöne, **interaktive HTML5-Seite mit inline CSS und JS**,
die SIMULIERT, wie das Programm aussieht und sich anfühlt. Der Nutzer soll Knöpfe klicken,
Eingaben machen und das Verhalten ausprobieren können — als wäre die App im Browser geöffnet.

Regeln:
- Zeige KEINEN Quellcode. Zeige das fertige Erlebnis.
- Wenn es eine Android-/iOS-App ist: Rahme die UI in einem Handy-Mockup.
- Wenn es ein Desktop-Programm ist: Fenster-Look mit Titelleiste.
- Wenn es ein Skript ist: Mache ein passendes interaktives Tool draus.
- Dunkles, modernes Theme. Cyan/Slate-Akzente. Lesbar, ohne Erklärtexte.
- Funktionierende Buttons mit JavaScript. Realistisches Verhalten.

Antworte AUSSCHLIESSLICH mit vollständigem HTML, beginnend mit <!doctype html>.
Kein Markdown, keine Code-Fences, keine Erklärung davor oder danach.`;

function stripFences(s: string) {
  return s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

export const Route = createFileRoute("/api/ai/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const { mainName, fileKind, fileList, textSamples } = body;
        if (!mainName) return new Response("missing", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("missing key", { status: 500 });

        const samples = (textSamples ?? [])
          .map((s) => `=== ${s.name} ===\n${s.content}`)
          .join("\n\n")
          .slice(0, 18000);

        const prompt = `Hauptdatei: ${mainName}
Typ: ${fileKind ?? "unbekannt"}

Dateiliste (${fileList?.length ?? 0}):
${(fileList ?? []).slice(0, 60).join("\n")}

Inhalts-Auszüge (zur Inspiration für die simulierte UI):
${samples || "(keine Textdateien gefunden — erfinde eine plausible UI passend zum Typ und Namen)"}

Bitte: erzeuge die interaktive Simulation.`;

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");
          const { text } = await generateText({ model, system: SYSTEM, prompt });
          const html = stripFences(text);
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        } catch {
          return new Response("ai_error", { status: 502 });
        }
      },
    },
  },
});
