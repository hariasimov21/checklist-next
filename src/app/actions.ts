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

export async function deleteBoard(boardId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  await prisma.board.delete({ where: { id: boardId, userId } });
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
  const session = await getServerSession(authOptions);
  const currentUserId = assertAuth(session);

  if (userId && userId !== currentUserId) {
    throw new Error("No autorizado");
  }

  return prisma.card.findMany({
    where: { userId: currentUserId },
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
  const userId = assertAuth(session);

  const note = await prisma.note.findFirst({
    where: { id: noteId, card: { userId } },
    select: { id: true, done: true },
  });
  if (!note) throw new Error("Nota no encontrada o no es tuya");

  await prisma.note.update({
    where: { id: noteId },
    data: { done: !note.done },
  });
}

export async function editNote(noteId: string, text: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const note = await prisma.note.findFirst({
    where: { id: noteId, card: { userId } },
    select: { id: true },
  });
  if (!note) throw new Error("Nota no encontrada o no es tuya");

  await prisma.note.update({ where: { id: noteId }, data: { text } });
}

export async function removeNote(noteId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const note = await prisma.note.findFirst({
    where: { id: noteId, card: { userId } },
    select: { id: true },
  });
  if (!note) throw new Error("Nota no encontrada o no es tuya");

  await prisma.note.delete({ where: { id: noteId } });
}

/* ===========================
 *       PERSONAL NOTES
 * =========================== */

export async function listUserNotes() {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  return prisma.userNote.findMany({
    where: { userId },
    orderBy: [{ folderId: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      folderId: true,
      title: true,
      content: true,
      fontSize: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function listUserNoteFolders() {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  return prisma.noteFolder.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { notes: true } },
    },
  });
}

async function getNextNotePosition(userId: string, folderId: string | null) {
  const maxPos = await prisma.userNote.aggregate({
    where: { userId, folderId },
    _max: { position: true },
  });
  return (maxPos._max.position ?? -1) + 1;
}

export async function createUserNote(folderId?: string | null) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const normalizedFolderId = folderId ?? null;
  if (normalizedFolderId) {
    const folder = await prisma.noteFolder.findFirst({
      where: { id: normalizedFolderId, userId },
      select: { id: true },
    });
    if (!folder) throw new Error("Carpeta no encontrada o no es tuya");
  }

  const position = await getNextNotePosition(userId, normalizedFolderId);
  const note = await prisma.userNote.create({
    data: {
      userId,
      folderId: normalizedFolderId,
      title: "Nueva nota",
      content: "",
      fontSize: 16,
      position,
    },
    select: {
      id: true,
      folderId: true,
      title: true,
      content: true,
      fontSize: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  revalidatePath("/notes");
  return note;
}

export async function createUserNoteFolder(name?: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const base = (name ?? "").trim() || "Nueva carpeta";
  let folderName = base;
  let suffix = 2;
  // Evita choque de nombre por usuario
  while (await prisma.noteFolder.findFirst({ where: { userId, name: folderName }, select: { id: true } })) {
    folderName = `${base} ${suffix}`;
    suffix += 1;
  }

  const maxPos = await prisma.noteFolder.aggregate({
    where: { userId },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? -1) + 1;

  const folder = await prisma.noteFolder.create({
    data: { userId, name: folderName, position },
    select: { id: true, name: true, position: true, createdAt: true, updatedAt: true },
  });

  revalidatePath("/notes");
  return folder;
}

export async function renameUserNoteFolder(folderId: string, name: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nombre de carpeta requerido");

  const exists = await prisma.noteFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!exists) throw new Error("Carpeta no encontrada o no es tuya");

  const duplicate = await prisma.noteFolder.findFirst({
    where: { userId, name: trimmed, NOT: { id: folderId } },
    select: { id: true },
  });
  if (duplicate) throw new Error("Ya existe una carpeta con ese nombre");

  const folder = await prisma.noteFolder.update({
    where: { id: folderId },
    data: { name: trimmed },
    select: { id: true, name: true, position: true, createdAt: true, updatedAt: true },
  });

  revalidatePath("/notes");
  return folder;
}

export async function deleteUserNoteFolder(folderId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const folder = await prisma.noteFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) throw new Error("Carpeta no encontrada o no es tuya");

  await prisma.noteFolder.delete({ where: { id: folderId } });
  revalidatePath("/notes");
}

export async function updateUserNote(
  noteId: string,
  patch: { title?: string; content?: string; fontSize?: number; folderId?: string | null }
) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const exists = await prisma.userNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true, folderId: true },
  });
  if (!exists) throw new Error("Nota no encontrada o no es tuya");

  const nextFolderId = patch.folderId === undefined ? exists.folderId : patch.folderId;
  if (nextFolderId) {
    const folder = await prisma.noteFolder.findFirst({
      where: { id: nextFolderId, userId },
      select: { id: true },
    });
    if (!folder) throw new Error("Carpeta no encontrada o no es tuya");
  }

  const nextFontSize =
    patch.fontSize === undefined
      ? undefined
      : Math.min(40, Math.max(12, Math.round(patch.fontSize)));

  let nextPosition: number | undefined;
  if (patch.folderId !== undefined && patch.folderId !== exists.folderId) {
    nextPosition = await getNextNotePosition(userId, patch.folderId ?? null);
  }

  const note = await prisma.userNote.update({
    where: { id: noteId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() || "Nueva nota" } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(nextFontSize !== undefined ? { fontSize: nextFontSize } : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId ?? null } : {}),
      ...(nextPosition !== undefined ? { position: nextPosition } : {}),
    },
    select: {
      id: true,
      folderId: true,
      title: true,
      content: true,
      fontSize: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  revalidatePath("/notes");
  return note;
}

export async function deleteUserNote(noteId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const exists = await prisma.userNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
  if (!exists) throw new Error("Nota no encontrada o no es tuya");

  await prisma.userNote.delete({ where: { id: noteId } });
  revalidatePath("/notes");
}

export async function moveUserNote(noteId: string, direction: "up" | "down") {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const note = await prisma.userNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true, folderId: true, position: true },
  });
  if (!note) throw new Error("Nota no encontrada o no es tuya");

  const siblings = await prisma.userNote.findMany({
    where: { userId, folderId: note.folderId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });

  const currentIndex = siblings.findIndex((item) => item.id === note.id);
  if (currentIndex < 0) return;
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return;

  const target = siblings[targetIndex];

  await prisma.$transaction([
    prisma.userNote.update({ where: { id: note.id }, data: { position: target.position } }),
    prisma.userNote.update({ where: { id: target.id }, data: { position: note.position } }),
  ]);

  revalidatePath("/notes");
}

export async function moveUserNoteToFolder(noteId: string, folderId: string | null) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const note = await prisma.userNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true, folderId: true },
  });
  if (!note) throw new Error("Nota no encontrada o no es tuya");

  const nextFolderId = folderId ?? null;
  if (nextFolderId) {
    const folder = await prisma.noteFolder.findFirst({
      where: { id: nextFolderId, userId },
      select: { id: true },
    });
    if (!folder) throw new Error("Carpeta no encontrada o no es tuya");
  }

  if (note.folderId === nextFolderId) return;

  const nextPosition = await getNextNotePosition(userId, nextFolderId);
  await prisma.userNote.update({
    where: { id: note.id },
    data: { folderId: nextFolderId, position: nextPosition },
  });

  revalidatePath("/notes");
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
