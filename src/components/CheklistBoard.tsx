"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
  addNote, toggleNote, editNote, removeNote,
  createCard, updateCard, deleteCard,
  addTag, removeTag
} from "@/app/actions";
import { signOut } from "next-auth/react";
import { ModeToggle } from "@/components/ui/toogle";

type Note = { id: string; text: string; done: boolean };
type Card = { id: string; title: string; tags: string[]; createdAt: string | Date; notes: Note[] };

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

export default function ChecklistBoard({ initialCards }: { initialCards: Card[] }) {
  const [isPending, startTransition] = useTransition();

  // Selección y búsqueda
  const [selectedId, setSelectedId] = useState<string | null>(initialCards[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialCards;
    return initialCards.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q)) ||
      c.notes.some(n => n.text.toLowerCase().includes(q))
    );
  }, [initialCards, search]);

  // UI forms
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [newTagText, setNewTagText] = useState("");

  const selected = useMemo(
    () => initialCards.find(c => c.id === selectedId) ?? null,
    [initialCards, selectedId]
  );

  const completion = (card: Card) => {
    if (!card.notes.length) return 0;
    const done = card.notes.filter(n => n.done).length;
    return Math.round((done / card.notes.length) * 100);
  };

  return (
    <div className="min-h-screen relative bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* HEADER */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex flex-col gap-3 sm:gap-2 sm:flex-row sm:items-center">
          <div className="text-lg sm:text-xl font-semibold">🗂️ Checklists – Clarisse</div>

          {/* Controles: se acomodan en filas y hacen wrap en mobile */}
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
              onClick={() => startTransition(async () => { if (newCardTitle.trim()) { await createCard(newCardTitle.trim()); setNewCardTitle(""); } })}
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

            <ModeToggle />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* LISTA DE TARJETAS */}
        <section className="space-y-3 lg:col-span-1">
          {filtered.length === 0 && (
            <div className="p-4 border rounded-2xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              No hay proyectos que coincidan.
            </div>
          )}

          {filtered.map((card) => (
            <button
              key={card.id}
              onClick={() => setSelectedId(card.id)}
              className={`w-full text-left p-4 rounded-2xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow transition ${
                selectedId === card.id ? "ring-2 ring-black/60 dark:ring-white/60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold leading-tight break-words">{card.title}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar proyecto?")) deleteCard(card.id); }}
                  className="text-xs text-red-500 hover:underline shrink-0"
                >
                  Eliminar
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {card.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1">
                    <Chip label={t} />
                    <button
                      onClick={(e) => { e.stopPropagation(); startTransition(() => removeTag(card.id, t)); }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Quitar tag"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="mt-3">
                <ProgressBar value={completion(card)} />
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {card.notes.filter(n => n.done).length}/{card.notes.length} completadas
                </div>
              </div>
            </button>
          ))}
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
                  value={selected.title}
                  onChange={(e) => startTransition(() => updateCard(selected.id, { title: e.target.value }))}
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
                      startTransition(async () => { await addTag(selected.id, newTagText.trim()); setNewTagText(""); });
                    }
                  }}
                />
                <div className="sm:ml-auto w-full sm:w-56">
                  <ProgressBar value={completion(selected)} />
                </div>
              </div>

              <div className="mt-5">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Checklist</div>
                <ul className="space-y-2">
                  {selected.notes.map((n) => (
                    <li key={n.id} className="flex flex-col sm:flex-row sm:items-start gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={n.done}
                          onChange={() => startTransition(() => toggleNote(n.id))}
                          className="mt-0.5 size-4"
                        />
                        <input
                          value={n.text}
                          onChange={(e) => startTransition(() => editNote(n.id, e.target.value))}
                          className={`flex-1 px-2 py-1 rounded border bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 ${
                            n.done ? "line-through text-gray-400 dark:text-gray-500" : ""
                          } w-full`}
                        />
                      </div>
                      <button
                        onClick={() => startTransition(() => removeNote(n.id))}
                        className="text-xs text-red-500 hover:underline self-start"
                      >
                        Quitar
                      </button>
                    </li>
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
                        startTransition(async () => { await addNote(selected.id, newNoteText.trim()); setNewNoteText(""); });
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newNoteText.trim()) {
                        startTransition(async () => { await addNote(selected.id, newNoteText.trim()); setNewNoteText(""); });
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
                Creado: {new Date(selected.createdAt).toLocaleString()}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-3 sm:px-4 pb-10 text-center text-xs text-gray-400">
        Hecho con 🖤 por Clarisse para su amo.
      </footer>
    </div>
  );
}
