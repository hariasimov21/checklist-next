"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type Attachment = {
  id: string;
  name: string;
  url: string;   // path interno en storage (p.ej. cards/<cardId>/<uuid>-file.pdf)
  mime: string;
  size: number;
  createdAt?: string | Date;
};

export function AttachmentsBar({
  cardId,
  initial,
  onChange,
}: {
  cardId: string;
  initial?: Attachment[];
  onChange?: (list: Attachment[]) => void;
}) {
  const [list, setList] = useState<Attachment[]>(initial ?? []);
  const [preview, setPreview] = useState<{ att: Attachment; signedUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // ⛑️ Sincroniza estado interno al cambiar de tarjeta o de props.initial
  useEffect(() => {
    setList(initial ?? []);
    setPreview(null);
    // limpia el file input al cambiar de tarjeta
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [cardId, initial]);

  function pickFiles() {
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("cardId", cardId);
      Array.from(files).forEach((f) => form.append("files", f));

      const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error al subir");

      // 🛡️ Acepta distintos formatos de respuesta:
      //  - [{...},{...}]
      //  - { attachments: [...] }
      //  - { id, name, ... } (uno solo)
      const created: Attachment[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.attachments)
        ? json.attachments
        : [json];

      const next = [...created, ...list];
      setList(next);
      onChange?.(next);
    } catch (err) {
      console.error(err);
      alert("No se pudieron subir los archivos");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openPreview(att: Attachment) {
    try {
      const res = await fetch(`/api/attachments/${att.id}/signed`);
      const json = await res.json();

      if (!res.ok || !json?.signedUrl) {
        console.error("Signed URL error:", json);
        alert(json?.error || "No se pudo abrir la vista previa");
        return;
      }

      setPreview({ att, signedUrl: json.signedUrl });
    } catch (e) {
      console.error(e);
      alert("No se pudo abrir la vista previa");
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("¿Eliminar adjunto?")) return;
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      const next = list.filter((a) => a.id !== id);
      setList(next);
      onChange?.(next);
    } else {
      alert("No se pudo eliminar");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Botón + input oculto */}
      <div className="flex items-center gap-2">
        <button
          onClick={pickFiles}
          disabled={busy}
          className="px-3 py-2 rounded-xl border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
        >
          {busy ? "Subiendo..." : "Agregar archivos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />
      </div>

      {/* Chips */}
      {!!list.length && (
        <div className="flex flex-wrap gap-2">
          {list.map((att) => (
            <button
              key={att.id}
              onClick={() => openPreview(att)}
              className="group inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title={att.name}
            >
              <span className="truncate max-w-[160px]">
                {iconFor(att.mime)} {att.name}
              </span>
              <span className="text-xs opacity-60">({prettySize(att.size)})</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(att.id);
                }}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                title="Eliminar"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Dialog sencillo */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
          <button
            onClick={() => setPreview(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Cerrar"
          />
          <div className="relative z-10 max-h-[90vh] w-[min(90vw,900px)] rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-auto">
            <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="font-semibold truncate">{preview.att.name}</div>
              <button
                onClick={() => setPreview(null)}
                className="px-2 py-1 rounded border hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cerrar
              </button>
            </div>
            <div className="p-3 sm:p-4">
              <PreviewBody att={preview.att} signedUrl={preview.signedUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("zip") || mime.includes("x-zip")) return "🗜️";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "📊";
  if (mime.includes("word")) return "📝";
  return "📎";
}

function prettySize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function PreviewBody({ att, signedUrl }: { att: Attachment; signedUrl: string }) {
  const mime = att.mime;

  if (mime.startsWith("image/")) {
    return <img src={signedUrl} alt={att.name} className="max-h-[70vh] max-w-full object-contain mx-auto" loading="lazy" />;
  }
  if (mime === "application/pdf") {
    return <iframe src={signedUrl} className="w-full h-[70vh] rounded-lg border" title={att.name} />;
  }
  if (mime.startsWith("video/")) {
    return <video src={signedUrl} controls className="w-full max-h-[70vh] rounded-lg" />;
  }
  if (mime.startsWith("audio/")) {
    return <audio src={signedUrl} controls className="w-full" />;
  }
  if (mime.includes("officedocument") || mime.includes("msword") || mime.includes("excel") || mime.includes("powerpoint")) {
    return (
      <div className="p-4 text-center">
        <p className="mb-2">Este archivo no puede previsualizarse aquí.</p>
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90"
        >
          Abrir / Descargar {att.name}
        </a>
      </div>
    );
  }
  return (
    <div className="p-4 text-center">
      <p className="mb-2">Tipo de archivo no soportado para previsualización.</p>
      <a
        href={signedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90"
      >
        Descargar {att.name}
      </a>
    </div>
  );
}
