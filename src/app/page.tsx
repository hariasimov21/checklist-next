import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ChecklistBoard from "@/components/CheklistBoard";

export default async function Page() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string })?.id;

  if (!userId) redirect("/login");

  const cards = await prisma.card.findMany({
    where: { userId },
    include: { notes: true },
    orderBy: { createdAt: "desc" },
  });

  return <ChecklistBoard initialCards={cards} />;
}
