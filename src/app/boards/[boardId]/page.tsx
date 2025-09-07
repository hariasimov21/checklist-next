import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ChecklistBoard from "@/components/CheklistBoard"; // ajusta si tu ruta difiere

type Params = { boardId: string };

export default async function BoardPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const { boardId } = await params; // 👈 AHORA sí
  const boards = await prisma.board.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!boards.length) {
    const b = await prisma.board.create({
      data: { userId, name: "General" },
      select: { id: true },
    });
    redirect(`/boards/${b.id}`);
  }

  if (!boards.some((b) => b.id === boardId)) notFound();

  const cards = await prisma.card.findMany({
    where: { userId, boardId },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      tags: true,
      createdAt: true,
      position: true,
      notes: { select: { id: true, text: true, done: true } },
      attachments: {
        select: {
          id: true,
          name: true,
          url: true,
          mime: true,
          size: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return (
    <ChecklistBoard
      initialCards={cards}
      boards={boards}
      activeBoardId={boardId}
    />
  );
}
