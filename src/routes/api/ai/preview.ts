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
- https://ipapi.co/json/

KRYPTO / BLOCKCHAIN
- https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=eur,usd
- https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20
- https://blockchain.info/ticker
- https://mempool.space/api/v1/fees/recommended
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
- https://restcountries.com/v3.1/all

NEWS
- https://hn.algolia.com/api/v1/search?query=ai
- https://api.spaceflightnewsapi.net/v4/articles/

KARTEN / BILDER
- https://nominatim.openstreetmap.org/search?q=..&format=json
- https://picsum.photos/seed/foo/600/400

REGEL: Wenn die App von Daten profitiert, binde passende APIs LIVE ein. Niemals fake-data, wenn eine API existiert.`;

const ALPHA_SYSTEM = `Du bist ALPHA — Senior-Web-Engineer. Baue aus ZIP-Metadaten eine **echte, voll funktionsfähige Web-Version** des Programms.

Strenge Regeln:
- Eine einzige HTML-Datei, inline CSS+JS, keine externen Skripte/CDNs.
- ECHTE Logik, keine Stubs, keine TODOs, keine fake-data.
- JEDER sichtbare Knopf, jedes Input-Feld muss verkabelt sein und etwas tun.
- Bei Bedarf passende APIs aus dem Katalog per fetch() (mit try/catch + Loading).
- Übersetze Python/Java/C/Kotlin portabel nach JavaScript + Web-APIs.
- Bei APK/EXE/JAR ohne Quellcode: leite Zweck aus Manifest/README/Namen ab und baue eine voll funktionsfähige App.
- KEIN Quellcode für Endnutzer sichtbar.
- Dunkles Slate/Cyan-UI, responsive, ohne Erklärtexte.

${API_CATALOG}

Antwort: NUR vollständiges HTML ab <!doctype html>. Kein Markdown, keine Fences.`;

const BETA_SYSTEM = `Du bist BETA — knallharter Code-Reviewer. Du bekommst eine HTML-App von ALPHA.

Liste KONKRET und UMSETZBAR:
1. Jeden toten Knopf / nicht verkabeltes Input.
2. Jeden Platzhalter / fake-Wert / TODO / Stub.
3. Fehlende oder falsche Berechnungs-Logik gemessen am Original-Zweck.
4. Fehlende Live-APIs, wo Daten gebraucht werden (Krypto, Wetter, Geo, News …).
5. Fehlende try/catch, Loading-States, Edge Cases (leer/groß/ungültig).
6. UI/UX-Mängel (Kontrast, Mobile, Responsiveness).
7. Sicherheits-Probleme (eval mit user-input, fehlendes Escaping).

Antwort: knappe Bullet-Liste, KEIN Lob, KEIN HTML. Maximal 20 Punkte, sortiert nach Priorität.`;

const GAMMA_SYSTEM = `Du bist GAMMA — Senior-Web-Engineer. Du bekommst die Alpha-App und die Beta-Mängel-Liste.
Liefere eine VERBESSERTE Version, die JEDEN Punkt behebt.

Regeln (unverändert):
- Eine HTML-Datei, inline CSS+JS, keine externen Skripte.
- Echte Logik, jeder Knopf verkabelt, keine Stubs.
- Passende APIs aus dem Katalog wo sinnvoll.
- Dunkles Slate/Cyan-UI, responsive.

${API_CATALOG}

Antwort: NUR vollständiges HTML ab <!doctype html>.`;

const DELTA_SYSTEM = `Du bist DELTA — Final-QA-Engineer. Letzter Durchgang vor Auslieferung.
Du bekommst die Gamma-Version. Prüfe und KORRIGIERE direkt im Code:

Checkliste — alles MUSS true sein in der Ausgabe:
[ ] Jeder <button>, <a>, <input>, <select>, <form> hat einen funktionierenden Handler.
[ ] Keine leeren onclick="", keine "alert('TODO')", keine Platzhalter.
[ ] Alle berechenbaren Werte werden wirklich aus Inputs berechnet.
[ ] Jeder fetch() hat try/catch und einen sichtbaren Lade-/Fehlerstatus.
[ ] App startet in einem sinnvollen Initialzustand (Demo-Daten geladen wenn passend).
[ ] Responsive bis 360px Breite.
[ ] Keine externen Skripte/Styles, alles inline.

Liefere die FERTIGE 100%-Version.

${API_CATALOG}

Antwort: NUR vollständiges HTML ab <!doctype html>.`;

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

Inhalts-Auszüge:
${samples || "(keine Textdateien — leite aus Typ und Namen die plausibelste voll funktionsfähige App ab)"}

Baue jetzt die voll funktionsfähige Web-Version.`;

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) =>
              controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

            try {
              const gateway = createLovableAiGatewayProvider(key);
              const model = gateway("google/gemini-3-flash-preview");

              // ALPHA
              send({ type: "stage", id: "alpha", label: "Alpha · Erstentwurf", progress: 15 });
              const alpha = await generateText({
                model,
                system: ALPHA_SYSTEM,
                prompt: buildPrompt,
                maxOutputTokens: 16000,
              });
              let html = stripFences(alpha.text);
              if (!isHtml(html)) {
                send({ type: "error", message: "alpha_bad_html" });
                controller.close();
                return;
              }
              send({ type: "stage", id: "alpha", label: "Alpha · fertig", progress: 35 });

              // BETA
              try {
                send({ type: "stage", id: "beta", label: "Beta · Code-Review", progress: 50 });
                const beta = await generateText({
                  model,
                  system: BETA_SYSTEM,
                  prompt: `Programm: ${mainName} (${fileKind ?? "unbekannt"})\n\nApp:\n${html.slice(0, 30000)}`,
                  maxOutputTokens: 2500,
                });
                const critique = beta.text;

                // GAMMA
                send({ type: "stage", id: "gamma", label: "Gamma · Verbesserung", progress: 70 });
                const gamma = await generateText({
                  model,
                  system: GAMMA_SYSTEM,
                  prompt: `Programm: ${mainName}\n\nAktuelle App:\n${html}\n\nBeta-Mängel:\n${critique}\n\nLiefere die verbesserte HTML-Datei.`,
                  maxOutputTokens: 16000,
                });
                const gammaHtml = stripFences(gamma.text);
                if (isHtml(gammaHtml)) html = gammaHtml;

                // DELTA — Endprüfung
                send({ type: "stage", id: "delta", label: "Delta · Endprüfung", progress: 88 });
                const delta = await generateText({
                  model,
                  system: DELTA_SYSTEM,
                  prompt: `Programm: ${mainName}\n\nGamma-Version:\n${html}\n\nFühre die Final-QA-Checkliste aus und liefere die 100%-Version.`,
                  maxOutputTokens: 16000,
                });
                const deltaHtml = stripFences(delta.text);
                if (isHtml(deltaHtml)) html = deltaHtml;
              } catch {
                // Verbesserungs-Passes optional — Alpha bleibt
              }

              send({ type: "stage", id: "done", label: "Fertig", progress: 100 });
              send({ type: "done", html });
              controller.close();
            } catch {
              send({ type: "error", message: "ai_error" });
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
