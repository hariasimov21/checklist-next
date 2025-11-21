import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }   // 👈 Promise
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = await params;                     // 👈 await

    const att = await prisma.attachment.findFirst({
      where: { id, card: { userId } },
      select: { url: true },
    });
    if (!att) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const { error: delErr } = await supabaseAdmin.storage
      .from("Cards")
      .remove([att.url]);
    if (delErr) {
      console.error("[delete] supabase error", delErr);
      return NextResponse.json({ error: "No se pudo eliminar del storage" }, { status: 500 });
    }

    await prisma.attachment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete] fatal", err);
    return NextResponse.json({ error: "Error eliminando archivo" }, { status: 500 });
  }
}
