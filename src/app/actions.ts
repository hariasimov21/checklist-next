"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertAuth(session: any) {
  if (!session?.user?.id) throw new Error("No autenticado");
  return session.user.id as string;
}

/* ===========================
 *           BOARDS
 * =========================== */

export async function listBoards() {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  return prisma.board.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

/* ========== BOARDS ========== */
export async function createBoard(name: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nombre requerido");

  // Evita duplicados por usuario
  const exists = await prisma.board.findFirst({
    where: { userId, name: trimmed },
    select: { id: true },
  });
  if (exists) return exists; // si ya está, reutiliza

  const board = await prisma.board.create({
    data: { userId, name: trimmed },
    select: { id: true, name: true },
  });

  return board;
}

/** Trae SOLO las cards del tablero activo (boardId) del usuario */
export async function getCards(boardId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  // Seguridad: el board debe ser del usuario
  const owns = await prisma.board.findFirst({
    where: { id: boardId, userId },
    select: { id: true },
  });
  if (!owns) throw new Error("Tablero no existe o no es tuyo");

  return prisma.card.findMany({
    where: { userId, boardId },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: {
      id: true, title: true, tags: true, summary: true, createdAt: true, position: true,
      attachments: {
        select: { id: true, name: true, url: true, mime: true, size: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      notes: { select: { id: true, text: true, done: true } },
    },
  });
}

/* ===========================
 *           CARDS
 * =========================== */

/** AHORA requiere boardId: crea la tarjeta dentro del tablero activo */
export async function createCard(title: string, boardId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  // Verifica pertenencia del tablero
  const board = await prisma.board.findFirst({
    where: { id: boardId, userId },
    select: { id: true },
  });
  if (!board) throw new Error("Tablero no existe o no es tuyo");

  // próxima posición SOLO dentro de ese tablero
  const maxPos = await prisma.card.aggregate({
    where: { userId, boardId },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? -10) + 10; // mantén tu spacing si quieres

  const card = await prisma.card.create({
    data: {
      userId,
      boardId,
      title: title?.trim() || "Nuevo proyecto",
      tags: [],
      summary: "",
      position,
    },
    select: {
      id: true, title: true, tags: true, summary: true, createdAt: true, position: true,
      notes: true,
      attachments: true,
    },
  });

  // Revalida la página del tablero (si usas /boards/[boardId])
  revalidatePath(`/boards/${boardId}`);
  return card;
}

/** Compat: si aún la usas en algún sitio; ahora mejor usa getCards(boardId) */
export async function getCardsForUser(userId: string) {
  // ⚠️ OJO: esta función ignora boardId y trae TODO.
  // Mantengo por compatibilidad, pero idealmente migra a getCards(boardId).
  return prisma.card.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: {
      id: true, title: true, tags: true, summary: true, createdAt: true, position: true,
      attachments: {
        select: { id: true, name: true, url: true, mime: true, size: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      notes: { select: { id: true, text: true, done: true } },
    },
  });
}

/** Reordenamiento: ids del board activo en el nuevo orden visible */
export async function reorderCards(orderedIds: string[]) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  // filtra a sólo las cards del user (defensa)
  const own = await prisma.card.findMany({
    where: { userId, id: { in: orderedIds } },
    select: { id: true },
  });
  const allow = new Set<string>(own.map((c) => c.id));
  const ids = orderedIds.filter((id) => allow.has(id));

  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.card.update({
        where: { id, userId },
        data: { position: idx * 10 },
      })
    )
  );

  return { ok: true };
}

export async function updateCard(
  cardId: string,
  patch: { title?: string; tags?: string[]; summary?: string }
) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  await prisma.card.update({
    where: { id: cardId, userId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    },
  });

  // Si usas páginas por tablero, puedes revalidar la actual si la sabes
  // revalidatePath(`/boards/${boardId}`);
  revalidatePath("/");
}

export async function deleteCard(cardId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  // opcional: obtener boardId para revalidar la ruta específica
  const card = await prisma.card.findFirst({ where: { id: cardId, userId }, select: { boardId: true } });

  await prisma.card.delete({ where: { id: cardId, userId } });

  if (card?.boardId) revalidatePath(`/boards/${card.boardId}`);
  else revalidatePath("/");

  return { ok: true };
}

/* ===========================
 *           NOTES
 * =========================== */

export async function addNote(cardId: string, text: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  // defensa: la card debe ser tuya
  const card = await prisma.card.findFirst({ where: { id: cardId, userId }, select: { id: true } });
  if (!card) throw new Error("Proyecto no existe o no es tuyo");

  return prisma.note.create({
    data: { cardId, text: text.trim(), done: false },
    select: { id: true, cardId: true, text: true, done: true },
  });
}

export async function toggleNote(noteId: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  // alterna atómicamente
  await prisma.$executeRaw`UPDATE "Note" SET "done" = NOT "done" WHERE "id" = ${noteId}`;
  // sin revalidatePath (UI optimista)
}

export async function editNote(noteId: string, text: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  await prisma.note.update({ where: { id: noteId }, data: { text } });
}

export async function removeNote(noteId: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  await prisma.note.delete({ where: { id: noteId } });
}

/* ===========================
 *           TAGS
 * =========================== */

export async function addTag(cardId: string, tag: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  // defensa: la card debe ser tuya
  const card = await prisma.card.findFirst({ where: { id: cardId, userId }, select: { id: true } });
  if (!card) throw new Error("Proyecto no existe o no es tuyo");

  await prisma.card.update({
    where: { id: cardId, userId },
    data: { tags: { push: tag.trim() } },
  });
}

export async function removeTag(cardId: string, tag: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { tags: true, userId: true },
  });
  if (!card || card.userId !== userId) throw new Error("Proyecto no existe o no es tuyo");

  const newTags: string[] = (card.tags ?? []).filter((t: string) => t !== tag);

  await prisma.card.update({
    where: { id: cardId, userId },
    data: { tags: newTags },
  });
}
