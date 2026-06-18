import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { runZip, offlineSimulation, type RunResult } from "@/lib/zip-runner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZipRunner" },
      { name: "description", content: "ZIP rein, interaktive Vorschau raus." },
    ],
  }),
  component: Index,
});

type View =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "result"; result: RunResult; srcDoc?: string };

function Index() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setView({ kind: "loading", label: "Entpacken…" });
    try {
      const result = await runZip(file);
      if (result.kind === "html") {
        setView({ kind: "result", result, srcDoc: result.srcDoc });
      } else if (result.kind === "simulate") {
        setView({ kind: "loading", label: "Baue interaktive Vorschau…" });
        let html: string;
        try {
          const res = await fetch("/api/ai/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mainName: result.mainName,
              fileKind: result.fileKind,
              fileList: result.fileList,
              textSamples: result.textSamples,
            }),
          });
          if (!res.ok) throw new Error("ai");
          html = await res.text();
          if (!/^<!?\s*doctype|<html/i.test(html.trim())) throw new Error("badhtml");
        } catch {
          html = offlineSimulation(result.mainName, result.fileKind, result.fileList);
        }
        setView({ kind: "result", result, srcDoc: html });
      } else {
        setView({ kind: "result", result });
      }
    } catch {
      setView({ kind: "result", result: { kind: "empty" } });
    }
  }, []);

  useEffect(() => {
    const onDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", onDrag);
    window.addEventListener("drop", onDrag);
    return () => {
      window.removeEventListener("dragover", onDrag);
      window.removeEventListener("drop", onDrag);
    };
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => setView({ kind: "idle" });

  if (view.kind === "result" && view.srcDoc) {
    const name = view.result.kind === "empty" ? "" : view.result.mainName;
    return (
      <div className="flex h-screen w-screen flex-col bg-slate-950">
        <Topbar name={name} onReset={reset} />
        <iframe
          title="Vorschau"
          srcDoc={view.srcDoc}
          className="h-full w-full flex-1 border-0 bg-white"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
        />
      </div>
    );
  }

  if (view.kind === "result" && view.result.kind === "empty") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-100">
        <Topbar name="" onReset={reset} />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 text-5xl opacity-50">∅</div>
          <p className="text-slate-400">ZIP ist leer</p>
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Neue ZIP
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div
        onDragEnter={() => setDrag(true)}
        onDragLeave={() => setDrag(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "flex w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition",
          drag ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-slate-900/50 hover:border-cyan-500/60 hover:bg-slate-900",
          view.kind === "loading" ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <div className="mb-6 text-6xl">{view.kind === "loading" ? "⏳" : "📁"}</div>
        <h1 className="text-3xl font-bold tracking-tight">ZipRunner</h1>
        <p className="mt-3 max-w-md text-sm text-slate-400">
          {view.kind === "loading"
            ? view.label
            : "ZIP hier ablegen oder klicken. Du siehst sofort, wie es funktioniert — als interaktive Vorschau, kein Code."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
    </div>
  );
}

function Topbar({ name, onReset }: { name: string; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-semibold text-cyan-400">ZipRunner</span>
        {name && <span className="truncate">· {name}</span>}
      </div>
      <button
        onClick={onReset}
        className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
      >
        Neue ZIP
      </button>
    </div>
  );
}
