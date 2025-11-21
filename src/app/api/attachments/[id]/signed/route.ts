import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export const runtime = "nodejs";

export async function GET(
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

    const { data, error } = await supabaseAdmin.storage
      .from("Cards")
      .createSignedUrl(att.url, 60);
    if (error || !data?.signedUrl) {
      console.error("[signed] supabase error", error);
      return NextResponse.json({ error: "No se pudo generar signed URL" }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error("[signed] fatal", err);
    return NextResponse.json({ error: "Error generando firma" }, { status: 500 });
  }
}
