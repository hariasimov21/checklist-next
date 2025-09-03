import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const cardId = String(form.get("cardId") || "");
    if (!cardId) return NextResponse.json({ error: "cardId requerido" }, { status: 400 });

    const files = form.getAll("files") as File[];
    if (!files.length) return NextResponse.json({ error: "Sin archivos" }, { status: 400 });

    const MAX = 10 * 1024 * 1024; // 10MB
    const uploaded: Array<{ id: string; name: string; mime: string; size: number }> = [];

    for (const file of files) {
      if (file.size > MAX) {
        return NextResponse.json({ error: `Archivo ${file.name} supera 10MB` }, { status: 413 });
      }

      // ruta única
      const ext = file.name.split(".").pop() || "";
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
      const path = `cards/${cardId}/${randomUUID()}-${safeName}`;

      // sube al bucket privado
      const arrayBuffer = await file.arrayBuffer();
      const { error: upErr } = await supabaseAdmin.storage
        .from("Cards")
        .upload(path, Buffer.from(arrayBuffer), {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (upErr) {
        console.error(upErr);
        return NextResponse.json({ error: `Error subiendo ${file.name}` }, { status: 500 });
      }

      // Guardamos la "url" como el PATH interno; luego generaremos signed URLs
      const rec = await prisma.attachment.create({
        data: {
          cardId,
          name: file.name,
          url: path, // 👈 guardamos el path, no una URL pública
          mime: file.type || "application/octet-stream",
          size: file.size,
        },
        select: { id: true, name: true, mime: true, size: true },
      });

      uploaded.push(rec);
    }

    return NextResponse.json({ ok: true, attachments: uploaded });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error subiendo archivos" }, { status: 500 });
  }
}
