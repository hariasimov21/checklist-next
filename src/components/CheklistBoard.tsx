"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useTransition,
  useCallback,
  useRef,
} from "react";
import {
  addNote,
  toggleNote,
  editNote,
  removeNote,
  createCard, // createCard(title, boardId)
  updateCard,
  deleteCard,
  addTag,
  removeTag,
  reorderCards,
  createBoard,
  deleteBoard
} from "@/app/actions";
import { signOut } from "next-auth/react";
import { ModeToggle } from "@/components/ui/toogle";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AttachmentsBar } from "@/components/AttachmentsBar";

declare global {
  interface Window {
    ClipboardItem: typeof ClipboardItem;
  }
}

/* --------- Portapapeles --------- */
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildClipboardPayload(params: {
  title: string;
  summary?: string | null;
  items: { text: string; done?: boolean }[];
}) {
  const title = (params.title ?? "").trim();
  const summary = (params.summary ?? "").trim();
  const tit = "Titulo";
  const check = "Checklist";
  const sum = "Resumen";

  const textPlain =
    `${tit}\n` +
    `${title}\n` +
    `${sum}\n` +
    (summary ? `${summary}\n` : "") +
    `${check}\n` +
    params.items.map((i) => `* ${i.text}`).join("\n");

  const lis = params.items.map((i) => `<li>${escapeHtml(i.text)}</li>`).join("");

  const textHtml = `
    <div>
      <div style="font-size:16px; font-weight:600; margin-bottom:4px;">${escapeHtml(tit)}</div>
      <div style="font-size:14px; font-weight:600; margin-bottom:4px;">
        ${escapeHtml(title)}
      </div>
      <div style="font-size:13px; margin:6px 0 8px;">${escapeHtml(sum)}</div>
      ${summary
      ? `<div style="font-size:12px; margin:6px 0 8px;">${escapeHtml(summary)}</div>`
      : ""
    }
      <div style="font-size:13px; margin:6px 0 8px;">${escapeHtml(check)}</div>
      <ul style="padding-left:18px; margin:0;">${lis}</ul>
    </div>
  `.trim();

  return { textPlain, textHtml };
}

/* --------- Tipos locales --------- */
export type Attachment = {
  id: string;
  name: string;
  url: string;
  mime: string;
  size: number;
  createdAt?: string | Date;
};
type Note = { id: string; text: string; done: boolean };
type Card = {
  id: string;
  title: string;
  summary?: string;
  tags: string[];
  createdAt: string | Date;
  notes: Note[];
  attachments: Attachment[];
  position: number;
};
type BoardLite = { id: string; name: string };

/* --------- UI helpers --------- */
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 bg-stone-200 dark:bg-neutral-700 rounded-full overflow-hidden">
      <div
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        className="h-full transition-all bg-black dark:bg-white"
      />
    </div>
  );
}
function Chip({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 dark:bg-neutral-800 border border-stone-200 dark:border-neutral-700">
      {label}
    </span>
  );
}
function formatUTC(value: string | Date) {
  const dt = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(dt);
}

/* --------- Fila de nota --------- */
const NoteRow = React.memo(function NoteRow({
  note,
  cardId,
  onToggleOptimistic,
  onRemoveOptimistic,
  onEditOnBlurOptimistic,
}: {
  note: Note;
  cardId: string;
  onToggleOptimistic: (cardId: string, noteId: string, currentDone: boolean) => void;
  onRemoveOptimistic: (cardId: string, noteId: string) => void;
  onEditOnBlurOptimistic: (cardId: string, noteId: string, newText: string) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  };

  React.useEffect(() => {
    if (isEditing) {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(note.text.length, note.text.length);
      autoGrow(taRef.current);
    }
  }, [isEditing, note.text]);

  return (
    <li className="flex items-center gap-2 w-full">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={note.done}
          onChange={() => onToggleOptimistic(cardId, note.id, note.done)}
          className="size-4 shrink-0"
        />
        {isEditing ? (
          <textarea
            ref={taRef}
            defaultValue={note.text}
            onInput={(e) => autoGrow(e.currentTarget)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              onEditOnBlurOptimistic(cardId, note.id, v);
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                (e.target as HTMLTextAreaElement).blur();
              if (e.key === "Escape") setIsEditing(false);
            }}
            rows={1}
            className="flex-1 w-full min-w-0 px-2 py-1 rounded-xl border bg-white dark:bg-neutral-900 border-stone-300 dark:border-neutral-700 leading-relaxed resize-none overflow-hidden"
            style={{ lineHeight: "1.5" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className={`text-left flex-1 w-full min-w-0 px-2 py-1 rounded-xl hover:bg-stone-100 dark:hover:bg-neutral-900 ${note.done ? "line-through text-stone-400 dark:text-stone-500" : ""
              }`}
            title="Haz clic para editar"
          >
            <span className="block break-words whitespace-pre-wrap">{note.text}</span>
          </button>
        )}
      </div>

      <button
        onClick={() => onRemoveOptimistic(cardId, note.id)}
        className="shrink-0 ml-auto p-1 rounded hover:bg-stone-200 dark:hover:bg-neutral-700/60"
        title="Eliminar ítem"
      >
        <Image
          src="/delete-dark.png"
          alt="Eliminar"
          width={20}
          height={20}
          className="block dark:hidden"
        />
        <Image
          src="/delete-light.png"
          alt="Eliminar"
          width={20}
          height={20}
          className="hidden dark:block"
        />
      </button>
    </li>
  );
});

/* --------- Tarjeta sortable --------- */
function SortableCardItem({
  card,
  isSelected,
  onSelect,
  onDelete,
  onRemoveTag,
  completion,
  isCardComplete,
}: {
  card: Card;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRemoveTag: (tag: string) => void;
  completion: (c: Card) => number;
  isCardComplete: (c: Card) => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${isDragging ? "opacity-80 shadow-lg" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`relative w-full text-left p-4 rounded-2xl border bg-white dark:bg-neutral-800 border-stone-200 dark:border-neutral-700 hover:shadow transition ${isSelected ? "ring-2 ring-black/60 dark:ring-white/60" : ""
          }`}
      >
        {isCardComplete(card) && (
          <Stamp size={72} className="absolute -top-4 -left-4 sm:-top-6 sm:-left-6" />
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold leading-tight break-words">{card.title}</div>

          <div className="flex items-center gap-1">
            <button
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              className="px-6 py-1.5 rounded-md text-base cursor-grab active:cursor-grabbing hover:bg-stone-200 dark:hover:bg-neutral-700/60 select-none"
              title="Arrastrar para reordenar"
            >
              ≡
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("¿Eliminar proyecto?")) onDelete();
              }}
              className="p-1 rounded hover:bg-stone-200 dark:hover:bg-neutral-700/60"
              title="Eliminar proyecto"
            >
              <Image
                src="/delete-dark.png"
                alt="Eliminar"
                width={24}
                height={24}
                className="block dark:hidden"
              />
              <Image
                src="/delete-light.png"
                alt="Eliminar"
                width={24}
                height={24}
                className="hidden dark:block"
              />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {card.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <Chip label={t} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag(t);
                }}
                className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-neutral-300"
                title="Quitar tag"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {card.summary && (
          <p className="mt-2 text-sm text-stone-600 dark:text-neutral-300 line-clamp-2">
            {card.summary}
          </p>
        )}

        <div className="mt-3">
          <ProgressBar value={completion(card)} />
          <div className="mt-1 text-xs text-stone-500 dark:text-neutral-400">
            {card.notes.filter((n) => n.done).length}/{card.notes.length} completadas
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardSelect({
  boards,
  activeBoardId,
  onChange,
  onDeleteBoard,
}: {
  boards: { id: string; name: string }[];
  activeBoardId: string;
  onChange: (id: string) => void;
  onDeleteBoard: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const active = boards.find(b => b.id === activeBoardId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={active?.name ?? ""}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 max-w-[58vw] sm:max-w-xs"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{active?.name ?? "Tablero"}</span>
        <svg width="16" height="16" viewBox="0 0 20 20" className="shrink-0 opacity-70">
          <path d="M5 7l5 6 5-6H5z" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-2 w-[min(70vw,18rem)] max-h-64 overflow-auto rounded-xl border bg-white dark:bg-neutral-800 border-stone-200 dark:border-neutral-700 shadow-lg"
          role="listbox"
        >
          {boards.map(b => (
            <div
              key={b.id}
              className={`flex items-center gap-2 px-3 py-2 hover:bg-stone-50 dark:hover:bg-neutral-700/60 ${b.id === activeBoardId ? "font-medium" : ""
                }`}
              title={b.name}
            >
              <button
                type="button"
                onClick={() => { setOpen(false); onChange(b.id); }}
                className="truncate text-left flex-1"
                role="option"
                aria-selected={b.id === activeBoardId}
              >
                {b.name}
              </button>

              {/* Botón eliminar (X) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBoard(b.id);
                }}
                className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                aria-label={`Eliminar tablero ${b.name}`}
                title="Eliminar tablero"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <button
          aria-label="backdrop"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}


function Stamp({ size = 72, className = "" }: { size?: number; className?: string }) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      aria-label="Tarjeta lista"
      className={`pointer-events-none ${className} ${ready ? "stamp-enter-active" : "stamp-enter"
        }`}
    >
      <Image
        src="/paw-dark.png"
        alt="Sello completado"
        width={size}
        height={size}
        priority
        className="block dark:hidden"
      />
      <Image
        src="/paw-light.png"
        alt="Sello completado"
        width={size}
        height={size}
        priority
        className="hidden dark:block"
      />

      <style jsx>{`
        .stamp-enter {
          opacity: 0;
          transform: scale(1.6) rotate(-8deg);
          filter: blur(8px) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35));
        }
        .stamp-enter-active {
          opacity: 0.95;
          transform: scale(1) rotate(-8deg);
          filter: blur(0) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35));
          transition: transform 0.3s ease, filter 0.3s ease, opacity 0.3s ease;
        }
      `}</style>
    </div>
  );
}

/* =========================
 *     COMPONENTE PRINCIPAL
 * ========================= */
export default function ChecklistBoard({
  initialCards,
  boards,
  activeBoardId,
}: {
  initialCards: Card[];
  boards: BoardLite[];
  activeBoardId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /* Estado UI */
  const [cards, setCards] = useState<Card[]>(initialCards);
  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialCards[0]?.id ?? null
  );
  const [search, setSearch] = useState("");
  //const audioRef = useRef<HTMLAudioElement | null>(null);

  // Conjunto de tarjetas que YA celebraron (para no repetir)
  const completedOnceRef = useRef<Set<string>>(new Set());

  const detailTopRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Habilitar audio tras gesto del usuario (requisito navegadores)
  const [canPlay, setCanPlay] = useState(false);
  useEffect(() => {
    const enable = () => setCanPlay(true);
    window.addEventListener("pointerdown", enable, { once: true });
    window.addEventListener("keydown", enable, { once: true });
    return () => {
      window.removeEventListener("pointerdown", enable);
      window.removeEventListener("keydown", enable);
    };
  }, []);



  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const autoGrowSummary = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  };

  const isCardComplete = useCallback(
    (c: Card) => c.notes.length > 0 && c.notes.every((n) => n.done),
    []
  );

  // --- Paginación ---
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(1);

  // Cuando cambie el filtro (search) o cambie el tablero, volvemos a la página 1
  useEffect(() => { setPage(1); }, [search, activeBoardId]);

  // Colección filtrada (ya existe)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.notes.some((n) => n.text.toLowerCase().includes(q))
    );
  }, [cards, search]);

  // Paginados
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const selected = useMemo(
    () => cards.find((c) => c.id === selectedId) ?? null,
    [cards, selectedId]
  );

  const skipNextBlurSave = useRef(false);

  const completion = (card: Card) => {
    if (!card.notes.length) return 0;
    const done = card.notes.filter((n) => n.done).length;
    return Math.round((done / card.notes.length) * 100);
  };

  const [localSummary, setLocalSummary] = useState<string>(selected?.summary ?? "");
  useEffect(() => {
    setLocalSummary(selected?.summary ?? "");
  }, [selected?.id, selected?.summary]);

  const saveSummary = useCallback((id: string, summary: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, summary } : c)));
    startTransition(() => updateCard(id, { summary }));
  }, []);

  const [localTitle, setLocalTitle] = useState<string>(selected?.title ?? "");
  useEffect(() => {
    setLocalTitle(selected?.title ?? "");
  }, [selected?.id, selected?.title]);

  const saveTitle = useCallback((id: string, title: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    startTransition(() => updateCard(id, { title }));
  }, []);

  /* Notas optimistas */
  const onToggleOptimistic = useCallback(
    (cardId: string, noteId: string, currentDone: boolean) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id !== cardId
            ? c
            : {
              ...c,
              notes: c.notes.map((n) =>
                n.id === noteId ? { ...n, done: !currentDone } : n
              ),
            }
        )
      );
      startTransition(async () => {
        try {
          await toggleNote(noteId);
        } catch {
          setCards((prev) =>
            prev.map((c) =>
              c.id !== cardId
                ? c
                : {
                  ...c,
                  notes: c.notes.map((n) =>
                    n.id === noteId ? { ...n, done: currentDone } : n
                  ),
                }
            )
          );
        }
      });
    },
    []
  );

  const handleDeleteBoard = React.useCallback(async (id: string) => {
    const board = boards.find(b => b.id === id);
    if (!board) return;

    const ok = confirm(`¿Seguro que quieres eliminar el tablero "${board.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    // Fallback: primer tablero distinto del eliminado (si no hay, redirige a /boards)
    const fallback = boards.find(b => b.id !== id)?.id;

    await deleteBoard(id);

    if (id === activeBoardId) {
      if (fallback) router.push(`/boards/${fallback}`);
      else router.push(`/boards`); // ruta índice si la tienes
    } else {
      router.refresh();
    }
  }, [boards, activeBoardId, router]);


  // useEffect(() => {
  //   if (audioRef.current) audioRef.current.volume = 0.3;
  // }, []);

  // Al cambiar de tablero: considera "ya celebradas" todas las que estén completas
  useEffect(() => {
    const completedNow = new Set(cards.filter(isCardComplete).map((c) => c.id));
    completedOnceRef.current = completedNow;
  }, [activeBoardId, cards, isCardComplete]);

  // Reproduce sonido SOLO cuando una tarjeta pasa de incompleta -> completa
  useEffect(() => {
    if (!canPlay) return;
    //const el = audioRef.current;
    //if (!el) return;

    const completedNow = new Set(cards.filter(isCardComplete).map((c) => c.id));

    // ids nuevos que se acaban de completar
    const newlyCompleted: string[] = [];
    for (const id of completedNow) {
      if (!completedOnceRef.current.has(id)) {
        newlyCompleted.push(id);
      }
    }



    // Actualiza el set: añade completadas actuales
    for (const id of completedNow) {
      completedOnceRef.current.add(id);
    }
    // Si quieres permitir celebrar de nuevo cuando dejan de estar completas:
    for (const id of Array.from(completedOnceRef.current)) {
      if (!completedNow.has(id)) completedOnceRef.current.delete(id);
    }
  }, [cards, isCardComplete, canPlay]);

  useEffect(() => {
    autoGrowSummary(summaryRef.current);
  }, [selected?.id, localSummary]);

  const onEditOnBlurOptimistic = useCallback(
    (cardId: string, noteId: string, newText: string) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id !== cardId
            ? c
            : {
              ...c,
              notes: c.notes.map((n) =>
                n.id === noteId ? { ...n, text: newText } : n
              ),
            }
        )
      );
      startTransition(() => editNote(noteId, newText));
    },
    []
  );

  const onRemoveNoteOptimistic = useCallback((cardId: string, noteId: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id !== cardId ? c : { ...c, notes: c.notes.filter((n) => n.id !== noteId) }
      )
    );
    startTransition(() => removeNote(noteId));
  }, []);

  /* Tags optimistas */
  const onAddTagOptimistic = useCallback((cardId: string, tag: string) => {
    const t = tag.trim();
    if (!t) return;
    setCards((prev) =>
      prev.map((c) => (c.id !== cardId ? c : { ...c, tags: [...c.tags, t] }))
    );
    startTransition(() => addTag(cardId, t));
  }, []);

  const onRemoveTagOptimistic = useCallback((cardId: string, tag: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id !== cardId ? c : { ...c, tags: c.tags.filter((t) => t !== tag) }
      )
    );
    startTransition(() => removeTag(cardId, tag));
  }, []);

  /* Crear / eliminar tarjeta (board activo) */
  const onCreateCard = useCallback(
    async (title: string) => {
      const t = title.trim();
      if (!t) return;

      startTransition(async () => {
        const created = await createCard(t, activeBoardId);
        setCards((prev) => [created, ...prev]);
        setSelectedId(created.id);
      });
    },
    [activeBoardId]
  );

  const onDeleteCard = useCallback(
    (cardId: string) => {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      if (selectedId === cardId) {
        const next = cards.find((c) => c.id !== cardId)?.id ?? null;
        setSelectedId(next);
      }
      startTransition(() => {
        void deleteCard(cardId);
      });
    },
    [cards, selectedId]
  );

  /* Crear nota */
  const onAddNote = useCallback(async (cardId: string, text: string) => {
    const t = text.trim();
    if (!t) return;

    startTransition(async () => {
      const created = await addNote(cardId, t);
      setCards((prev) =>
        prev.map((c) =>
          c.id !== cardId
            ? c
            : {
              ...c,
              notes: [
                ...c.notes,
                { id: created.id, text: created.text, done: created.done },
              ],
            }
        )
      );
    });
  }, []);

  /* Drag & drop reordenar */
const onDragEnd = useCallback(
  (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Índices globales dentro de 'filtered'
    const filteredIds = filtered.map((c) => c.id);
    const fromGlobal = filteredIds.indexOf(String(active.id));
    const toGlobal   = filteredIds.indexOf(String(over.id));
    if (fromGlobal < 0 || toGlobal < 0) return;

    // Rango de la página visible en el array 'filtered'
    const pageStart = start;
    const pageEndExclusive = Math.min(start + PAGE_SIZE, filtered.length);

    // Sólo permitir drag si ambos están en la página actual
    if (
      fromGlobal < pageStart || fromGlobal >= pageEndExclusive ||
      toGlobal   < pageStart || toGlobal   >= pageEndExclusive
    ) {
      return;
    }

    // Reordenamos 'filteredIds' globalmente, pero el movimiento está restringido por el chequeo anterior
    const newFilteredIds = arrayMove(filteredIds, fromGlobal, toGlobal);

    // Reconstruimos el arreglo 'cards' completo respetando el nuevo orden de 'filtered'
    const byId = new Map(cards.map((c) => [c.id, c]));
    const reorderedFiltered = newFilteredIds.map((id) => byId.get(id)!);

    // Si 'filtered' es todo 'cards', basta con usar 'reorderedFiltered'.
    // Si no, preservamos las no-filtradas en su posición relativa original.
    const filteredSet = new Set(filteredIds);
    const nonFiltered = cards.filter((c) => !filteredSet.has(c.id));

    const reordered = [
      ...reorderedFiltered,
      ...nonFiltered,
    ];

    setCards(reordered);
    void reorderCards(reordered.map((c) => c.id));
  },
  [cards, filtered, start]
);


  /* Copiar al portapapeles */
  const handleCopySelected = useCallback(async () => {
    if (!selected) return;

    const payload = buildClipboardPayload({
      title: selected.title,
      summary: selected.summary ?? "",
      items: selected.notes.map((n) => ({ text: n.text, done: n.done })),
    });

    try {
      const hasRichWrite =
        typeof window !== "undefined" &&
        "ClipboardItem" in window &&
        typeof navigator.clipboard.write === "function";

      if (hasRichWrite) {
        const item = new ClipboardItem({
          "text/html": new Blob([payload.textHtml], { type: "text/html" }),
          "text/plain": new Blob([payload.textPlain], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(payload.textPlain);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(payload.textPlain);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    }
  }, [selected]);

  /* Scroll a detalle al cambiar selección */
  useEffect(() => {
    if (!selected) return;

    const scrollToDetailTop = () => {
      const el = detailTopRef.current;
      if (!el) return;

      const header = document.querySelector("header");
      const headerH =
        header && header instanceof HTMLElement
          ? header.getBoundingClientRect().height
          : 0;

      const extra = 12;
      const y = el.getBoundingClientRect().top + window.scrollY - headerH - extra;
      window.scrollTo({ top: y, behavior: "smooth" });
    };

    const raf1 = requestAnimationFrame(() => {
      scrollToDetailTop();
      setTimeout(scrollToDetailTop, 150);
    });

    return () => cancelAnimationFrame(raf1);
  }, [selected]);

  /* Formularios */
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [newTagText, setNewTagText] = useState("");

  return (
    <div className="min-h-screen relative bg-stone-100 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      {/* HEADER */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-neutral-900/70 border-b border-stone-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3 sm:gap-2">
          {/* Fila 1: título + selector de tablero + botón */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => router.push("/")}
              className="px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700"
              title="Volver a modalidades"
            >
              ← Volver
            </button>

            <div className="text-lg sm:text-xl font-semibold mr-auto flex items-center gap-2">
              <span>📒 Block de Tareas -</span>
              <span className="hidden sm:inline">Clarisse</span>
            </div>

            {/* Selector bonito con truncado */}
            <BoardSelect
              boards={boards}
              activeBoardId={activeBoardId}
              onChange={(id) => router.push(`/boards/${id}`)}
              onDeleteBoard={handleDeleteBoard} // ⬅️ NUEVO
            />

            <button
              onClick={async () => {
                const name = prompt("Nombre del nuevo tablero");
                if (!name?.trim()) return;
                const b = await createBoard(name);
                router.push(`/boards/${b.id}`);
              }}
              className="px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700"
            >
              + Tablero
            </button>
          </div>

          {/* Fila 2: search + nuevo + salir + modo */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proyecto, tag o nota…"
              className="px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 placeholder-stone-500 dark:placeholder-neutral-400 flex-1 min-w-[200px]"
            />

            <input
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Título proyecto"
              className="px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 placeholder-stone-500 dark:placeholder-neutral-400 w-56"
            />

            <button
              onClick={() => {
                if (!newCardTitle.trim()) return;
                onCreateCard(newCardTitle);
                setNewCardTitle("");
              }}
              className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-60"
              disabled={isPending || !newCardTitle.trim()}
            >
              Nuevo
            </button>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700"
            >
              Salir
            </button>

            <ModeToggle />
          </div>
        </div>
      </header>


      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* LISTA DE TARJETAS */}
        <section className="space-y-3 lg:col-span-1">
          {mounted && (
            <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={visible.map((c) => c.id)}               // << aquí
                strategy={verticalListSortingStrategy}
              >
                {visible.length === 0 && (                      // << y aquí
                  <div className="p-4 border rounded-2xl bg-white dark:bg-neutral-800 border-stone-200 dark:border-neutral-700">
                    No hay proyectos que coincidan.
                  </div>
                )}

                {visible.map((card) => (                        // << y aquí
                  <SortableCardItem
                    key={card.id}
                    card={card}
                    isSelected={selectedId === card.id}
                    onSelect={() => setSelectedId(card.id)}
                    onDelete={() => onDeleteCard(card.id)}
                    onRemoveTag={(t) => onRemoveTagOptimistic(card.id, t)}
                    completion={completion}
                    isCardComplete={isCardComplete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Controles de paginación */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
              >
                « Primero
              </button>
              <button
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                ‹ Anterior
              </button>

              <span className="text-xs opacity-70">
                Página {currentPage} / {totalPages}
              </span>

              <button
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Siguiente ›
              </button>
              <button
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Último »
              </button>
            </div>
          )}
        </section>


        {/* DETALLE */}
        <section className="lg:col-span-2">
          {!selected ? (
            <div className="p-6 border rounded-3xl bg-white dark:bg-neutral-800 text-stone-600 dark:text-neutral-300 border-stone-200 dark:border-neutral-700 scroll-mt-24 sm:scroll-mt-28">
              Selecciona o crea un proyecto para ver sus notas.
            </div>
          ) : (
            <div
              ref={detailTopRef}
              className="p-4 sm:p-6 border rounded-3xl bg-white dark:bg-neutral-800 border-stone-200 dark:border-neutral-700"
            >
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveTitle(selected.id, localTitle.trim());
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  onBlur={() => saveTitle(selected.id, localTitle.trim())}
                  className="text-lg sm:text-xl font-semibold w-full border-b focus:outline-none bg-transparent border-stone-300 dark:border-neutral-700"
                />
              </div>

              <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  placeholder="Añadir tag (Enter)"
                  className="px-3 py-2 rounded-xl border w-full sm:w-56 bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTagText.trim()) {
                      onAddTagOptimistic(selected.id, newTagText);
                      setNewTagText("");
                    }
                  }}
                />
                <div className="sm:ml-auto w-full sm:w-56">
                  <ProgressBar value={completion(selected)} />
                </div>
              </div>

              {/* RESUMEN */}
              <div className="mt-3">
                <label className="block text-lg text-stone-500 dark:text-neutral-400 mb-1">
                  Resumen de la tarea
                </label>

                <textarea
                  ref={summaryRef}
                  value={localSummary}
                  onChange={(e) => setLocalSummary(e.target.value)}
                  onInput={(e) => autoGrowSummary(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      skipNextBlurSave.current = true;
                      saveSummary(selected.id, localSummary.trim());
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  onBlur={() => {
                    if (skipNextBlurSave.current) {
                      skipNextBlurSave.current = false;
                      return;
                    }
                    const serverValue = selected?.summary ?? "";
                    const next = localSummary.trim();
                    if (next !== serverValue) saveSummary(selected!.id, next);
                  }}
                  rows={1}
                  placeholder="Describe brevemente el objetivo, alcance y criterio de éxito…"
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 focus:outline-none focus:ring leading-relaxed"
                  style={{ lineHeight: "1.5", resize: "none", overflow: "hidden" }}
                />
                <p className="mt-1 text-xs text-stone-400">
                  Tip: presiona <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> para guardar. :O
                </p>
              </div>

              {/* ADJUNTOS */}
              <div className="mt-5">
                <div className="text-lg text-stone-500 dark:text-neutral-400 mb-2">Adjuntos</div>
                <AttachmentsBar
                  key={selected?.id}
                  cardId={selected!.id}
                  initial={selected?.attachments ?? []}
                  onChange={(next) => {
                    setCards((prev) =>
                      prev.map((c) =>
                        c.id === selected!.id ? { ...c, attachments: next } : c
                      )
                    );
                  }}
                />
              </div>

              {/* CHECKLIST */}
              <div className="mt-5">
                <div className="text-lg text-stone-500 dark:text-neutral-400 mb-2">
                  Checklist
                </div>
                <ul className="space-y-2">
                  {selected.notes.map((n) => (
                    <NoteRow
                      key={n.id}
                      note={n}
                      cardId={selected.id}
                      onToggleOptimistic={onToggleOptimistic}
                      onRemoveOptimistic={onRemoveNoteOptimistic}
                      onEditOnBlurOptimistic={onEditOnBlurOptimistic}
                    />
                  ))}
                </ul>

                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Añadir nota/checklist (Enter)"
                    className="px-3 py-2 rounded-xl border w-full bg-white dark:bg-neutral-900 border-stone-300 dark:border-neutral-700"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newNoteText.trim()) {
                        onAddNote(selected.id, newNoteText);
                        setNewNoteText("");
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newNoteText.trim()) {
                        onAddNote(selected.id, newNoteText);
                        setNewNoteText("");
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-60"
                    disabled={isPending || !newNoteText.trim()}
                  >
                    Añadir
                  </button>
                </div>
              </div>

              <div className="relative inline-block">
                <button
                  onClick={handleCopySelected}
                  className="mt-6 px-3 py-2 rounded-xl border bg-white dark:bg-neutral-800 border-stone-300 dark:border-neutral-700 hover:bg-stone-50 dark:hover:bg-neutral-700/60 cursor-pointer"
                >
                  Copiar
                </button>

                {copied && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 translate-y-0 px-2 py-1 rounded-md bg-black text-white text-xs opacity-90 animate-fadeOnly whitespace-nowrap">
                    ¡Copiado en el portapapeles!
                  </div>
                )}
              </div>

              <div className="mt-6 text-xs text-stone-400">
                Creado (UTC): {formatUTC(selected.createdAt)}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-7xl mx:auto px-3 sm:px-4 pb-10 text-center text-xs text-stone-400">
        Hecho con 🖤 por Clarisse para su amo. Menos es más.
      </footer>
      {/* <audio ref={audioRef} src="/sounds/stamp.wav" preload="auto" /> */}
    </div>
  );
}
