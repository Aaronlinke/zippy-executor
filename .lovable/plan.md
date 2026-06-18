## Ziel
Eine Single-Page-Web-App "ZipRunner": ZIP rein → Tool entpackt, findet Hauptdatei, zeigt Ergebnis sofort. Keine Rückfragen, keine Fehlertexte wie "nicht erkannt".

## Stack
- TanStack Start (bestehendes Projekt), React + TypeScript, Tailwind
- `jszip` (ZIP-Entpacken im Browser, kein Server nötig fürs Entpacken)
- Lovable AI Gateway (Gemini) via server route `/api/ai/preview` für Skript→HTML-Vorschau

## Routen / Dateien
- `src/routes/index.tsx` – ZipRunner UI (Drag & Drop + File Picker, Vollbild)
- `src/lib/zip-runner.ts` – Client-Logik: Entpacken, Hauptdatei finden, Blob-URLs erzeugen
- `src/routes/api/ai/preview.ts` – Server route: nimmt Skript-Text + Sprache, ruft Gemini via AI Gateway, gibt fertiges HTML zurück
- `src/lib/ai-gateway.server.ts` – Gateway-Helper (Standard-Pattern aus Knowledge)

## Erkennungs-Priorität (erste Treffer gewinnt)
1. `index.html` oder `index.htm` → in iframe rendern. Relative Asset-URLs (CSS/JS/Bilder) durch Blob-URLs der entpackten Dateien ersetzen (Regex über `href=`, `src=`, `url(...)`).
2. `index.php` → ebenfalls als HTML im iframe rendern (PHP-Code als Klartext sichtbar; im Browser nicht ausführbar — wir behandeln es wie HTML, ohne Fehlertext).
3. `main.py` / `app.js` / `*.py` / `*.js` als Hauptdatei → Inhalt an `/api/ai/preview` schicken, generiertes HTML im iframe rendern. Während des Calls: Spinner.
4. `.apk` / `.exe` / `.jar` / `.msi` / `.dmg` → automatischer Download via Blob + `<a download>`, plus prominenter "Erneut herunterladen"-Button.
5. Fallback: erste lesbare Datei → wenn HTML-artig: rendern; sonst Download anbieten. Nie Fehlermeldung.

Hauptdatei-Suche: erst Root-Ebene, dann rekursiv, kürzester Pfad gewinnt.

## UI
- Dunkles Theme (Slate + Cyan-Akzent, passend zum bisherigen Wunsch)
- Vollbild-Dropzone mit gestricheltem Rand, Text: „ZIP hier ablegen oder klicken"
- Drag-over State, Lade-State, Ergebnis-State (iframe nimmt Rest des Viewports ein)
- Kleiner „Neue ZIP"-Button oben rechts wenn Ergebnis angezeigt wird
- Keine Konsole, keine Fehlertexte — bei wirklich leerem ZIP: dezente Zeile „ZIP ist leer" + Reset

## AI-Vorschau (Server Route)
- Input: `{ code: string, language: "python" | "javascript" }`
- Modell: `google/gemini-3-flash-preview`
- System-Prompt: „Du bist ein UI-Generator. Verwandle das Skript in eine eigenständige, interaktive HTML-Seite mit inline CSS/JS, die zeigt, was das Skript tut. Antworte NUR mit vollständigem HTML, kein Markdown."
- Output: HTML als Text → Client schreibt es per `srcdoc` ins iframe
- Fehler (429/402): iframe zeigt minimale stilvolle Offline-Simulation des Skripts (Code in `<pre>` + Hinweis) — nie „Fehler"-Wortlaut

## Dependencies
- `bun add jszip ai @ai-sdk/openai-compatible zod`

## Nicht im Scope
- Echte Python/Node-Ausführung serverseitig (Cloudflare Worker kann das nicht)
- Auth, DB, Persistenz — alles client-seitig pro Session
- APK-Bau / Android — das ist eine Web-App
