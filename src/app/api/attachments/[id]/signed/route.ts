import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1) Busca el attachment
  const att = await prisma.attachment.findUnique({
    where: { id },
    select: { url: true, name: true, mime: true, size: true },
  });
  if (!att) {
    return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
  }

  // 2) Genera la URL firmada (bucket "cards")
  //    att.url DEBE ser la ruta EXACTA con la que subiste el archivo al bucket.
  const { data, error } = await supabaseAdmin.storage
    .from("Cards")
    .createSignedUrl(att.url, 120);

  if (error || !data?.signedUrl) {
    console.error("signedUrl error:", error, "path:", att.url);
    return NextResponse.json({ error: "No se pudo firmar la URL" }, { status: 500 });
  }

  // 3) Respuesta limpia
  return NextResponse.json({
    ok: true,
    signedUrl: data.signedUrl,
    meta: att,
  });
}
