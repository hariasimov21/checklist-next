"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");



  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await signIn("credentials", { email, password, callbackUrl: "/" });
      }}
      className="min-h-screen grid place-items-center"
    >
      <div className="p-6 border rounded-xl w-80">
        <h1 className="text-lg font-semibold mb-4">Iniciar sesión</h1>
        <input className="border w-full mb-2 p-2" placeholder="email"
               value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="border w-full mb-4 p-2" placeholder="contraseña" type="password"
               value={password} onChange={(e)=>setPassword(e.target.value)} />
        <button className="w-full px-3 py-2 bg-black text-white rounded">Entrar</button>
        <a href="/signup" className="block text-center mt-2 text-sm underline">Crear cuenta</a>
      </div>
    </form>
  );
}
