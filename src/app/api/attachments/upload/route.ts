import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const form = await req.formData();

    const cardId = String(form.get("cardId") || "");
    if (!cardId) {
      return NextResponse.json({ error: "cardId requerido" }, { status: 400 });
    }

    const ownsCard = await prisma.card.findFirst({
      where: { id: cardId, userId },
      select: { id: true },
    });
    if (!ownsCard) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const files = form.getAll("files") as File[];
    if (!files.length) {
      return NextResponse.json({ error: "Sin archivos" }, { status: 400 });
    }

    const MAX = 10 * 1024 * 1024; // 10MB
    const created: Array<{
      id: string;
      name: string;
      url: string;   // guardamos el PATH interno
      mime: string;
      size: number;
      createdAt: Date;
    }> = [];

    for (const file of files) {
      if (file.size > MAX) {
        return NextResponse.json(
          { error: `Archivo ${file.name} supera 10MB` },
          { status: 413 }
        );
      }

      // Path único dentro del bucket privado "Cards"
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
      const path = `cards/${cardId}/${randomUUID()}-${safeName}`;

      // Subir a Supabase Storage (bucket privado)
      const arrayBuffer = await file.arrayBuffer();
      const { error: upErr } = await supabaseAdmin.storage
        .from("Cards") // ⚠️ respeta mayúsculas/minúsculas del bucket
        .upload(path, Buffer.from(arrayBuffer), {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (upErr) {
        console.error("[upload] supabase error", upErr);
        return NextResponse.json(
          { error: `Error subiendo ${file.name}` },
          { status: 500 }
        );
      }

      // Registrar attachment en BD (guardamos el PATH interno en `url`)
      const att = await prisma.attachment.create({
        data: {
          cardId,
          name: file.name,
          url: path, // <- PATH interno, no URL pública
          mime: file.type || "application/octet-stream",
          size: file.size,
        },
        select: {
          id: true,
          name: true,
          url: true,
          mime: true,
          size: true,
          createdAt: true,
        },
      });

      created.push(att);
    }

    // Tu cliente acepta ambos formatos; devolvemos el “oficial” con attachments
    return NextResponse.json({ ok: true, attachments: created });
  } catch (err) {
    console.error("[upload] fatal", err);
    return NextResponse.json(
      { error: "Error subiendo archivos" },
      { status: 500 }
    );
  }
}
