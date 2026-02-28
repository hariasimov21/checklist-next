import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "Cards";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path") ?? "";
    if (!path) {
      return NextResponse.json({ error: "path requerido" }, { status: 400 });
    }

    const expectedPrefix = `notes/${userId}/`;
    if (!path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(path);

    if (error || !data) {
      console.error("[notes-image-get] supabase error", error);
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    return new Response(data, {
      status: 200,
      headers: {
        "content-type": data.type || "application/octet-stream",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[notes-image-get] fatal", err);
    return NextResponse.json({ error: "Error obteniendo imagen" }, { status: 500 });
  }
}

