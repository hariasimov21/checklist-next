import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NotesWorkspace from "@/components/notes/NotesWorkspace";

export default async function NotesPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string } | undefined)?.id;
  if (!userId) redirect("/login");

  let folders = await prisma.noteFolder.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  let notes = await prisma.userNote.findMany({
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

  if (!notes.length) {
    const initial = await prisma.userNote.create({
      data: { userId, title: "Nueva nota", content: "", fontSize: 16, position: 0, folderId: null },
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
    notes = [initial];
  }

  if (!folders.length) {
    const defaultFolder = await prisma.noteFolder.create({
      data: { userId, name: "General", position: 0 },
      select: { id: true, name: true, position: true, createdAt: true, updatedAt: true },
    });
    folders = [defaultFolder];
  }

  return <NotesWorkspace initialNotes={notes} initialFolders={folders} />;
}
