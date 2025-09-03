import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(
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
