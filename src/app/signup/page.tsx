"use client";
import { useState } from "react";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");

    return (
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
            className="min-h-screen grid place-items-center"
        >
            <div className="p-6 border rounded-xl w-80">
                <h1 className="text-lg font-semibold mb-4">Crear cuenta</h1>
                <input className="border w-full mb-2 p-2" placeholder="nombre (opcional)"
                    value={name} onChange={(e) => setName(e.target.value)} />
                <input className="border w-full mb-2 p-2" placeholder="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="border w-full mb-4 p-2" placeholder="contraseña (min 6)" type="password"
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="w-full px-3 py-2 bg-black text-white rounded">Registrarme</button>
            </div>
        </form>
    );
}
