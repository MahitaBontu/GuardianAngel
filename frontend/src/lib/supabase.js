import { createClient } from '@supabase/supabase-js'

//environment variables are loaded from .env file at the root of the frontend directory
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
