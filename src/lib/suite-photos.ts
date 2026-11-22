import { getSupabaseEnv } from "@/lib/supabase/env";

// Fotos das suites ficam na pasta PUBLICA "suite-photos" do Storage do
// Supabase (07_portal_cliente.sql): <motel_id>/<suite_id>/<arquivo>.webp
export const PHOTO_BUCKET = "suite-photos";
export const MAX_PHOTOS = 8;

export function photoUrl(path: string): string {
  const { url } = getSupabaseEnv();
  return `${url}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
