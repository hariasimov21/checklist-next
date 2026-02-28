"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ModeToggle } from "@/components/ui/toogle";
import {
  createUserNote,
  createUserNoteFolder,
  deleteUserNote,
  deleteUserNoteFolder,
  moveUserNoteToFolder,
  renameUserNoteFolder,
  updateUserNote,
} from "@/app/actions";

type PersonalFolder = {
  id: string;
  name: string;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type PersonalNote = {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  fontSize: number;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const UNCATEGORIZED = "__uncategorized__";

function stripHtml(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("No se pudo leer la imagen pegada"));
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen pegada"));
    reader.readAsDataURL(blob);
  });
}

function insertImageAsLine(editor: HTMLDivElement, src: string) {
  editor.focus();

  const selection = window.getSelection();
  if (!selection) return;
  if (selection.rangeCount === 0) {
    const endRange = document.createRange();
    endRange.selectNodeContents(editor);
    endRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(endRange);
  }

  const range = selection.getRangeAt(0);
  const line = document.createElement("div");
  line.className = "note-image-line";
  line.setAttribute("contenteditable", "false");

  const wrapper = document.createElement("div");
  wrapper.className = "note-image-wrapper";
  wrapper.setAttribute("data-note-image-wrapper", "true");
  wrapper.style.width = "420px";

  const image = document.createElement("img");
  image.src = src;
  image.alt = "Imagen pegada";
  image.className = "note-inline-image";
  wrapper.appendChild(image);

  const handlePositions = ["nw", "ne", "sw", "se"] as const;
  handlePositions.forEach((pos) => {
    const handle = document.createElement("span");
    handle.className = `note-image-handle note-image-handle-${pos}`;
    handle.setAttribute("data-note-image-handle", pos);
    wrapper.appendChild(handle);
  });

  line.appendChild(wrapper);

  const spacer = document.createElement("div");
  spacer.appendChild(document.createElement("br"));

  range.deleteContents();
  range.insertNode(spacer);
  range.insertNode(line);

  const nextRange = document.createRange();
  nextRange.setStart(spacer, 0);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function sortFolders(items: PersonalFolder[]) {
  return [...items].sort((a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function sortNotesInFolder(items: PersonalNote[]) {
  return [...items].sort((a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function reindexFolderNotes(items: PersonalNote[], folderId: string | null) {
  const ordered = sortNotesInFolder(items.filter((n) => n.folderId === folderId));
  const nextPosById = new Map(ordered.map((n, idx) => [n.id, idx]));
  return items.map((n) => {
    if (n.folderId !== folderId) return n;
    const pos = nextPosById.get(n.id);
    return pos === undefined ? n : { ...n, position: pos };
  });
}

export default function NotesWorkspace({
  initialNotes,
  initialFolders,
}: {
  initialNotes: PersonalNote[];
  initialFolders: PersonalFolder[];
}) {
  const [folders, setFolders] = useState<PersonalFolder[]>(sortFolders(initialFolders));
  const [notes, setNotes] = useState<PersonalNote[]>(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialNotes[0]?.folderId ?? null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState<string>("");
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [draftTitle, setDraftTitle] = useState<string>(initialNotes[0]?.title ?? "");
  const [draftContent, setDraftContent] = useState<string>(initialNotes[0]?.content ?? "");
  const [draftFontSize, setDraftFontSize] = useState<number>(initialNotes[0]?.fontSize ?? 16);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  const visibleNotes = useMemo(
    () => sortNotesInFolder(notes.filter((n) => n.folderId === selectedFolderId)),
    [notes, selectedFolderId]
  );

  const folderCountById = useMemo(() => {
    const countMap = new Map<string | null, number>();
    notes.forEach((n) => {
      countMap.set(n.folderId, (countMap.get(n.folderId) ?? 0) + 1);
    });
    return countMap;
  }, [notes]);

  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const titleScrollRef = React.useRef<HTMLDivElement | null>(null);
  const initialContentRef = React.useRef<string>(initialNotes[0]?.content ?? "");
  const selectedImageRef = React.useRef<HTMLElement | null>(null);
  const dragStateRef = React.useRef<{
    wrapper: HTMLElement;
    handle: string;
    startX: number;
    startY: number;
    startWidth: number;
    maxWidth: number;
  } | null>(null);

  const clearSelectedImage = useCallback(() => {
    if (selectedImageRef.current) {
      selectedImageRef.current.classList.remove("note-image-selected");
    }
    selectedImageRef.current = null;
  }, []);

  const selectImage = useCallback((wrapper: HTMLElement | null) => {
    if (selectedImageRef.current === wrapper) return;
    if (selectedImageRef.current) {
      selectedImageRef.current.classList.remove("note-image-selected");
    }
    selectedImageRef.current = wrapper;
    if (wrapper) {
      wrapper.classList.add("note-image-selected");
    }
  }, []);

  const loadDraft = useCallback((note: PersonalNote | null) => {
    clearSelectedImage();
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
  }, [clearSelectedImage]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = initialContentRef.current;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      const dxRaw = e.clientX - drag.startX;
      const dyRaw = e.clientY - drag.startY;

      const dx = drag.handle.includes("w") ? -dxRaw : dxRaw;
      const dy = drag.handle.includes("n") ? -dyRaw : dyRaw;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;

      const nextWidth = Math.max(180, Math.min(drag.maxWidth, drag.startWidth + delta));
      drag.wrapper.style.width = `${Math.round(nextWidth)}px`;
    };

    const onMouseUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      document.body.style.userSelect = "";
      if (editorRef.current) {
        setDraftContent(editorRef.current.innerHTML);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => () => {
    clearSelectedImage();
  }, [clearSelectedImage]);

  useEffect(() => {
    if (!previewImageSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImageSrc(null);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key;
      if (key === "+" || key === "=") {
        e.preventDefault();
        setPreviewZoom((prev) => Math.min(4, +(prev + 0.1).toFixed(2)));
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        setPreviewZoom((prev) => Math.max(0.3, +(prev - 0.1).toFixed(2)));
      } else if (key === "0") {
        e.preventDefault();
        setPreviewZoom(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImageSrc]);

  useEffect(() => {
    if (!previewImageSrc) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [previewImageSrc]);

  useEffect(() => {
    if (!visibleNotes.length) {
      setSelectedId(null);
      loadDraft(null);
      return;
    }

    const stillVisible = selectedId && visibleNotes.some((n) => n.id === selectedId);
    if (stillVisible) return;

    const first = visibleNotes[0];
    setSelectedId(first.id);
    loadDraft(first);
  }, [visibleNotes, selectedId, loadDraft]);

  const persistDraft = useCallback(
    async (noteId: string, title: string, content: string, fontSize: number) => {
      const normalized = {
        title: title.trim() || "Nueva nota",
        content,
        fontSize: Math.min(40, Math.max(12, Math.round(fontSize))),
      };

      setNotes((prev) =>
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
      );

      try {
        const saved = await updateUserNote(noteId, normalized);
        setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...saved } : n)));
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
      setSelectedFolderId(note.folderId ?? null);
      setSelectedId(note.id);
      loadDraft(note);
    },
    [loadDraft]
  );

  const selectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
  }, []);

  const handleCreateFolder = useCallback(() => {
    startTransition(async () => {
      try {
        const created = await createUserNoteFolder();
        setFolders((prev) => sortFolders([...prev, created]));
        setSelectedFolderId(created.id);
      } catch {
        // Si falla, no rompemos la UI.
      }
    });
  }, []);

  const handleDeleteFolder = useCallback((folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    if (!window.confirm(`Eliminar carpeta \"${folder.name}\"? Sus notas quedarán en \"Sin carpeta\".`)) {
      return;
    }

    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setNotes((prev) =>
      reindexFolderNotes(
        prev.map((n) => (n.folderId === folderId ? { ...n, folderId: null } : n)),
        null
      )
    );
    if (selectedFolderId === folderId) setSelectedFolderId(null);

    startTransition(async () => {
      try {
        await deleteUserNoteFolder(folderId);
      } catch {
        // Si falla, se puede refrescar para recuperar estado real.
      }
    });
  }, [folders, selectedFolderId]);

  const startFolderRename = useCallback((folderId: string, currentName: string) => {
    setSelectedFolderId(folderId);
    setEditingFolderId(folderId);
    setEditingFolderName(currentName);
  }, []);

  const commitFolderRename = useCallback((folderId: string) => {
    const trimmed = editingFolderName.trim();
    const original = folders.find((f) => f.id === folderId)?.name ?? "";
    const nextName = trimmed || original;

    setEditingFolderId(null);
    setEditingFolderName("");
    if (!trimmed || nextName === original) return;

    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: nextName } : f)));
    startTransition(async () => {
      try {
        const saved = await renameUserNoteFolder(folderId, nextName);
        setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...saved } : f)));
      } catch {
        setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: original } : f)));
      }
    });
  }, [editingFolderName, folders]);

  const handleCreate = useCallback(() => {
    startTransition(async () => {
      const created = await createUserNote(selectedFolderId);
      setNotes((prev) => [...prev, created]);
      setSelectedId(created.id);
      setSelectedFolderId(created.folderId ?? null);
      loadDraft(created);
    });
  }, [selectedFolderId, loadDraft]);

  const handleDeleteNote = useCallback((noteId: string) => {
    const remaining = notes.filter((n) => n.id !== noteId);
    setNotes(remaining);

    startTransition(async () => {
      try {
        await deleteUserNote(noteId);
      } catch {
        // En caso de error, el usuario puede refrescar y reintentar.
      }
    });
  }, [notes]);

  const handleMoveToFolder = useCallback((noteId: string, rawFolderId: string) => {
    const targetFolderId = rawFolderId === UNCATEGORIZED ? null : rawFolderId;
    const moving = notes.find((n) => n.id === noteId);
    if (!moving || moving.folderId === targetFolderId) return;

    setNotes((prev) => {
      const oldFolderId = moving.folderId;
      const targetMax = Math.max(-1, ...prev.filter((n) => n.folderId === targetFolderId).map((n) => n.position));
      const moved = prev.map((n) =>
        n.id === noteId ? { ...n, folderId: targetFolderId, position: targetMax + 1 } : n
      );
      const oldReindexed = reindexFolderNotes(moved, oldFolderId);
      return reindexFolderNotes(oldReindexed, targetFolderId);
    });

    setSelectedFolderId(targetFolderId);

    startTransition(async () => {
      try {
        await moveUserNoteToFolder(noteId, targetFolderId);
      } catch {
        // Si falla, refrescar vuelve al estado persistido.
      }
    });
  }, [notes]);

  const applyCommand = useCallback((command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    setDraftContent(editorRef.current.innerHTML);
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
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3 py-2 rounded-xl border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            >
              Salir
            </button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 grid grid-cols-1 lg:grid-cols-[150px_240px_minmax(0,1fr)] gap-4 h-auto lg:h-[calc(100vh-76px)]">
        <aside className="rounded-2xl border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden flex flex-col min-h-[220px] lg:min-h-0">
          <div className="px-4 py-3 border-b border-stone-200 dark:border-neutral-700 font-semibold flex items-center justify-between">
            <span>Carpetas</span>
            <button
              type="button"
              onClick={handleCreateFolder}
              className="px-2 py-1 rounded-lg border border-stone-300 dark:border-neutral-700 text-xs"
            >
              +
            </button>
          </div>

          <div className="overflow-y-auto border-b border-stone-200 dark:border-neutral-700 max-h-56">
            <button
              type="button"
              onClick={() => selectFolder(null)}
              className={`w-full text-left px-4 py-2 text-sm border-b border-stone-100 dark:border-neutral-700 hover:bg-stone-50 dark:hover:bg-neutral-700/60 ${
                selectedFolderId === null ? "bg-stone-100 dark:bg-neutral-700" : ""
              }`}
            >
              Sin carpeta ({folderCountById.get(null) ?? 0})
            </button>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`border-b border-stone-100 dark:border-neutral-700 ${
                  selectedFolderId === folder.id ? "bg-stone-100 dark:bg-neutral-700" : ""
                }`}
              >
                {editingFolderId === folder.id ? (
                  <div className="px-3 pt-2">
                    <input
                      autoFocus
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onBlur={() => commitFolderRename(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitFolderRename(folder.id);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingFolderId(null);
                          setEditingFolderName("");
                        }
                      }}
                      className="w-full rounded-md border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectFolder(folder.id)}
                    onDoubleClick={() => startFolderRename(folder.id, folder.name)}
                    className="w-full text-left px-4 pt-2 text-sm hover:bg-stone-50 dark:hover:bg-neutral-700/60"
                    title="Doble click para renombrar"
                  >
                    {folder.name} ({folderCountById.get(folder.id) ?? 0})
                  </button>
                )}
                <div className="px-4 pb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="text-[11px] text-stone-500 hover:text-red-600"
                  >
                    eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <aside className="rounded-2xl border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden flex flex-col min-h-[260px] lg:min-h-0">
          <div className="px-4 py-3 border-b border-stone-200 dark:border-neutral-700 font-semibold flex items-center justify-between">
            <span>Notas</span>
            <button
              type="button"
              title="Crear nota"
              onClick={handleCreate}
              className="px-2 py-1 rounded-lg border border-stone-300 dark:border-neutral-700 text-xs"
              disabled={isPending}
            >
              +
            </button>
          </div>

          <div className="overflow-y-auto overflow-x-hidden">
            {visibleNotes.map((note) => {
              const preview = stripHtml(note.content).slice(0, 80) || "Sin contenido";

              return (
                <div
                  key={note.id}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className={`w-full text-left px-3 py-2 border-b border-stone-100 dark:border-neutral-700 transition ${
                    selectedId === note.id ? "bg-stone-100 dark:bg-neutral-700" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      className="w-full min-w-0 text-left hover:bg-stone-50 dark:hover:bg-neutral-700/60 rounded-md px-1 py-1"
                      onClick={() => selectNote(note)}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      <div className="font-medium truncate">{note.title || "Nueva nota"}</div>
                      <div className="text-xs text-stone-500 dark:text-neutral-400 truncate mt-0.5">{preview}</div>
                      <div className="mt-1 text-[11px] text-stone-400 dark:text-neutral-500 truncate">
                        {formatDate(note.updatedAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Eliminar nota"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="mt-10 shrink-0 px-2 py-0.5 rounded-md border border-stone-300 dark:border-neutral-700 text-sm leading-none hover:text-red-600"
                      disabled={isPending}
                    >
                      -
                    </button>
                  </div>
                </div>
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

                <select
                  value={selected.folderId ?? UNCATEGORIZED}
                  onChange={(e) => handleMoveToFolder(selected.id, e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-stone-300 dark:border-neutral-700 bg-transparent text-sm"
                >
                  <option value={UNCATEGORIZED}>Sin carpeta</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>

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
                <div
                  ref={titleScrollRef}
                  onWheel={(e) => {
                    const el = titleScrollRef.current;
                    if (!el) return;
                    const canScrollX = el.scrollWidth > el.clientWidth;
                    if (!canScrollX) return;
                    e.preventDefault();
                    el.scrollLeft += e.deltaY;
                  }}
                  className="overflow-x-auto overflow-y-hidden hide-scrollbar"
                >
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
                    className="w-max min-w-full whitespace-nowrap text-2xl sm:text-3xl font-semibold bg-transparent outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-5">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setDraftContent(e.currentTarget.innerHTML)}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    const wrapper = target.closest("[data-note-image-wrapper]") as HTMLElement | null;
                    selectImage(wrapper);
                  }}
                  onDoubleClick={(e) => {
                    const target = e.target as HTMLElement;
                    const image = target.closest("img.note-inline-image") as HTMLImageElement | null;
                    if (!image?.src) return;
                    e.preventDefault();
                    setPreviewZoom(1);
                    setPreviewImageSrc(image.src);
                  }}
                  onMouseDown={(e) => {
                    const target = e.target as HTMLElement;
                    const handle = target.getAttribute("data-note-image-handle");
                    if (!handle) return;

                    const wrapper = target.closest("[data-note-image-wrapper]") as HTMLElement | null;
                    const editor = editorRef.current;
                    if (!wrapper || !editor) return;

                    e.preventDefault();
                    e.stopPropagation();
                    selectImage(wrapper);

                    const wrapperRect = wrapper.getBoundingClientRect();
                    const editorRect = editor.getBoundingClientRect();
                    dragStateRef.current = {
                      wrapper,
                      handle,
                      startX: e.clientX,
                      startY: e.clientY,
                      startWidth: wrapperRect.width,
                      maxWidth: Math.max(180, editorRect.width - 24),
                    };

                    document.body.style.userSelect = "none";
                  }}
                  onPaste={async (e) => {
                    const items = Array.from(e.clipboardData.items);
                    const imageItem = items.find((item) => item.type.startsWith("image/"));

                    if (imageItem) {
                      e.preventDefault();
                      const imageFile = imageItem.getAsFile();
                      if (!imageFile || !editorRef.current) return;

                      try {
                        const dataUrl = await blobToDataUrl(imageFile);
                        insertImageAsLine(editorRef.current, dataUrl);
                        setDraftContent(editorRef.current.innerHTML);
                      } catch {
                        // Si falla lectura, no insertamos nada.
                      }
                      return;
                    }

                    e.preventDefault();
                    const text = e.clipboardData.getData("text/plain");
                    document.execCommand("insertText", false, text);
                    if (editorRef.current) {
                      setDraftContent(editorRef.current.innerHTML);
                    }
                  }}
                  onKeyDown={(e) => {
                    const selectedImage = selectedImageRef.current;
                    if (selectedImage && (e.key === "Backspace" || e.key === "Delete")) {
                      e.preventDefault();
                      const line = selectedImage.closest(".note-image-line");
                      line?.remove();
                      clearSelectedImage();
                      if (editorRef.current) {
                        setDraftContent(editorRef.current.innerHTML);
                      }
                      return;
                    }

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

      {previewImageSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-4 flex items-center justify-center"
          onClick={() => {
            setPreviewImageSrc(null);
            setPreviewZoom(1);
          }}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            setPreviewZoom((prev) => Math.max(0.3, Math.min(4, +(prev + delta).toFixed(2))));
          }}
        >
          <div
            className="relative w-full h-full overflow-auto hide-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setPreviewImageSrc(null);
                setPreviewZoom(1);
              }}
              className="fixed top-6 right-6 z-10 size-9 rounded-full border border-white/50 bg-black/70 text-white text-lg leading-none"
              aria-label="Cerrar vista previa"
            >
              ×
            </button>
            <div className="w-full h-full min-w-max min-h-max flex items-center justify-center p-6">
              <img
                src={previewImageSrc}
                alt="Vista ampliada"
                className="block max-w-none max-h-none rounded-lg"
                style={{ transform: `scale(${previewZoom})`, transformOrigin: "center center" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
