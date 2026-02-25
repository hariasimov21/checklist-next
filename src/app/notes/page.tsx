import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NotesWorkspace from "@/components/notes/NotesWorkspace";

export default async function NotesPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string } | undefined)?.id;
  if (!userId) redirect("/login");
  // Compat de tipos mientras se ejecuta `prisma generate` con el nuevo modelo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userNote = (prisma as any).userNote;

  let notes = await userNote.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      fontSize: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!notes.length) {
    const initial = await userNote.create({
      data: { userId, title: "Nueva nota", content: "", fontSize: 16 },
      select: {
        id: true,
        title: true,
        content: true,
        fontSize: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    notes = [initial];
  }

  return <NotesWorkspace initialNotes={notes} />;
}
