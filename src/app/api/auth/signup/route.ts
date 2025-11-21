import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Signup attempt", { email: body?.email });

    const { email, password, name } = body ?? {};
    if (!email || !password) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "Ya existe" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    return NextResponse.json(
      { id: user.id, email: user.email },
      { status: 201 }
    );
  } catch (err) {
    console.error("ERROR en signup:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
