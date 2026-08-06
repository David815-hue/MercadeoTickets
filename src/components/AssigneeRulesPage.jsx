import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const ASSIGNEE_COLORS = {
    'Yarleny':    { bg: '#a855f7' },
    'Angelica':   { bg: '#0ea5e9' },
    'Yoselyn':    { bg: '#ec4899' },
    'Emma':       { bg: '#3b82f6' },
    'Sin asignar':{ bg: '#64748b' },
};

function AssigneeAvatar({ name, size = 24 }) {
    if (name === 'Sin asignar') {
        return (
            <span style={{
                width: size, height: size, borderRadius: '50%',
                background: 'rgba(100, 116, 139, 0.15)',
                border: '1.5px dashed #64748b',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#64748b', flexShrink: 0,
            }}>
                <i className="fa-solid fa-user-slash" style={{ fontSize: size * 0.4 + 'px' }}></i>
            </span>
        );
    }
    const colors = ASSIGNEE_COLORS[name] || { bg: '#6366f1' };
    const initial = (name || '?').charAt(0).toUpperCase();
    return (
        <span style={{
            width: size, height: size, borderRadius: '50%',
            background: colors.bg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.44 + 'px', fontWeight: 800, color: '#fff',
            flexShrink: 0,
            boxShadow: `0 0 0 2px ${colors.bg}33`,
        }}>
            {initial}
        </span>
    );
}

function AssigneeSelectDropdown({ value, onChange, openUpward = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'Yarleny',     label: 'Yarleny' },
        { value: 'Angelica',    label: 'Angelica' },
        { value: 'Yoselyn',     label: 'Yoselyn' },
        { value: 'Emma',        label: 'Emma' },
        { value: 'Sin asignar', label: 'Sin asignar' },
    ];

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value) || { value: value || 'Sin asignar', label: value || 'Sin asignar' };

    return (
        <div className="custom-dropdown" ref={dropdownRef} style={{ width: '185px', position: 'relative', zIndex: isOpen ? 1000 : 1 }}>
            <button
                type="button"
                className="custom-dropdown-trigger"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.86rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AssigneeAvatar name={selectedOption.value} size={22} />
                    <span>{selectedOption.label}</span>
                </div>
                <i className={`fa-solid fa-chevron-down dropdown-arrow ${isOpen ? 'open' : ''}`} style={{ fontSize: '0.75rem', opacity: 0.6 }}></i>
            </button>

            {isOpen && (
                <div 
                    className="custom-dropdown-menu" 
                    style={{
                        position: 'absolute',
                        top: openUpward ? 'auto' : 'calc(100% + 4px)',
                        bottom: openUpward ? 'calc(100% + 4px)' : 'auto',
                        right: 0,
                        width: '185px',
                        zIndex: 9999,
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                    }}
                >
                    {options.map((opt) => (
                        <div
                            key={opt.value}
                            className={`custom-dropdown-item ${value === opt.value ? 'selected' : ''}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            style={{
                                padding: '8px 10px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                background: value === opt.value ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                color: value === opt.value ? 'var(--color-primary)' : 'var(--text-main)',
                                fontWeight: value === opt.value ? '700' : '500',
                                fontSize: '0.86rem'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AssigneeAvatar name={opt.value} size={22} />
                                <span>{opt.label}</span>
                            </div>
                            {value === opt.value && (
                                <i className="fa-solid fa-check" style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}></i>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const CATEGORY_ICONS = {
    'Artes Digital': 'fa-solid fa-laptop-code',
    'Rotulación Interna': 'fa-solid fa-sheet-plastic',
    'Material para impresión': 'fa-solid fa-print',
    'Recetarios Médicos': 'fa-solid fa-file-medical',
    'Activaciones/Eventos/Insumos/Utileria': 'fa-solid fa-kit-medical',
    'Rotulación Externa': 'fa-solid fa-store'
};

const CATEGORY_COLORS = {
    'Artes Digital': '#a855f7',
    'Rotulación Interna': '#ec4899',
    'Material para impresión': '#0ea5e9',
    'Recetarios Médicos': '#10b981',
    'Activaciones/Eventos/Insumos/Utileria': '#f59e0b',
    'Rotulación Externa': '#3b82f6'
};

export default function AssigneeRulesPage({ onBack }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('category_assignees')
                .select('*')
                .order('category', { ascending: true })
                .order('sub_category', { ascending: true });

            if (error) throw error;
            setRules(data || []);
        } catch (err) {
            console.error('Error al cargar reglas de asignación:', err);
            toast.error('No se pudieron cargar las reglas de asignación');
        } finally {
            setLoading(false);
        }
    };

    const handleAssigneeChange = (id, newAssignee) => {
        setRules(prev => prev.map(rule => rule.id === id ? { ...rule, assigned_to: newAssignee } : rule));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            for (const rule of rules) {
                const { error } = await supabase
                    .from('category_assignees')
                    .update({ 
                        assigned_to: rule.assigned_to,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', rule.id);

                if (error) throw error;
            }

            toast.success('Reglas de asignación actualizadas exitosamente');
        } catch (err) {
            console.error('Error al guardar reglas:', err);
            toast.error('Ocurrió un error al guardar las reglas');
        } finally {
            setIsSaving(false);
        }
    };

    // Agrupar reglas por categoría
    const groupedRules = rules.reduce((acc, rule) => {
        if (!acc[rule.category]) acc[rule.category] = [];
        acc[rule.category].push(rule);
        return acc;
    }, {});

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
            {/* Header de la página */}
            <div 
                style={{
                    background: 'var(--bg-card)',
                    borderRadius: '20px',
                    padding: '24px 30px',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div 
                        style={{
                            width: '52px',
                            height: '52px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-primary)',
                            fontSize: '1.4rem'
                        }}
                    >
                        <i className="fa-solid fa-sliders"></i>
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)' }}>
                            Reglas de Asignación Automática
                        </h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                            Configura a qué encargada se asignará automáticamente cada tipo de solicitud al ser creada por farmacias o administradores.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {onBack && (
                        <button 
                            type="button" 
                            className="btn btn-secondary" 
                            onClick={onBack}
                            style={{ borderRadius: '20px', padding: '8px 18px', fontWeight: '600' }}
                        >
                            <i className="fa-solid fa-arrow-left" style={{ marginRight: '6px' }}></i>
                            Volver
                        </button>
                    )}
                    <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={handleSave} 
                        disabled={isSaving || loading}
                        style={{ borderRadius: '20px', padding: '8px 22px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)' }}
                    >
                        <i className="fa-solid fa-floppy-disk"></i>
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>

            {/* Contenido principal: Tarjetas por Sección / Categoría */}
            {loading ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-circle-notch fa-spin fa-3x" style={{ marginBottom: '16px', color: 'var(--color-primary)' }}></i>
                    <p style={{ fontSize: '1rem', fontWeight: '600' }}>Cargando reglas de asignación...</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px' }}>
                    {Object.entries(groupedRules).map(([catName, catRules]) => {
                        const catIcon = CATEGORY_ICONS[catName] || 'fa-solid fa-layer-group';
                        const catColor = CATEGORY_COLORS[catName] || '#6366f1';

                        return (
                            <div 
                                key={catName} 
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '18px',
                                    padding: '20px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative'
                                }}
                            >
                                <div>
                                    {/* Cabecera de Categoría */}
                                    <div 
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            paddingBottom: '14px',
                                            marginBottom: '16px',
                                            borderBottom: '1px solid var(--border-color)'
                                        }}
                                    >
                                        <div 
                                            style={{
                                                width: '38px',
                                                height: '38px',
                                                borderRadius: '12px',
                                                background: `${catColor}18`,
                                                color: catColor,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '1.1rem',
                                                fontWeight: '700'
                                            }}
                                        >
                                            <i className={catIcon}></i>
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: '800', color: 'var(--text-main)' }}>
                                                {catName}
                                            </h3>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                {catRules.length} {catRules.length === 1 ? 'opción configurada' : 'opciones configuradas'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Lista de Opciones / Subcategorías */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {catRules.map((rule, idx) => {
                                            const isLast = idx >= catRules.length - 2;
                                            const displayName = (rule.sub_category && rule.sub_category !== 'General')
                                                ? rule.sub_category
                                                : `Solicitudes generales de ${catName}`;

                                            return (
                                                <div 
                                                    key={rule.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '12px 14px',
                                                        background: 'var(--bg-secondary)',
                                                        borderRadius: '12px',
                                                        border: '1px solid var(--border-color)',
                                                        gap: '12px',
                                                        position: 'relative'
                                                    }}
                                                >
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-main)', display: 'block' }}>
                                                            {displayName}
                                                        </span>
                                                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                            Asignación predeterminada
                                                        </span>
                                                    </div>

                                                    <AssigneeSelectDropdown 
                                                        value={rule.assigned_to}
                                                        onChange={(newVal) => handleAssigneeChange(rule.id, newVal)}
                                                        openUpward={isLast}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
