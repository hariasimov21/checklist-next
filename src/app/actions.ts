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

// ---- CARDS ----
export async function createCard(title: string) {
    const session = await getServerSession(authOptions);
    const userId = assertAuth(session);
    await prisma.card.create({
        data: { userId, title: title?.trim() || "Nuevo proyecto", tags: [] },
    });
    revalidatePath("/");
}

export async function updateCard(cardId: string, patch: { title?: string; tags?: string[] }) {
    const session = await getServerSession(authOptions);
    const userId = assertAuth(session);
    await prisma.card.update({
        where: { id: cardId, userId },
        data: patch,
    });
    revalidatePath("/");
}

export async function deleteCard(cardId: string) {
    const session = await getServerSession(authOptions);
    const userId = assertAuth(session);
    await prisma.card.delete({ where: { id: cardId, userId } });
    revalidatePath("/");
}

// ---- NOTES ----
export async function addNote(cardId: string, text: string) {
    const session = await getServerSession(authOptions);
    assertAuth(session);
    await prisma.note.create({ data: { cardId, text: text.trim() } });
    revalidatePath("/");
}

export async function toggleNote(noteId: string) {
    const session = await getServerSession(authOptions);
    assertAuth(session);
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw new Error("Nota no existe");
    await prisma.note.update({ where: { id: noteId }, data: { done: !note.done } });
    revalidatePath("/");
}

export async function editNote(noteId: string, text: string) {
    const session = await getServerSession(authOptions);
    assertAuth(session);
    await prisma.note.update({ where: { id: noteId }, data: { text } });
    revalidatePath("/");
}

export async function removeNote(noteId: string) {
    const session = await getServerSession(authOptions);
    assertAuth(session);
    await prisma.note.delete({ where: { id: noteId } });
    revalidatePath("/");
}

// ---- TAGS ----
export async function addTag(cardId: string, tag: string) {
    const session = await getServerSession(authOptions);
    const userId = assertAuth(session);
    await prisma.card.update({
        where: { id: cardId, userId },
        data: { tags: { push: tag.trim() } },
    });
    revalidatePath("/");
}

export async function removeTag(cardId: string, tag: string) {
    const session = await getServerSession(authOptions);
    const userId = assertAuth(session);

    // traemos sólo lo necesario y validamos ownership
    const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { tags: true, userId: true },
    });
    if (!card || card.userId !== userId) throw new Error("Proyecto no existe o no es tuyo");

    // 👇 Tipado explícito: string[]
    const newTags: string[] = (card.tags ?? []).filter((t: string) => t !== tag);

    await prisma.card.update({
        where: { id: cardId, userId },
        data: { tags: newTags },
    });

    revalidatePath("/");
}
