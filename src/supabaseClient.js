// ====================================================
// CLIENTE DE CONEXIÓN DE SUPABASE (REACT)
// ====================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_KEY = 'ticket_system_supabase_url';
const SUPABASE_ANON_KEY_KEY = 'ticket_system_supabase_anon_key';

// Credenciales por defecto para entornos desplegados (Vercel, Netlify, etc.)
const HARDCODED_URL = 'https://twfzmahhybxzphswendg.supabase.co';
const HARDCODED_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZnptYWhoeWJ4enBoc3dlbmRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjcyMjIsImV4cCI6MjA5Njg0MzIyMn0.LRbxnKpsp7NxAJW_dXhoiDI8jQUz3WD5p2U_XPWvzrU';

// Rellenar desde .env si existe en Vite, o usar fallback directo
const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || HARDCODED_URL;
const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || HARDCODED_ANON_KEY;

export const getSupabaseConfig = () => {
    const url = ENV_SUPABASE_URL || localStorage.getItem(SUPABASE_URL_KEY) || HARDCODED_URL;
    const key = ENV_SUPABASE_ANON_KEY || localStorage.getItem(SUPABASE_ANON_KEY_KEY) || HARDCODED_ANON_KEY;
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
