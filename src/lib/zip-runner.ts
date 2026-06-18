import JSZip from "jszip";

export type RunResult =
  | { kind: "html"; srcDoc: string; mainName: string }
  | { kind: "script"; code: string; language: "python" | "javascript"; mainName: string }
  | { kind: "download"; url: string; filename: string; mainName: string }
  | { kind: "empty" };

const HTML_NAMES = ["index.html", "index.htm", "index.php"];
const SCRIPT_NAMES = ["main.py", "app.js", "index.js", "main.js", "app.py"];
const DOWNLOAD_EXTS = [".apk", ".exe", ".jar", ".msi", ".dmg", ".ipa", ".deb"];

const MIME: Record<string, string> = {
  html: "text/html", htm: "text/html", css: "text/css",
  js: "application/javascript", mjs: "application/javascript",
  json: "application/json", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  txt: "text/plain", xml: "application/xml",
};

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function mimeFor(name: string) {
  return MIME[ext(name)] ?? "application/octet-stream";
}

function pickMain(files: string[]): string | null {
  const lower = files.map((f) => [f, f.toLowerCase()] as const);
  // priority categories
  const cats: ((n: string) => boolean)[] = [
    (n) => HTML_NAMES.some((x) => n.endsWith("/" + x) || n === x),
    (n) => SCRIPT_NAMES.some((x) => n.endsWith("/" + x) || n === x),
    (n) => DOWNLOAD_EXTS.some((x) => n.endsWith(x)),
    (n) => n.endsWith(".html") || n.endsWith(".htm"),
    (n) => n.endsWith(".py") || n.endsWith(".js"),
  ];
  for (const cat of cats) {
    const matches = lower.filter(([, n]) => cat(n));
    if (matches.length) {
      matches.sort((a, b) => a[0].split("/").length - b[0].split("/").length || a[0].length - b[0].length);
      return matches[0][0];
    }
  }
  // fallback: shortest file
  if (!files.length) return null;
  return [...files].sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length)[0];
}

function inlineHtml(html: string, base: string, blobs: Map<string, string>): string {
  const baseDir = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "";
  const resolve = (rel: string): string | null => {
    if (/^(https?:|data:|blob:|#|mailto:|javascript:)/i.test(rel)) return null;
    let path = rel.split("?")[0].split("#")[0];
    if (path.startsWith("/")) path = path.slice(1);
    else path = baseDir + path;
    // normalize ../
    const parts: string[] = [];
    for (const seg of path.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    const key = parts.join("/");
    return blobs.get(key) ?? null;
  };
  let out = html.replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi, (m, attr, q, val) => {
    const r = resolve(val);
    return r ? `${attr}=${q}${r}${q}` : m;
  });
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, val) => {
    const r = resolve(val);
    return r ? `url(${q}${r}${q})` : m;
  });
  return out;
}

export async function runZip(file: File): Promise<RunResult> {
  const zip = await JSZip.loadAsync(file);
  const entries: { name: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir) entries.push({ name: path, entry });
  });
  if (!entries.length) return { kind: "empty" };

  const names = entries.map((e) => e.name);
  const main = pickMain(names);
  if (!main) return { kind: "empty" };
  const mainEntry = entries.find((e) => e.name === main)!;
  const lower = main.toLowerCase();

  // Download types
  if (DOWNLOAD_EXTS.some((x) => lower.endsWith(x))) {
    const blob = await mainEntry.entry.async("blob");
    const url = URL.createObjectURL(new Blob([blob], { type: mimeFor(main) }));
    return { kind: "download", url, filename: main.split("/").pop()!, mainName: main };
  }

  // Script types -> AI preview
  if (lower.endsWith(".py")) {
    const code = await mainEntry.entry.async("string");
    return { kind: "script", code, language: "python", mainName: main };
  }
  if (lower.endsWith(".js")) {
    const code = await mainEntry.entry.async("string");
    return { kind: "script", code, language: "javascript", mainName: main };
  }

  // HTML / PHP -> render
  if (lower.endsWith(".html") || lower.endsWith(".htm") || lower.endsWith(".php")) {
    // Build blob URL map for assets
    const blobs = new Map<string, string>();
    await Promise.all(
      entries.map(async (e) => {
        if (e.name === main) return;
        const data = await e.entry.async("blob");
        const url = URL.createObjectURL(new Blob([data], { type: mimeFor(e.name) }));
        blobs.set(e.name, url);
      }),
    );
    let html = await mainEntry.entry.async("string");
    html = inlineHtml(html, main, blobs);
    return { kind: "html", srcDoc: html, mainName: main };
  }

  // Fallback: download whatever it is
  const blob = await mainEntry.entry.async("blob");
  const url = URL.createObjectURL(new Blob([blob], { type: mimeFor(main) }));
  return { kind: "download", url, filename: main.split("/").pop()!, mainName: main };
}

export function offlineScriptPreview(code: string, language: string, filename: string): string {
  const safe = code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui;background:#0f172a;color:#e2e8f0;padding:24px}
  h1{color:#22d3ee;font-size:18px;margin:0 0 12px;font-weight:600}
  .meta{color:#64748b;font-size:12px;margin-bottom:16px}
  pre{background:#020617;border:1px solid #1e293b;border-radius:8px;padding:16px;overflow:auto;font-size:13px;line-height:1.5}
</style></head><body>
<h1>${filename}</h1>
<div class="meta">${language} · Vorschau</div>
<pre>${safe}</pre>
</body></html>`;
}
