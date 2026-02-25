import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function TasksEntryPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string } | undefined)?.id;
  if (!userId) redirect("/login");

  let firstBoard = await prisma.board.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!firstBoard) {
    firstBoard = await prisma.board.create({
      data: { userId, name: "General" },
      select: { id: true },
    });
  }

  redirect(`/boards/${firstBoard.id}`);
}
