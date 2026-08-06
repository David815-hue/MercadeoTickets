-- ====================================================
-- ESQUEMA DE BASE DE DATOS PARA SISTEMA DE TICKETS
-- Ejecutar este script en el Editor SQL de tu panel de Supabase
-- ====================================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLA DE PERFILES DE USUARIOS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('farmacia', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- TABLA DE REGLAS DE ASIGNACIÓN AUTOMÁTICA POR CATEGORÍA
CREATE TABLE IF NOT EXISTS public.category_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    sub_category VARCHAR(100) DEFAULT '',
    assigned_to VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_category_sub UNIQUE (category, sub_category)
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
    status TEXT DEFAULT 'Recibido' CHECK (status IN ('Recibido', 'En Proceso', 'En Revision', 'Aprobado', 'Finalizado', 'Rechazado')) NOT NULL,
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
    (auth.jwt() ->> 'email') LIKE '%@system.com'
);

-- POLÍTICAS PARA TICKETS
CREATE POLICY "Ver tickets" 
ON public.tickets FOR SELECT 
USING (
    user_id = auth.uid() OR 
    (auth.jwt() ->> 'email') LIKE '%@system.com'
);

CREATE POLICY "Crear tickets" 
ON public.tickets FOR INSERT 
WITH CHECK (
    user_id = auth.uid() OR
    (auth.jwt() ->> 'email') LIKE '%@system.com'
);

CREATE POLICY "Actualizar tickets" 
ON public.tickets FOR UPDATE 
USING (
    (auth.jwt() ->> 'email') LIKE '%@system.com'
)
WITH CHECK (
    (auth.jwt() ->> 'email') LIKE '%@system.com'
);

CREATE POLICY "Actualizar tickets propios (farmacia)" 
ON public.tickets FOR UPDATE 
USING (
    user_id = auth.uid() AND (auth.jwt() ->> 'email') NOT LIKE '%@system.com' AND status = 'Recibido'
)
WITH CHECK (
    user_id = auth.uid() AND (auth.jwt() ->> 'email') NOT LIKE '%@system.com' AND status = 'Recibido'
);

-- POLÍTICAS PARA MENSAJES (CHAT)
CREATE POLICY "Ver mensajes" 
ON public.messages FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.tickets 
        WHERE id = ticket_id AND (user_id = auth.uid() OR (auth.jwt() ->> 'email') LIKE '%@system.com')
    )
);

CREATE POLICY "Enviar mensajes" 
ON public.messages FOR INSERT 
WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.tickets 
        WHERE id = ticket_id AND (user_id = auth.uid() OR (auth.jwt() ->> 'email') LIKE '%@system.com')
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
    
    IF new.email LIKE '%@system.com' THEN
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

-- ==========================================
-- CONFIGURACIÓN DE STORAGE PARA ADJUNTOS
-- ==========================================

-- Crear el bucket de almacenamiento para adjuntos si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Habilitar políticas de seguridad RLS en storage.objects para el bucket 'ticket-attachments'
CREATE POLICY "Permitir subida a usuarios autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "Permitir lectura de adjuntos a usuarios autenticados"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'ticket-attachments');

-- ====================================================
-- MEJORAS DE GESTIÓN DE PERFILES Y USUARIOS
-- ====================================================

-- 1. Añadir columna last_seen_at a public.profiles si no existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- 2. Habilitar política de UPDATE en profiles
DROP POLICY IF EXISTS "Permitir actualizar perfiles" ON public.profiles;
CREATE POLICY "Permitir actualizar perfiles" 
ON public.profiles FOR UPDATE
USING (
    auth.uid() = id OR 
    (auth.jwt() ->> 'email') LIKE '%@system.com'
)
WITH CHECK (
    auth.uid() = id OR 
    (auth.jwt() ->> 'email') LIKE '%@system.com'
);

-- 3. Función para crear usuarios (Security Definer)
CREATE OR REPLACE FUNCTION public.create_profile_user(
    p_username TEXT,
    p_password TEXT,
    p_role TEXT
)
RETURNS VOID AS $$
DECLARE
    new_user_id UUID;
    encrypted_pw TEXT;
    p_email TEXT;
BEGIN
    -- Generar email según el rol
    IF p_role = 'admin' THEN
        p_email := LOWER(p_username) || '@system.com';
    ELSE
        p_email := LOWER(p_username) || '@farmacia.com';
    END IF;

    -- Generar password encriptada (con crypt de pgcrypto)
    encrypted_pw := crypt(p_password, gen_salt('bf'));
    
    -- Insertar en auth.users con todos los tokens e inputs de email_change inicializados a '' (vacío) para evitar errores de tipo en GoTrue (Supabase Auth)
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_sso_user,
        is_anonymous,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        phone_change,
        phone_change_token,
        email_change_token_current,
        reauthentication_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        p_email,
        encrypted_pw,
        now(),
        now(),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('username', p_username),
        false,
        false,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
    )
    RETURNING id INTO new_user_id;

    -- El trigger handle_new_user creará el perfil automáticamente.
    -- Pero actualizamos el perfil para asegurar el username y rol correctos.
    UPDATE public.profiles
    SET username = UPPER(p_username),
        role = p_role
    WHERE id = new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Función para cambiar contraseña (Security Definer)
CREATE OR REPLACE FUNCTION public.update_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS VOID AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
BEGIN
    caller_id := auth.uid();
    
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    
    IF caller_role != 'admin' AND caller_id != p_user_id THEN
        RAISE EXCEPTION 'No autorizado para cambiar esta contraseña';
    END IF;
    
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Función para eliminar usuarios (Security Definer)
CREATE OR REPLACE FUNCTION public.delete_profile_user(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
BEGIN
    caller_id := auth.uid();
    SELECT role INTO caller_role FROM public.profiles WHERE id = caller_id;
    
    IF caller_role != 'admin' THEN
        RAISE EXCEPTION 'Solo los administradores pueden eliminar usuarios';
    END IF;
    
    DELETE FROM auth.users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Agregar columnas estructuradas para el formulario dinámico
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS requester_role TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS request_type TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS additional_info TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 7. Modificar estados de tickets y agregar campo de rechazo
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ALTER COLUMN status SET DEFAULT 'Recibido';
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('Recibido', 'En Proceso', 'En Revision', 'Aprobado', 'Finalizado', 'Rechazado'));
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS assigned_to TEXT DEFAULT 'Sin asignar';

-- ====================================================
-- MEJORAS DE NOTAS DE ADMIN Y AUDITORÍA (HISTORIAL)
-- ====================================================

-- 8. Crear tabla de Notas Internas de Administrador si no existe
CREATE TABLE IF NOT EXISTS public.admin_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    admin_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    admin_name TEXT NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en admin_notes
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Políticas para admin_notes
DROP POLICY IF EXISTS "Permitir a los administradores leer notas" ON public.admin_notes;
CREATE POLICY "Permitir a los administradores leer notas"
ON public.admin_notes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

DROP POLICY IF EXISTS "Permitir a los administradores insertar notas" ON public.admin_notes;
CREATE POLICY "Permitir a los administradores insertar notas"
ON public.admin_notes FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

DROP POLICY IF EXISTS "Permitir a los administradores borrar notas" ON public.admin_notes;
CREATE POLICY "Permitir a los administradores borrar notas"
ON public.admin_notes FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- 9. Crear tabla de Historial/Auditoría de Tickets
CREATE TABLE IF NOT EXISTS public.ticket_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    changed_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_by_name TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en ticket_history
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para ticket_history
DROP POLICY IF EXISTS "Permitir leer historial a usuarios asociados al ticket" ON public.ticket_history;
CREATE POLICY "Permitir leer historial a usuarios asociados al ticket" 
ON public.ticket_history FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.tickets 
        WHERE id = ticket_id AND (user_id = auth.uid() OR (auth.jwt() ->> 'email') LIKE '%@system.com')
    )
);

DROP POLICY IF EXISTS "Permitir insertar historial a administradores o triggers" ON public.ticket_history;
CREATE POLICY "Permitir insertar historial a administradores o triggers" 
ON public.ticket_history FOR INSERT 
WITH CHECK (true);

-- 10. Función y Trigger automático para auditoría de cambios de estado en public.tickets
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger AS $$
DECLARE
    caller_username TEXT;
BEGIN
    -- Obtener nombre de usuario que realiza el cambio
    SELECT username INTO caller_username FROM public.profiles WHERE id = auth.uid();
    IF caller_username IS NULL THEN
        caller_username := 'Sistema';
    END IF;

    -- Si cambió el estado, registrar en el historial
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.ticket_history (ticket_id, changed_by_id, changed_by_name, previous_status, new_status)
        VALUES (NEW.id, auth.uid(), caller_username, OLD.status, NEW.status);
    END IF;

    -- Actualizar fecha de finalización si aplica
    IF NEW.status IN ('Finalizado', 'Aprobado', 'Rechazado') AND OLD.status NOT IN ('Finalizado', 'Aprobado', 'Rechazado') THEN
        NEW.finalized_at := now();
    ELSIF NEW.status NOT IN ('Finalizado', 'Aprobado', 'Rechazado') THEN
        NEW.finalized_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Instalar Trigger
DROP TRIGGER IF EXISTS on_ticket_status_update ON public.tickets;
CREATE TRIGGER on_ticket_status_update
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_status_change();


-- ====================================================
-- LIMPIEZA AUTOMÁTICA DE TICKETS COMPLETADOS (RPC)
-- ====================================================
-- Elimina mensajes, entregables y todos sus archivos asociados (incluyendo adjuntos iniciales) en storage después de 2 semanas de finalizado
CREATE OR REPLACE FUNCTION public.cleanup_old_completed_tickets()
RETURNS json AS $$
DECLARE
    ticket_rec RECORD;
    msg_deleted_count INT := 0;
    del_deleted_count INT := 0;
    storage_deleted_count INT := 0;
    tk_count INT := 0;
    result json;
BEGIN
    FOR ticket_rec IN 
        SELECT id FROM public.tickets 
        WHERE finalized_at IS NOT NULL 
          AND finalized_at < now() - INTERVAL '2 weeks'
    LOOP
        -- 1. Eliminar TODOS los archivos del ticket en storage (adjuntos iniciales, entregables, imágenes de chat)
        WITH deleted_storage AS (
            DELETE FROM storage.objects 
            WHERE bucket_id = 'ticket-attachments' 
              AND name LIKE 'tickets/' || ticket_rec.id || '/%'
            RETURNING id
        )
        SELECT COALESCE(COUNT(*), 0) + storage_deleted_count INTO storage_deleted_count FROM deleted_storage;

        -- 2. Limpiar el campo de adjuntos iniciales (attachments) en el ticket
        UPDATE public.tickets 
        SET attachments = '[]'::jsonb 
        WHERE id = ticket_rec.id;

        -- 3. Eliminar filas de la tabla de entregables
        WITH deleted_del AS (
            DELETE FROM public.ticket_deliverables
            WHERE ticket_id = ticket_rec.id
            RETURNING id
        )
        SELECT COALESCE(COUNT(*), 0) + del_deleted_count INTO del_deleted_count FROM deleted_del;

        -- 4. Eliminar filas de la tabla de mensajes
        WITH deleted_msg AS (
            DELETE FROM public.messages
            WHERE ticket_id = ticket_rec.id
            RETURNING id
        )
        SELECT COALESCE(COUNT(*), 0) + msg_deleted_count INTO msg_deleted_count FROM deleted_msg;

        tk_count := tk_count + 1;
    END LOOP;

    result := json_build_object(
        'cleaned_tickets_count', tk_count,
        'messages_deleted', msg_deleted_count,
        'deliverables_deleted', del_deleted_count,
        'files_deleted', storage_deleted_count
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cleanup_old_completed_tickets() TO authenticated;


-- ====================================================
-- GESTIÓN DE CONTACTOS POR FARMACIA (NOTIFICACIONES)
-- ====================================================

CREATE TABLE IF NOT EXISTS public.pharmacy_contacts (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
    regente_name TEXT,
    regente_email TEXT,
    jefe_name TEXT,
    jefe_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.pharmacy_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leer contactos a todos" ON public.pharmacy_contacts;
CREATE POLICY "Permitir leer contactos a todos" 
ON public.pharmacy_contacts FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Permitir actualizar contactos a administradores" ON public.pharmacy_contacts;
CREATE POLICY "Permitir actualizar contactos a administradores" 
ON public.pharmacy_contacts FOR UPDATE 
USING ( (auth.jwt() ->> 'email') LIKE '%@system.com' );

DROP POLICY IF EXISTS "Permitir insertar contactos a todos" ON public.pharmacy_contacts;
CREATE POLICY "Permitir insertar contactos a todos" 
ON public.pharmacy_contacts FOR INSERT 
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.handle_new_pharmacy_contacts()
RETURNS trigger AS $$
BEGIN
    IF NEW.role = 'farmacia' THEN
        INSERT INTO public.pharmacy_contacts (profile_id)
        VALUES (NEW.id)
        ON CONFLICT (profile_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_contacts ON public.profiles;
CREATE TRIGGER on_profile_created_contacts
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_pharmacy_contacts();




