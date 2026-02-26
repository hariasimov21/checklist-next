import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ModeToggle } from "@/components/ui/toogle";

export default async function Page() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id: string } | undefined)?.id;
  if (!userId) redirect("/login");

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-neutral-900/70 border-b border-stone-200 dark:border-neutral-700">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <h1 className="text-lg sm:text-xl font-semibold mr-auto">Checklist</h1>
          <ModeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">¿Qué quieres abrir?</h2>
        <p className="text-sm sm:text-base text-stone-600 dark:text-neutral-300 mb-8">
          Elige una modalidad antes de entrar.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/tasks"
            className="rounded-3xl border p-6 bg-white dark:bg-neutral-800 border-stone-200 dark:border-neutral-700 hover:shadow-md transition"
          >
            <div className="text-xl font-semibold">Tareas</div>
            <p className="mt-2 text-sm text-stone-600 dark:text-neutral-300">
              Ir al tablero actual por usuario.
            </p>
          </Link>

          <Link
            href="/notes"
            className="rounded-3xl border p-6 bg-white dark:bg-neutral-800 border-stone-200 dark:border-neutral-700 hover:shadow-md transition"
          >
            <div className="text-xl font-semibold">Notas</div>
            <p className="mt-2 text-sm text-stone-600 dark:text-neutral-300">
              Espacio tipo Apple Notes con edición continua.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
