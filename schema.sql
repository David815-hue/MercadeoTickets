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
    ticket_number SERIAL,
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

-- ==========================================
-- RESTRICCIÓN DE CHAT: LA FARMACIA SOLO RESPONDE SI EL ADMIN INICIA
-- ==========================================
CREATE OR REPLACE FUNCTION public.check_message_permission()
RETURNS trigger AS $$
DECLARE
    sender_role TEXT;
    admin_message_exists BOOLEAN;
BEGIN
    -- Obtener el rol del remitente
    SELECT role INTO sender_role FROM public.profiles WHERE id = NEW.sender_id;
    
    -- Si el remitente es de tipo 'farmacia' (no admin)
    IF sender_role = 'farmacia' THEN
        -- Verificar si existe algún mensaje anterior de un administrador para este ticket
        SELECT EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.profiles p ON m.sender_id = p.id
            WHERE m.ticket_id = NEW.ticket_id AND p.role = 'admin'
        ) INTO admin_message_exists;
        
        -- Si no hay mensaje de admin previo, rechazar el envío
        IF NOT admin_message_exists THEN
            RAISE EXCEPTION 'No puedes enviar mensajes en este ticket hasta que el administrador inicie la conversación.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_message_inserting
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_message_permission();

-- ==========================================
-- SISTEMA DE LLENADO DE BASE DE DATOS (RPC)
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_db_size()
RETURNS json AS $$
DECLARE
    db_size_bytes BIGINT;
    db_limit_bytes BIGINT := 524288000; -- 500 MB en bytes
    db_percentage NUMERIC;
    
    storage_size_bytes BIGINT;
    storage_limit_bytes BIGINT := 1073741824; -- 1 GB en bytes
    storage_percentage NUMERIC;
BEGIN
    -- 1. Obtener tamaño de base de datos
    db_size_bytes := pg_database_size(current_database());
    db_percentage := ROUND((db_size_bytes::numeric / db_limit_bytes::numeric) * 100, 2);
    
    -- 2. Obtener tamaño de archivos en storage (todos los buckets)
    BEGIN
        SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
        INTO storage_size_bytes
        FROM storage.objects;
    EXCEPTION WHEN OTHERS THEN
        storage_size_bytes := 0;
    END;
    
    storage_percentage := ROUND((storage_size_bytes::numeric / storage_limit_bytes::numeric) * 100, 2);

    RETURN json_build_object(
        'db', json_build_object(
            'size_bytes', db_size_bytes,
            'size_pretty', pg_size_pretty(db_size_bytes),
            'limit_bytes', db_limit_bytes,
            'limit_pretty', '500 MB',
            'percentage', db_percentage
        ),
        'storage', json_build_object(
            'size_bytes', storage_size_bytes,
            'size_pretty', pg_size_pretty(storage_size_bytes),
            'limit_bytes', storage_limit_bytes,
            'limit_pretty', '1 GB',
            'percentage', storage_percentage
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_db_size() TO authenticated;


