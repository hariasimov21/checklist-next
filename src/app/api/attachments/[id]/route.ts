import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }   // 👈 Promise
) {
  try {
    const { id } = await params;                     // 👈 await

    const att = await prisma.attachment.findUnique({
      where: { id },
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
