import JSZip from "jszip";

export type RunResult =
  | { kind: "html"; srcDoc: string; mainName: string }
  | {
      kind: "simulate";
      mainName: string;
      fileKind: string;
      fileList: string[];
      textSamples: { name: string; content: string }[];
    }
  | { kind: "empty" };

const HTML_NAMES = ["index.html", "index.htm", "index.php"];
const SCRIPT_NAMES = ["main.py", "app.py", "app.js", "index.js", "main.js"];
const BINARY_EXTS = [".apk", ".exe", ".jar", ".msi", ".dmg", ".ipa", ".deb", ".so", ".dll", ".bin"];
const TEXT_EXTS = [
  "txt", "md", "rst", "json", "yml", "yaml", "toml", "ini", "cfg", "conf",
  "py", "js", "ts", "tsx", "jsx", "java", "kt", "kts", "go", "rs", "c", "cpp", "h", "hpp",
  "cs", "rb", "php", "swift", "m", "sh", "bat", "ps1", "css", "scss", "html", "htm", "xml",
  "gradle", "properties", "lock", "env", "gitignore", "dockerfile",
];

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

function isTextFile(name: string) {
  const e = ext(name);
  const base = name.split("/").pop()!.toLowerCase();
  return TEXT_EXTS.includes(e) || base === "readme" || base === "license" || base === "makefile" || base === "dockerfile";
}

function pickMain(files: string[]): string | null {
  const lower = files.map((f) => [f, f.toLowerCase()] as const);
  const cats: ((n: string) => boolean)[] = [
    (n) => HTML_NAMES.some((x) => n.endsWith("/" + x) || n === x),
    (n) => SCRIPT_NAMES.some((x) => n.endsWith("/" + x) || n === x),
    (n) => BINARY_EXTS.some((x) => n.endsWith(x)),
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
    const parts: string[] = [];
    for (const seg of path.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return blobs.get(parts.join("/")) ?? null;
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

function classify(main: string): string {
  const l = main.toLowerCase();
  if (l.endsWith(".apk")) return "Android-App (APK)";
  if (l.endsWith(".ipa")) return "iOS-App (IPA)";
  if (l.endsWith(".exe") || l.endsWith(".msi")) return "Windows-Programm";
  if (l.endsWith(".dmg")) return "macOS-Programm";
  if (l.endsWith(".jar")) return "Java-Programm";
  if (l.endsWith(".deb")) return "Linux-Paket";
  if (l.endsWith(".py")) return "Python-Skript";
  if (l.endsWith(".js")) return "JavaScript-Skript";
  return "Programm";
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

  // Render real HTML
  if (lower.endsWith(".html") || lower.endsWith(".htm") || lower.endsWith(".php")) {
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

  // For everything else (scripts, apk, exe, jar…): collect context for AI simulation
  // Read text files (README, manifest, source) up to a budget
  const textCandidates = entries
    .filter((e) => isTextFile(e.name))
    .sort((a, b) => {
      const score = (n: string) => {
        const b = n.toLowerCase();
        if (b.includes("readme")) return 0;
        if (b.includes("manifest")) return 1;
        if (b === main.toLowerCase()) return 2;
        return 5;
      };
      return score(a.name) - score(b.name);
    });

  const textSamples: { name: string; content: string }[] = [];
  let budget = 18000;
  for (const e of textCandidates) {
    if (budget <= 0) break;
    try {
      const txt = await e.entry.async("string");
      const slice = txt.slice(0, Math.min(budget, 6000));
      if (slice.trim()) {
        textSamples.push({ name: e.name, content: slice });
        budget -= slice.length;
      }
    } catch {
      // ignore binary
    }
  }

  return {
    kind: "simulate",
    mainName: main,
    fileKind: classify(main),
    fileList: names.slice(0, 200),
    textSamples,
  };
}

export function offlineSimulation(
  mainName: string,
  fileKind: string,
  fileList: string[],
): string {
  const filename = mainName.split("/").pop()!;
  const fl = fileList
    .slice(0, 40)
    .map((f) => `<li>${f.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</li>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui;background:#0f172a;color:#e2e8f0;padding:32px;line-height:1.6}
  .card{max-width:680px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px}
  h1{color:#22d3ee;font-size:22px;margin:0 0 4px}
  .kind{color:#94a3b8;font-size:13px;margin-bottom:24px}
  h2{font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin:24px 0 8px}
  ul{margin:0;padding-left:20px;font-size:13px;color:#cbd5e1}
  li{margin:2px 0}
  .hint{margin-top:24px;padding:16px;background:#0f172a;border-radius:8px;font-size:13px;color:#94a3b8}
</style></head><body>
<div class="card">
  <h1>${filename}</h1>
  <div class="kind">${fileKind}</div>
  <h2>Inhalt der ZIP</h2>
  <ul>${fl}</ul>
  <div class="hint">Interaktive Vorschau gerade nicht verfügbar. Versuch es gleich nochmal.</div>
</div>
</body></html>`;
}
