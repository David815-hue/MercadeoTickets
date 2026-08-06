import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const ASSIGNEE_OPTIONS = ['Yarleny', 'Angelica', 'Yoselyn', 'Emma', 'Sin asignar'];

export default function AssigneeRulesModal({ isOpen, onClose, onRulesUpdated }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchRules();
        }
    }, [isOpen]);

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

            toast.success('Reglas de asignación guardadas exitosamente');
            if (onRulesUpdated) onRulesUpdated();
            onClose();
        } catch (err) {
            console.error('Error al guardar reglas:', err);
            toast.error('Ocurrió un error al guardar las reglas de asignación');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    // Agrupar por categoría
    const groupedRules = rules.reduce((acc, rule) => {
        if (!acc[rule.category]) acc[rule.category] = [];
        acc[rule.category].push(rule);
        return acc;
    }, {});

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div 
                className="modal-content" 
                style={{ maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} 
                onClick={(e) => e.stopPropagation()}
            >
                <button className="modal-close-btn" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </button>

                <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <i className="fa-solid fa-sliders" style={{ color: 'var(--color-primary)' }}></i>
                        Configuración de Asignaciones Automáticas
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Define qué gestora atenderá automáticamente cada tipo de solicitud al momento de ser creada.
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                    {loading ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <i className="fa-solid fa-circle-notch fa-spin fa-2x" style={{ marginBottom: '12px', color: 'var(--color-primary)' }}></i>
                            <p>Cargando reglas de asignación...</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {Object.entries(groupedRules).map(([catName, catRules]) => (
                                <div key={catName} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fa-solid fa-layer-group" style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}></i>
                                        {catName}
                                    </h4>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {catRules.map(rule => (
                                            <div 
                                                key={rule.id} 
                                                style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between', 
                                                    padding: '10px 14px', 
                                                    background: 'var(--bg-primary)', 
                                                    borderRadius: '8px', 
                                                    border: '1px solid var(--border-color)' 
                                                }}
                                            >
                                                <div>
                                                    <span style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-main)' }}>
                                                        {rule.sub_category && rule.sub_category !== 'General' ? rule.sub_category : catName}
                                                    </span>
                                                    {rule.sub_category && rule.sub_category !== 'General' && (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                                                            Subcategoría de {catName}
                                                        </span>
                                                    )}
                                                </div>

                                                <select
                                                    value={rule.assigned_to}
                                                    onChange={(e) => handleAssigneeChange(rule.id, e.target.value)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--bg-secondary)',
                                                        color: 'var(--text-main)',
                                                        fontSize: '0.86rem',
                                                        fontWeight: '600',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {ASSIGNEE_OPTIONS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={onClose} 
                        disabled={isSaving}
                    >
                        Cancelar
                    </button>
                    <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={handleSave} 
                        disabled={isSaving || loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <i className="fa-solid fa-floppy-disk"></i>
                        {isSaving ? 'Guardando...' : 'Guardar Asignaciones'}
                    </button>
                </div>
            </div>
        </div>
    );
}
