
-- ============================================
-- EJECUTA ESTE CÓDIGO EN EL SQL EDITOR DE SUPABASE
-- ============================================

-- 1. ELIMINAR tabla existente (si hay conflictos)
DROP TABLE IF EXISTS public.operaciones CASCADE;

-- 2. CREAR tabla operaciones con estructura correcta
CREATE TABLE public.operaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cuenta_id TEXT NOT NULL,
    fecha DATE NOT NULL,
    tipo TEXT,
    activo TEXT,
    estrategia TEXT,
    contratos INTEGER,
    tipo_entrada TEXT,
    tipo_salida TEXT,
    hora_entrada TIME,
    hora_salida TIME,
    importe DECIMAL(10,2) NOT NULL DEFAULT 0,
    animo TEXT,
    notas TEXT,
    media_url TEXT,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 3. CREAR índices para rendimiento
CREATE INDEX idx_operaciones_user_id ON public.operaciones(user_id);
CREATE INDEX idx_operaciones_cuenta_id ON public.operaciones(cuenta_id);
CREATE INDEX idx_operaciones_fecha ON public.operaciones(fecha);

-- 4. HABILITAR Row Level Security
ALTER TABLE public.operaciones ENABLE ROW LEVEL SECURITY;

-- 5. CREAR políticas de seguridad
CREATE POLICY "Users can view their own operations" 
ON public.operaciones FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own operations" 
ON public.operaciones FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own operations" 
ON public.operaciones FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own operations" 
ON public.operaciones FOR DELETE 
USING (auth.uid() = user_id);

-- ============================================
-- VERIFICACIÓN: Ejecuta esto después para confirmar
-- ============================================
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'operaciones' 
-- ORDER BY ordinal_position;
