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

/* ========== CARDS ========== */
export async function createCard(title: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  const card = await prisma.card.create({
    data: { userId, title: title?.trim() || "Nuevo proyecto", tags: [], summary: "" }, // 👈
    select: { id: true, title: true, tags: true, summary: true, createdAt: true },
  });

  // importante: la UI la maneja localmente, así que no revalides aquí
  return { ...card, notes: [] as { id: string; text: string; done: boolean }[] };
}

export async function updateCard(
  cardId: string,
  patch: { title?: string; tags?: string[]; summary?: string } // 👈
) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);
  await prisma.card.update({
    where: { id: cardId, userId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}), // 👈
    },
  });
  revalidatePath("/");
}

export async function deleteCard(cardId: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  await prisma.card.delete({ where: { id: cardId, userId } });

  // Si quieres que la página se refresque al eliminar un proyecto:
  revalidatePath("/");

  // TIP: o devuelve { ok: true } y quita esto si ya haces UI optimista.
}

/* ========== NOTES ========== */
export async function addNote(cardId: string, text: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  return prisma.note.create({
    data: { cardId, text: text.trim(), done: false },
    select: { id: true, cardId: true, text: true, done: true },
  });
}
export async function toggleNote(noteId: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  // ✅ Alterna sin SELECT previo (operación atómica)
  await prisma.$executeRaw`
    UPDATE "Note" SET "done" = NOT "done" WHERE "id" = ${noteId}
  `;

  // ❌ NO revalidatePath
}

export async function editNote(noteId: string, text: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  await prisma.note.update({ where: { id: noteId }, data: { text } });

  // ❌ NO revalidatePath
}

export async function removeNote(noteId: string) {
  const session = await getServerSession(authOptions);
  assertAuth(session);

  await prisma.note.delete({ where: { id: noteId } });

  // ❌ NO revalidatePath (esto era lo que te disparaba SELECTs de todo el tablero)
}

/* ========== TAGS ========== */
export async function addTag(cardId: string, tag: string) {
  const session = await getServerSession(authOptions);
  const userId = assertAuth(session);

  await prisma.card.update({
    where: { id: cardId, userId },
    data: { tags: { push: tag.trim() } },
  });

  // ❌ NO revalidatePath
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

  // ❌ NO revalidatePath
}
