export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-neutral-900">
      <div className="flex flex-col items-center gap-4 px-6">
        <img
          src="/cat-running.gif"
          alt="Cargando"
          className="w-40 h-40 object-contain select-none"
          draggable={false}
        />

        <div className="w-56 h-2 rounded-full bg-stone-300/70 dark:bg-neutral-700/80 overflow-hidden">
          <div className="loading-progress h-full rounded-full bg-stone-800 dark:bg-stone-200" />
        </div>
      </div>
    </div>
  );
}
