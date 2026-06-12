-- ====================================================
-- ESQUEMA DE BASE DE DATOS PARA SISTEMA DE TICKETS
-- Ejecutar este script en el Editor SQL de tu panel de Supabase
-- ====================================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Crear tabla de perfiles (roles y nombres de farmacia)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('farmacia', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Crear tabla de tickets
CREATE TABLE public.tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    pharmacy_name TEXT NOT NULL, -- Ej: PFH001
    description TEXT NOT NULL,
    status TEXT DEFAULT 'Aceptado' CHECK (status IN ('Aceptado', 'En revision', 'Resuelto')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- 4. Crear tabla de mensajes de chat
CREATE TABLE public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    sender_name TEXT NOT NULL, -- Ej: PFH001 o Administrador
    message_text TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLÍTICAS DE SEGURIDAD (RLS) - SIN RECURSIÓN
-- ==========================================

-- POLÍTICAS PARA PROFILES
CREATE POLICY "Permitir a los usuarios leer su propio perfil" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Permitir a los administradores leer todos los perfiles" 
ON public.profiles FOR SELECT 
USING (
    (auth.jwt() ->> 'email') LIKE 'admin%'
);

-- POLÍTICAS PARA TICKETS
CREATE POLICY "Ver tickets" 
ON public.tickets FOR SELECT 
USING (
    user_id = auth.uid() OR 
    (auth.jwt() ->> 'email') LIKE 'admin%'
);

CREATE POLICY "Crear tickets" 
ON public.tickets FOR INSERT 
WITH CHECK (
    user_id = auth.uid() AND
    (auth.jwt() ->> 'email') NOT LIKE 'admin%'
);

CREATE POLICY "Actualizar tickets" 
ON public.tickets FOR UPDATE 
USING (
    (auth.jwt() ->> 'email') LIKE 'admin%'
)
WITH CHECK (
    (auth.jwt() ->> 'email') LIKE 'admin%'
);

-- POLÍTICAS PARA MENSAJES (CHAT)
CREATE POLICY "Ver mensajes" 
ON public.messages FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.tickets 
        WHERE id = ticket_id AND (user_id = auth.uid() OR (auth.jwt() ->> 'email') LIKE 'admin%')
    )
);

CREATE POLICY "Enviar mensajes" 
ON public.messages FOR INSERT 
WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.tickets 
        WHERE id = ticket_id AND (user_id = auth.uid() OR (auth.jwt() ->> 'email') LIKE 'admin%')
    )
);

-- ==========================================
-- PROCESO DE REGISTRO AUTOMÁTICO (TRIGGER)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    username_val TEXT;
    role_val TEXT;
BEGIN
    username_val := UPPER(split_part(new.email, '@', 1));
    
    IF new.email LIKE 'admin%' THEN
        role_val := 'admin';
    ELSE
        role_val := 'farmacia';
    END IF;

    INSERT INTO public.profiles (id, username, role)
    VALUES (new.id, username_val, role_val);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
