import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("supabaseAdmin sólo puede usarse desde el servidor");
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!url) {
  throw new Error("SUPABASE_URL no configurada");
}
if (!serviceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE no configurada");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
