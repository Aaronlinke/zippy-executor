import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = {
  mainName?: string;
  fileKind?: string;
  fileList?: string[];
  textSamples?: { name: string; content: string }[];
};

const SYSTEM = `Du bist ein Senior-Web-Engineer. Eingabe: Metadaten und Auszüge einer ZIP
(Skript, App, APK, EXE, JAR, Python, JS, …).

Aufgabe: Baue eine **vollwertige, echt funktionierende Web-Version** des Programms —
keine Simulation, keine Attrappe, kein Mockup-Text. Wenn das Original etwas berechnet,
muss deine Version es ebenfalls berechnen. Wenn es Daten verwaltet, muss deine Version
Daten verwalten (im Speicher / localStorage). Wenn es ein Spiel ist, muss man es spielen
können. Ziel: so gut wie das Original — wenn möglich besser.

Strenge Regeln:
- Liefere EINE einzige eigenständige HTML-Datei mit inline CSS und JS. Keine externen
  Skripte, keine CDN-Imports — alles inline und offline lauffähig im Browser.
- Implementiere die KERN-LOGIK wirklich in JavaScript. Keine "TODO"-Stubs, keine
  Platzhalter-Buttons ohne Funktion, keine Fake-Daten-Demos. Alle sichtbaren Funktionen
  müssen klicken/eingeben/rechnen/anzeigen.
- Übersetze Python/Java/C/Kotlin-Logik portabel nach JavaScript. Nutze Web-APIs
  (Canvas, Audio, localStorage, FileReader) statt nativer Bibliotheken.
- Bei APK/EXE/JAR/IPA ohne Quellcode: leite aus Manifest, Dateinamen, README den
  Zweck ab und baue eine voll funktionsfähige Web-App, die diesen Zweck erfüllt.
- KEIN Quellcode sichtbar für den Nutzer. Nur die fertige App.
- Modernes, dunkles UI (Slate/Cyan), responsive, sauber, ohne Erklärtexte.
- Bei Mobile-Apps darf ein Phone-Frame drumherum sein, aber die App INNEN muss echt
  funktionieren.

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

Inhalts-Auszüge aus der ZIP (Quellcode, README, Manifest — als Vorlage für die echte Logik):
${samples || "(keine Textdateien gefunden — leite aus Typ und Namen die plausibelste voll funktionsfähige App ab)"}

Baue jetzt die voll funktionsfähige Web-Version. Keine Demo, keine Stubs — echte Logik in JS.`;

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");
          const { text } = await generateText({
            model,
            system: SYSTEM,
            prompt,
            maxOutputTokens: 16000,
          });
          const html = stripFences(text);
          if (!/<html|<!doctype/i.test(html)) {
            return new Response("ai_bad_html", { status: 502 });
          }
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        } catch {
          return new Response("ai_error", { status: 502 });
        }
      },
    },
  },
});
