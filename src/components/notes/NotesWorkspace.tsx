"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ModeToggle } from "@/components/ui/toogle";
import { createUserNote, deleteUserNote, updateUserNote } from "@/app/actions";

type PersonalNote = {
  id: string;
  title: string;
  content: string;
  fontSize: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function stripHtml(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortByUpdatedAt(notes: PersonalNote[]) {
  return [...notes].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() -
      new Date(a.updatedAt).getTime()
  );
}

function formatDate(value: string | Date) {
  const dt = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function clearInlineFontSizes(root: HTMLElement) {
  const styled = root.querySelectorAll<HTMLElement>("[style]");
  styled.forEach((el) => {
    el.style.removeProperty("font-size");
    if (!el.getAttribute("style")?.trim()) {
      el.removeAttribute("style");
    }
  });

  const fontTags = root.querySelectorAll("font[size]");
  fontTags.forEach((el) => el.removeAttribute("size"));
}

export default function NotesWorkspace({
  initialNotes,
}: {
  initialNotes: PersonalNote[];
}) {
  const [notes, setNotes] = useState<PersonalNote[]>(sortByUpdatedAt(initialNotes));
  const [selectedId, setSelectedId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [draftTitle, setDraftTitle] = useState<string>(initialNotes[0]?.title ?? "");
  const [draftContent, setDraftContent] = useState<string>(initialNotes[0]?.content ?? "");
  const [draftFontSize, setDraftFontSize] = useState<number>(initialNotes[0]?.fontSize ?? 16);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  const editorRef = React.useRef<HTMLDivElement | null>(null);

  const loadDraft = useCallback((note: PersonalNote | null) => {
    if (!note) {
      setDraftTitle("");
      setDraftContent("");
      setDraftFontSize(16);
      if (editorRef.current) editorRef.current.innerHTML = "";
      return;
    }

    setDraftTitle(note.title ?? "");
    setDraftContent(note.content ?? "");
    setDraftFontSize(note.fontSize ?? 16);
    if (editorRef.current) {
      editorRef.current.innerHTML = note.content ?? "";
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = initialNotes[0]?.content ?? "";
  }, [initialNotes]);

  const persistDraft = useCallback(
    async (noteId: string, title: string, content: string, fontSize: number) => {
      const normalized = {
        title: title.trim() || "Nueva nota",
        content,
        fontSize: Math.min(40, Math.max(12, Math.round(fontSize))),
      };

      setNotes((prev) =>
        sortByUpdatedAt(
          prev.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  title: normalized.title,
                  content: normalized.content,
                  fontSize: normalized.fontSize,
                  updatedAt: new Date().toISOString(),
                }
              : n
          )
        )
      );

      try {
        const saved = await updateUserNote(noteId, normalized);
        setNotes((prev) =>
          sortByUpdatedAt(prev.map((n) => (n.id === noteId ? saved : n)))
        );
      } catch {
        // Si falla, mantenemos UI local y el siguiente guardado vuelve a intentar.
      }
    },
    []
  );

  const saveCurrentNote = useCallback(() => {
    if (!selectedId) return;
    startTransition(async () => {
      await persistDraft(selectedId, draftTitle, draftContent, draftFontSize);
    });
  }, [selectedId, draftTitle, draftContent, draftFontSize, persistDraft]);

  const selectNote = useCallback(
    (note: PersonalNote) => {
      setSelectedId(note.id);
      loadDraft(note);
    },
    [loadDraft]
  );

  const handleCreate = useCallback(() => {
    startTransition(async () => {
      const created = await createUserNote();
      setNotes((prev) => sortByUpdatedAt([created, ...prev]));
      setSelectedId(created.id);
      loadDraft(created);
    });
  }, [loadDraft]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;

    const remaining = notes.filter((n) => n.id !== selectedId);
    const nextSelected = remaining[0] ?? null;

    setNotes(remaining);
    setSelectedId(nextSelected?.id ?? null);
    loadDraft(nextSelected);

    startTransition(async () => {
      try {
        await deleteUserNote(selectedId);
      } catch {
        // En caso de error, el usuario puede refrescar y reintentar.
      }
    });
  }, [notes, selectedId, loadDraft]);

  const applyCommand = useCallback((command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    const html = editorRef.current.innerHTML;
    setDraftContent(html);
  }, []);

  const changeFontSize = useCallback((nextSize: number) => {
    const normalized = Math.min(40, Math.max(12, nextSize));
    setDraftFontSize(normalized);
    if (editorRef.current) {
      clearInlineFontSizes(editorRef.current);
      setDraftContent(editorRef.current.innerHTML);
    }
  }, []);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-stone-200 dark:border-neutral-700 bg-stone-100/90 dark:bg-neutral-900/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 py-3 flex items-center gap-2">
          <Link
            href="/"
            className="px-3 py-2 rounded-xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          >
            Inicio
          </Link>
          <Link
            href="/tasks"
            className="px-3 py-2 rounded-xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          >
            Tareas
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              title="Crear nota"
              onClick={handleCreate}
              className="size-10 rounded-xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xl leading-none"
              disabled={isPending}
            >
              +
            </button>
            <button
              type="button"
              title="Eliminar nota"
              onClick={handleDelete}
              className="size-10 rounded-xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-lg leading-none"
              disabled={isPending || !selectedId}
            >
              Del
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3 py-2 rounded-xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            >
              Salir
            </button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-76px)]">
        <aside className="rounded-2xl border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-stone-200 dark:border-neutral-700 font-semibold">
            Notas
          </div>

          <div className="overflow-y-auto">
            {notes.map((note) => {
              const preview = stripHtml(note.content).slice(0, 80) || "Sin contenido";
              return (
                <button
                  key={note.id}
                  onClick={() => selectNote(note)}
                  className={`w-full text-left px-4 py-3 border-b border-stone-100 dark:border-neutral-700 hover:bg-stone-50 dark:hover:bg-neutral-700/60 transition ${
                    selectedId === note.id ? "bg-stone-100 dark:bg-neutral-700" : ""
                  }`}
                >
                  <div className="font-medium truncate">{note.title || "Nueva nota"}</div>
                  <div className="text-xs text-stone-500 dark:text-neutral-400 truncate mt-0.5">{preview}</div>
                  <div className="text-[11px] text-stone-400 dark:text-neutral-500 mt-1">
                    {formatDate(note.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-2xl border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex flex-col min-h-0">
          {!selected ? (
            <div className="m-auto text-stone-500 dark:text-neutral-400">
              Crea una nota para comenzar.
            </div>
          ) : (
            <>
              <div className="px-4 sm:px-6 py-3 border-b border-stone-200 dark:border-neutral-700 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyCommand("bold")}
                  className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-neutral-700"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand("italic")}
                  className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-neutral-700 italic"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand("underline")}
                  className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-neutral-700 underline"
                >
                  U
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeFontSize(draftFontSize - 1)}
                    className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-neutral-700"
                  >
                    A-
                  </button>
                  <span className="text-sm text-stone-500 dark:text-neutral-300 min-w-10 text-center">
                    {draftFontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={() => changeFontSize(draftFontSize + 1)}
                    className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-neutral-700"
                  >
                    A+
                  </button>
                </div>
              </div>

              <div className="px-4 sm:px-6 py-4 border-b border-stone-200 dark:border-neutral-700">
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCurrentNote();
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Título"
                  className="w-full text-2xl sm:text-3xl font-semibold bg-transparent outline-none"
                />
              </div>

              <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-5">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setDraftContent(e.currentTarget.innerHTML)}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData("text/plain");
                    document.execCommand("insertText", false, text);
                    if (editorRef.current) {
                      setDraftContent(editorRef.current.innerHTML);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Tab") {
                      e.preventDefault();
                      if (e.shiftKey) {
                        document.execCommand("outdent");
                      } else {
                        document.execCommand("insertText", false, "    ");
                      }
                      if (editorRef.current) {
                        setDraftContent(editorRef.current.innerHTML);
                      }
                      return;
                    }

                    if (e.key !== "Enter") return;

                    if (e.metaKey || e.ctrlKey) {
                      e.preventDefault();
                      saveCurrentNote();
                      return;
                    }

                    e.preventDefault();
                    document.execCommand("insertLineBreak");
                    if (editorRef.current) {
                      setDraftContent(editorRef.current.innerHTML);
                    }
                  }}
                  style={{ fontSize: `${draftFontSize}px` }}
                  className="note-editor min-h-[52vh] outline-none leading-relaxed"
                  data-placeholder="Escribe tu nota aquí..."
                />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
