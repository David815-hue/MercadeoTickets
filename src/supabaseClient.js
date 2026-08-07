// ====================================================
// CLIENTE DE CONEXIÓN DE SUPABASE (REACT)
// ====================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_KEY = 'ticket_system_supabase_url';
const SUPABASE_ANON_KEY_KEY = 'ticket_system_supabase_anon_key';

// Leer variables de entorno (Vercel / Vite .env)
const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const getSupabaseConfig = () => {
    const url = ENV_SUPABASE_URL || localStorage.getItem(SUPABASE_URL_KEY) || '';
    const key = ENV_SUPABASE_ANON_KEY || localStorage.getItem(SUPABASE_ANON_KEY_KEY) || '';
    return { url, key };
};

export const saveSupabaseConfig = (url, key) => {
    localStorage.setItem(SUPABASE_URL_KEY, url.trim());
    localStorage.setItem(SUPABASE_ANON_KEY_KEY, key.trim());
    window.location.reload();
};

export const clearSupabaseConfig = () => {
    localStorage.removeItem(SUPABASE_URL_KEY);
    localStorage.removeItem(SUPABASE_ANON_KEY_KEY);
    window.location.reload();
};

const config = getSupabaseConfig();

export const supabase = config.url && config.key 
    ? createClient(config.url, config.key) 
    : null;

export const isSupabaseConfigured = () => supabase !== null;
