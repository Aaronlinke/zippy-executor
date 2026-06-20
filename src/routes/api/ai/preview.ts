import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

type Body = {
  mainName?: string;
  fileKind?: string;
  fileList?: string[];
  textSamples?: { name: string; content: string }[];
};

const API_CATALOG = `Verfügbare öffentliche APIs (kein Key nötig, CORS erlaubt — direkt per fetch() nutzbar):

WETTER & GEO
- https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current_weather=true
- https://geocoding-api.open-meteo.com/v1/search?name=Berlin
- https://ipapi.co/json/   (Standort des Nutzers)

KRYPTO / BLOCKCHAIN
- https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=eur,usd
- https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20
- https://blockchain.info/ticker            (BTC Kurse mehrerer Währungen)
- https://mempool.space/api/v1/fees/recommended   (BTC Gebühren)
- https://api.coincap.io/v2/assets

WÄHRUNGEN
- https://open.er-api.com/v6/latest/USD
- https://api.frankfurter.app/latest?from=EUR&to=USD,GBP

DATEN / SPASS
- https://api.quotable.io/random
- https://catfact.ninja/fact
- https://dog.ceo/api/breeds/image/random
- https://www.boredapi.com/api/activity
- https://uselessfacts.jsph.pl/api/v2/facts/random
- https://api.publicapis.org/entries
- https://restcountries.com/v3.1/all
- https://datausa.io/api/data?drilldowns=Nation&measures=Population

NEWS
- https://hn.algolia.com/api/v1/search?query=ai
- https://api.spaceflightnewsapi.net/v4/articles/

KARTEN / BILDER
- https://nominatim.openstreetmap.org/search?q=..&format=json
- https://picsum.photos/seed/foo/600/400   (Bild direkt)
- https://api.unsplash.com   (NUR wenn Nutzer eigenen Key einträgt)

REGEL: Wenn die App von Daten profitiert (Kurse, Wetter, News, Übersetzung, Krypto, Karten),
binde EINE oder mehrere passende APIs LIVE ein. Niemals fake-data, wenn eine API existiert.`;

const SYSTEM_BUILD = `Du bist ein Senior-Web-Engineer. Eingabe: Metadaten und Auszüge einer ZIP
(Skript, App, APK, EXE, JAR, Python, JS, …).

Aufgabe: Baue eine **vollwertige, echt funktionierende Web-Version** des Programms —
keine Simulation, keine Attrappe, kein Mockup-Text. Wenn das Original etwas berechnet,
muss deine Version es ebenfalls berechnen. Wenn es Daten verwaltet, muss deine Version
Daten verwalten (im Speicher / localStorage). Wenn es ein Spiel ist, muss man es spielen
können. Ziel: so gut wie das Original — wenn möglich besser.

Strenge Regeln:
- Liefere EINE einzige eigenständige HTML-Datei mit inline CSS und JS. Keine externen
  Skripte, keine CDN-Imports — alles inline und offline lauffähig im Browser.
- Echte Kern-Logik in JavaScript. Keine "TODO"-Stubs, keine Platzhalter-Buttons,
  keine Fake-Daten-Demos. Alle Buttons müssen wirklich was tun.
- Wenn die App von Live-Daten lebt (Kurse, Wetter, Krypto, News, Geo, Übersetzung):
  binde passende öffentliche APIs aus dem Katalog per fetch() direkt ein — mit
  Ladeindikator, try/catch und sauberem Fehler-Hinweis bei Offline.
- Übersetze Python/Java/C/Kotlin-Logik portabel nach JavaScript. Web-APIs statt
  nativer Bibliotheken (Canvas, Audio, localStorage, FileReader).
- Bei APK/EXE/JAR/IPA ohne Quellcode: leite aus Manifest, Dateinamen, README den
  Zweck ab und baue eine voll funktionsfähige Web-App, die diesen Zweck erfüllt.
- KEIN Quellcode für den Nutzer sichtbar. Nur die fertige App.
- Modernes, dunkles UI (Slate/Cyan), responsive, sauber, ohne Erklärtexte.

${API_CATALOG}

Antworte AUSSCHLIESSLICH mit vollständigem HTML, beginnend mit <!doctype html>.
Kein Markdown, keine Code-Fences, keine Erklärung davor oder danach.`;

const SYSTEM_CRITIC = `Du bist ein knallharter Senior-Code-Reviewer. Du bekommst eine HTML-App,
die ein anderes Modell aus einer ZIP-Datei gebaut hat. Finde die Schwächen.

Prüfe konkret:
1. Hat die App ECHTE Logik oder nur Demo/Stubs? Liste tote Buttons, fake-Werte, fehlende Berechnungen.
2. Funktionieren alle Eingaben, Forms, Tasten?
3. Wo wären Live-APIs sinnvoll, fehlen aber? (Wetter, Krypto, Kurse, Geo, News, Blockchain …)
4. CORS-Probleme bei den verwendeten APIs?
5. Fehlerbehandlung (try/catch, Loading-States, Offline-Fallback)?
6. UI/UX: konsistentes dunkles Theme, responsive, lesbar?
7. Security: keine externen Skripte, kein eval mit user-input, sauberes Escaping.
8. Edge Cases: leere Eingabe, große Eingabe, ungültige Eingabe.

Antworte als kurze, knackige Bullet-Liste mit konkreten, umsetzbaren Verbesserungen.
KEIN Lob, KEIN HTML, KEINE Code-Blöcke — nur die Mängel-Liste.`;

const SYSTEM_REFINE = `Du bist Senior-Web-Engineer. Du bekommst eine HTML-App und eine
Mängel-Liste eines Reviewers. Liefere eine VERBESSERTE Version, die alle genannten
Punkte behebt. Behalte alles, was gut war.

Strenge Regeln (gelten unverändert weiter):
- Eine einzige eigenständige HTML-Datei, inline CSS+JS, keine externen Skripte.
- Echte Logik in JS, keine Stubs, keine fake-data.
- Wo nützlich, echte öffentliche APIs per fetch() (siehe Katalog).
- Dunkles, modernes UI (Slate/Cyan), responsive, ohne Erklärtexte.

${API_CATALOG}

Antworte AUSSCHLIESSLICH mit vollständigem HTML, beginnend mit <!doctype html>.
Kein Markdown, keine Code-Fences, keine Erklärung.`;

function stripFences(s: string) {
  return s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function isHtml(s: string) {
  return /<html|<!doctype/i.test(s);
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

        const buildPrompt = `Hauptdatei: ${mainName}
Typ: ${fileKind ?? "unbekannt"}

Dateiliste (${fileList?.length ?? 0}):
${(fileList ?? []).slice(0, 60).join("\n")}

Inhalts-Auszüge aus der ZIP (Quellcode, README, Manifest):
${samples || "(keine Textdateien gefunden — leite aus Typ und Namen die plausibelste voll funktionsfähige App ab)"}

Baue jetzt die voll funktionsfähige Web-Version. Echte Logik, echte APIs wenn passend.`;

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");

          // PASS 1: Build
          const first = await generateText({
            model,
            system: SYSTEM_BUILD,
            prompt: buildPrompt,
            maxOutputTokens: 16000,
          });
          let html = stripFences(first.text);
          if (!isHtml(html)) return new Response("ai_bad_html", { status: 502 });

          // PASS 2: Critic + Refine (best-effort, fall back to v1 if it fails)
          try {
            const critique = await generateText({
              model,
              system: SYSTEM_CRITIC,
              prompt: `Ursprungs-Programm: ${mainName} (${fileKind ?? "unbekannt"}).

Gebaute App:
${html.slice(0, 30000)}

Liste die konkreten Mängel und Verbesserungen.`,
              maxOutputTokens: 2000,
            });

            const refined = await generateText({
              model,
              system: SYSTEM_REFINE,
              prompt: `Ursprungs-Programm: ${mainName} (${fileKind ?? "unbekannt"}).

Aktuelle App:
${html}

Mängel-Liste des Reviewers:
${critique.text}

Liefere die verbesserte vollständige HTML-Datei.`,
              maxOutputTokens: 16000,
            });
            const refinedHtml = stripFences(refined.text);
            if (isHtml(refinedHtml)) html = refinedHtml;
          } catch {
            // keep v1
          }

          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        } catch {
          return new Response("ai_error", { status: 502 });
        }
      },
    },
  },
});
