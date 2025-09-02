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
  createCard,
  updateCard,
  deleteCard,
  addTag,
  removeTag,
  reorderCards
} from "@/app/actions";
import { signOut } from "next-auth/react";
import { ModeToggle } from "@/components/ui/toogle";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";




type Note = { id: string; text: string; done: boolean };
type Card = { id: string; title: string; summary?: string; tags: string[]; createdAt: string | Date; notes: Note[] };

/* --------- UI --------- */
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        className="h-full transition-all bg-black dark:bg-white"
      />
    </div>
  );
}
function Chip({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      {label}
    </span>
  );
}

/* Fecha estable para SSR/CSR (evita hydration mismatch) */
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

/* Fila de nota optimizada */
/* --------- Fila de nota con ver/editar + autosize --------- */
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

  // autosize simple para <textarea>
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
    <li className="flex items-center gap-2 w-full"> {/* <- centrado vertical */}
      {/* Izquierda: checkbox + texto */}
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
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") (e.target as HTMLTextAreaElement).blur();
              if (e.key === "Escape") setIsEditing(false);
            }}
            rows={1}
            className="flex-1 w-full min-w-0 px-2 py-1 rounded-xl border bg-white dark:bg-gray-900
                     border-gray-300 dark:border-gray-700 leading-relaxed resize-none overflow-hidden"
            style={{ lineHeight: "1.5" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className={`text-left flex-1 w-full min-w-0 px-2 py-1 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900
                      ${note.done ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
            title="Haz clic para editar"
          >
            <span className="block break-words whitespace-pre-wrap">{note.text}</span>
          </button>
        )}
      </div>

      {/* Derecha: botón eliminar */}
      <button
        onClick={() => onRemoveOptimistic(cardId, note.id)}
        className="shrink-0 ml-auto p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        title="Eliminar ítem"
      >
        <Image src="/delete-dark.png" alt="Eliminar" width={20} height={20} className="block dark:hidden" />
        <Image src="/delete-light.png" alt="Eliminar" width={20} height={20} className="hidden dark:block" />
      </button>
    </li>
  );
});

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

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
        className={`relative w-full text-left p-4 rounded-2xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow transition ${isSelected ? "ring-2 ring-black/60 dark:ring-white/60" : ""
          }`}
      >
        {isCardComplete(card) && (
          <Stamp size={72} className="absolute -top-4 -left-4 sm:-top-6 sm:-left-6" />
        )}

        {/* cabecera: título + acciones */}
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold leading-tight break-words">{card.title}</div>

          <div className="flex items-center gap-1">
            {/* 🔹 HANDLE de drag: sólo desde aquí se arrastra */}
            <button
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              className="px-6 py-1.5 rounded-md text-base cursor-grab active:cursor-grabbing 
               hover:bg-gray-200 dark:hover:bg-gray-700 select-none"
              title="Arrastrar para reordenar"
            >
              ≡
            </button>

            {/* 🔹 BOTÓN ELIMINAR CON ICONOS PNG */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("¿Eliminar proyecto?")) onDelete();
              }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Eliminar proyecto"
            >
              {/* Claro: ícono negro */}
              <Image
                src="/delete-dark.png"
                alt="Eliminar"
                width={24}
                height={24}
                className="block dark:hidden"
              />
              {/* Oscuro: ícono blanco */}
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
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Quitar tag"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {card.summary && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
            {card.summary}
          </p>
        )}

        <div className="mt-3">
          <ProgressBar value={completion(card)} />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {card.notes.filter((n) => n.done).length}/{card.notes.length} completadas
          </div>
        </div>
      </div>
    </div>
  );
}





function Stamp({ size = 72, className = "" }: { size?: number; className?: string }) {
  const [ready, setReady] = React.useState(false);



  React.useEffect(() => {
    // Pinta el estado inicial (grande + difuminado) y en el próximo frame activa la transición
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      aria-label="Tarjeta lista"
      className={`pointer-events-none ${className} ${ready ? "stamp-enter-active" : "stamp-enter"}`}
    >
      {/* Light mode: patita negra */}
      <Image
        src="/paw-dark.png"
        alt="Sello completado"
        width={size}
        height={size}
        priority
        className="block dark:hidden"
      />
      {/* Dark mode: patita blanca */}
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

function SortableItem({
  id,
  onClick,
  className,
  children,
}: {
  id: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${className ?? ""} cursor-grab active:cursor-grabbing select-none ${isDragging ? "opacity-80 shadow-lg" : ""}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}





export default function ChecklistBoard({ initialCards }: { initialCards: Card[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /* ========= ESTADO LOCAL PARA UI OPTIMISTA ========= */
  const [cards, setCards] = useState<Card[]>(initialCards);

  // 🔄 Sincroniza cuando initialCards cambie tras un router.refresh()
  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  // Selección y búsqueda
  const [selectedId, setSelectedId] = useState<string | null>(initialCards[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const completedOnceRef = useRef<Set<string>>(new Set());

  // arriba, junto a otros useRef/useState
const summaryRef = useRef<HTMLTextAreaElement>(null);

const autoGrowSummary = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = el.scrollHeight + "px";
};

// cuando cambie la tarjeta seleccionada o el texto local


  const isCardComplete = useCallback((c: Card) => {
    return c.notes.length > 0 && c.notes.every(n => n.done);
  }, []);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.notes.some((n) => n.text.toLowerCase().includes(q))
    );
  }, [cards, search]);

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
  }, [selected?.id]);

  const saveSummary = useCallback((id: string, summary: string) => {
    // 1) UI inmediata
    setCards(prev => prev.map(c => c.id === id ? { ...c, summary } : c));
    // 2) Server en background
    startTransition(() => updateCard(id, { summary }));
  }, []);

  /* ======= TÍTULO: local + commit solo en blur/Enter ======= */
  const [localTitle, setLocalTitle] = useState<string>(selected?.title ?? "");
  useEffect(() => {
    setLocalTitle(selected?.title ?? "");
  }, [selected?.id]);

  const saveTitle = useCallback((id: string, title: string) => {
    // 1) UI inmediata
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    // 2) Server en background
    startTransition(() => updateCard(id, { title }));
  }, []);

  /* ======= NOTAS: handlers optimistas ======= */

  // Toggle instantáneo con rollback si falla
  const onToggleOptimistic = useCallback(
    (cardId: string, noteId: string, currentDone: boolean) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id !== cardId
            ? c
            : { ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, done: !currentDone } : n)) }
        )
      );
      startTransition(async () => {
        try {
          await toggleNote(noteId);
        } catch {
          // rollback
          setCards((prev) =>
            prev.map((c) =>
              c.id !== cardId
                ? c
                : { ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, done: currentDone } : n)) }
            )
          );
        }
      });
    },
    []
  );

  useEffect(() => {
    if (!audioRef.current) return;
    // detectar “nuevas completadas”
    const nowCompleted = new Set(cards.filter(isCardComplete).map(c => c.id));

    // reproduce sonido para ids que NO estaban marcadas antes
    for (const id of nowCompleted) {
      if (!completedOnceRef.current.has(id)) {
        // marcarla y reproducir
        completedOnceRef.current.add(id);
        // reproducir sin bloquear la UI (try/catch por autoplay policies)
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => { });
      }
    }

    // si alguna dejó de estar completa, elimínala del set (para poder volver a sonar si se completa otra vez)
    for (const id of Array.from(completedOnceRef.current)) {
      if (!nowCompleted.has(id)) {
        completedOnceRef.current.delete(id);
      }
    }
  }, [cards, isCardComplete]);

  useEffect(() => {
  autoGrowSummary(summaryRef.current);
}, [selected?.id, localSummary]);


  // Editar texto en blur (UI inmediata + server)
  const onEditOnBlurOptimistic = useCallback(
    (cardId: string, noteId: string, newText: string) => {
      setCards((prev) =>
        prev.map((c) =>
          c.id !== cardId ? c : { ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, text: newText } : n)) }
        )
      );
      startTransition(() => editNote(noteId, newText));
    },
    []
  );

  // Quitar nota (UI inmediata + server)
  const onRemoveNoteOptimistic = useCallback((cardId: string, noteId: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id !== cardId ? c : { ...c, notes: c.notes.filter((n) => n.id !== noteId) }))
    );
    startTransition(() => removeNote(noteId));
  }, []);

  // Tags
  const onAddTagOptimistic = useCallback((cardId: string, tag: string) => {
    const t = tag.trim();
    if (!t) return;
    setCards((prev) => prev.map((c) => (c.id !== cardId ? c : { ...c, tags: [...c.tags, t] })));
    startTransition(() => addTag(cardId, t));
  }, []);

  const onRemoveTagOptimistic = useCallback((cardId: string, tag: string) => {
    setCards((prev) => prev.map((c) => (c.id !== cardId ? c : { ...c, tags: c.tags.filter((t) => t !== tag) })));
    startTransition(() => removeTag(cardId, tag));
  }, []);

  // Crear / eliminar tarjeta
  const onCreateCard = useCallback(async (title: string) => {
    const t = title.trim();
    if (!t) return;

    startTransition(async () => {
      const created = await createCard(t); // ← ahora retorna {id,title,tags,createdAt,notes:[]}
      setCards(prev => [created, ...prev]);
      setSelectedId(created.id);
    });
  }, []);

  const onDeleteCard = useCallback(
    (cardId: string) => {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      if (selectedId === cardId) {
        const next = cards.find((c) => c.id !== cardId)?.id ?? null;
        setSelectedId(next);
      }
      startTransition(() => deleteCard(cardId));
    },
    [cards, selectedId]
  );

  // Crear nota
  const onAddNote = useCallback(async (cardId: string, text: string) => {
    const t = text.trim();
    if (!t) return;

    startTransition(async () => {
      const created = await addNote(cardId, t); // ← retorna {id, cardId, text, done}
      setCards(prev =>
        prev.map(c =>
          c.id !== cardId ? c : { ...c, notes: [...c.notes, { id: created.id, text: created.text, done: created.done }] }
        )
      );
    });
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // 1) ids visibles en el orden actual
    const visibleIds = filtered.map(c => c.id);
    const from = visibleIds.indexOf(String(active.id));
    const to = visibleIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    // 2) nuevo orden SOLO de los visibles
    const newVisibleIds = arrayMove(visibleIds, from, to);

    // 3) construir el arreglo completo reordenado usando el estado ACTUAL (cards)
    const byId = new Map(cards.map(c => [c.id, c]));
    const reordered = [
      ...newVisibleIds.map(id => byId.get(id)!),
      ...cards.filter(c => !newVisibleIds.includes(c.id)),
    ];

    // 4) UI optimista (solo setState, nada más)
    setCards(reordered);

    // 5) Persistir en segundo plano (SIN startTransition y SIN router.refresh)
    void reorderCards(reordered.map(c => c.id));
  }, [cards, filtered]);







  // Formularios
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [newTagText, setNewTagText] = useState("");

  return (
    <div className="min-h-screen relative bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* HEADER */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3 sm:gap-2 sm:flex-row sm:items-center">
          <div className="text-lg sm:text-xl font-semibold">🗂️ Block de Tareas - Clarisse</div>

          <div className="sm:ml-auto flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proyecto, tag o nota…"
              className="px-3 py-2 rounded-xl border w-full sm:w-64 focus:outline-none focus:ring bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400"
            />

            <input
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Título proyecto"
              className="px-3 py-2 rounded-xl border w-[min(260px,100%)] sm:w-56 focus:outline-none focus:ring bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400"
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
              className="px-3 py-2 rounded-xl border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            >
              Salir
            </button>

            {/* MODO OSCURO ACTUAL */}
            <ModeToggle />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* LISTA DE TARJETAS */}
        <section className="space-y-3 lg:col-span-1">
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={filtered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {filtered.length === 0 && (
                <div className="p-4 border rounded-2xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  No hay proyectos que coincidan.
                </div>
              )}

              {filtered.map((card) => (
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
        </section>



        {/* DETALLE */}
        <section className="lg:col-span-2">
          {!selected ? (
            <div className="p-6 border rounded-3xl bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700">
              Selecciona o crea un proyecto para ver sus notas.
            </div>
          ) : (
            <div className="p-4 sm:p-6 border rounded-3xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
                  className="text-lg sm:text-xl font-semibold w-full border-b focus:outline-none bg-transparent border-gray-300 dark:border-gray-700"
                />
              </div>

              <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  placeholder="Añadir tag (Enter)"
                  className="px-3 py-2 rounded-xl border w-full sm:w-56 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
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
                <label className="block text-lg text-gray-500 dark:text-gray-400 mb-1">
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
                    if (skipNextBlurSave.current) { skipNextBlurSave.current = false; return; }
                    const serverValue = selected?.summary ?? "";
                    const next = localSummary.trim();
                    if (next !== serverValue) saveSummary(selected!.id, next);
                  }}
                  rows={1}  // 👈 arranca en 1 y crece solo
                  placeholder="Describe brevemente el objetivo, alcance y criterio de éxito…"
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring leading-relaxed"
                  style={{ lineHeight: "1.5", resize: "none", overflow: "hidden" }}  // 👈 evita scroll
                />
                <p className="mt-1 text-xs text-gray-400">
                  Tip: presiona <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> para guardar.
                </p>
              </div>


              <div className="mt-5">
                <div className="text-lg text-gray-500 dark:text-gray-400 mb-2">Checklist</div>
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
                    className="px-3 py-2 rounded-xl border w-full bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
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

              <div className="mt-6 text-xs text-gray-400">
                Creado (UTC): {formatUTC(selected.createdAt)}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-7xl mx:auto px-3 sm:px-4 pb-10 text-center text-xs text-gray-400">
        Hecho con 🖤 por Clarisse para su amo. Menos es más.
      </footer>
      <audio ref={audioRef} src="/sounds/stamp.wav" preload="auto" />
    </div>
  );
}
