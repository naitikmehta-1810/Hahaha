import { createClient } from "@/utils/supabase/middleware";
export async function middleware(request) {
    const { supabase, supabaseResponse } = createClient(request);
    await supabase.auth.getUser();
    return supabaseResponse;
}
export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
