"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");

    return (
        <div className="min-h-screen bg-stone-100 dark:bg-neutral-900">
            <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
                <div className="relative hidden md:block">
                    <Image
                        src="/header-inicio.jpg"
                        alt="Gatito"
                        fill
                        priority
                        unoptimized
                        quality={65}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="object-cover object-right"
                    />
                    <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-black/45 to-transparent" />
                </div>

                <div className="flex items-center justify-center p-6">
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const res = await fetch("/api/auth/signup", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ email, password, name }),
                            });
                            if (res.ok) window.location.href = "/login";
                            else alert("No se pudo crear la cuenta");
                        }}
                        className="w-full max-w-sm rounded-2xl border border-stone-300 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
                    >
                        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-neutral-100">Crear cuenta</h1>
                        <input
                            className="mb-2 w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            placeholder="nombre (opcional)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <input
                            className="mb-2 w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            placeholder="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <input
                            className="mb-4 w-full rounded-lg border border-stone-300 bg-white p-2 text-stone-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                            placeholder="contraseña (min 6)"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button className="w-full rounded-lg bg-black px-3 py-2 text-white dark:bg-white dark:text-black">
                            Registrarme
                        </button>
                        <Link href="/login" className="mt-2 block text-center text-sm underline">
                            Ya tengo cuenta
                        </Link>
                    </form>
                </div>
            </div>
        </div>
    );
}
