import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getPharmacyDisplayName } from '../utils/pharmacyMap';

export default function AuditLogModal({ isOpen, onClose, ticket }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && ticket?.id) {
            loadHistory();
        }
    }, [isOpen, ticket?.id]);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('ticket_history')
                .select('*')
                .eq('ticket_id', ticket.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setHistory(data || []);
        } catch (e) {
            console.error('Error al cargar historial del ticket:', e);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    // Colores e iconos por estado
    const STATUS_META = {
        'Recibido':    { icon: 'fa-solid fa-inbox',            color: '#06b6d4' },
        'En Proceso':  { icon: 'fa-solid fa-gears',            color: '#4f46e5' },
        'En Revision': { icon: 'fa-solid fa-magnifying-glass', color: '#f59e0b' },
        'Aprobado':    { icon: 'fa-solid fa-circle-check',     color: '#10b981' },
        'Finalizado':  { icon: 'fa-solid fa-flag-checkered',   color: '#64748b' },
        'Rechazado':   { icon: 'fa-solid fa-circle-xmark',     color: '#ef4444' },
    };

    const getStatusIcon = (status) => {
        return STATUS_META[status]?.icon || 'fa-solid fa-clock';
    };

    const getStatusColor = (status) => {
        return STATUS_META[status]?.color || '#94a3b8';
    };

    // Formatear fecha
    const formatDateTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card modal-content audit-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fa-solid fa-clock-rotate-left modal-header-icon text-indigo"></i>
                        <div>
                            <h2>Historial de Cambios</h2>
                            <p className="modal-subtitle">
                                Ticket {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}`} - {getPharmacyDisplayName(ticket.pharmacy_name)}
                            </p>
                        </div>
                    </div>
                    <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="modal-body audit-modal-body">
                    {isLoading ? (
                        <div className="audit-loading">
                            <i className="fa-solid fa-circle-notch fa-spin fa-2x"></i>
                            <p>Cargando bitácora de auditoría...</p>
                        </div>
                    ) : (
                        <div className="timeline-container">
                            {/* 1. Hito Inicial: Creación del Ticket */}
                            <div className="timeline-item initial-creation">
                                <div className="timeline-badge" style={{ backgroundColor: getStatusColor('Recibido') }}>
                                    <i className="fa-solid fa-plus"></i>
                                </div>
                                <div className="timeline-panel">
                                    <div className="timeline-header">
                                        <span className="timeline-user">
                                            <i className="fa-solid fa-store"></i> {getPharmacyDisplayName(ticket.pharmacy_name)}
                                        </span>
                                        <span className="timeline-time">
                                            {formatDateTime(ticket.created_at)}
                                        </span>
                                    </div>
                                    <div className="timeline-content">
                                        <p>Solicitud creada en estado <span className="status-badge" style={{ backgroundColor: `${getStatusColor('Recibido')}18`, color: getStatusColor('Recibido') }}>Recibido</span></p>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Hitos del Historial de Cambios */}
                            {history.length > 0 ? (
                                history.map((log) => {
                                    const color = getStatusColor(log.new_status);
                                    return (
                                        <div key={log.id} className="timeline-item">
                                            <div className="timeline-badge" style={{ backgroundColor: color }}>
                                                <i className={getStatusIcon(log.new_status)}></i>
                                            </div>
                                            <div className="timeline-panel">
                                                <div className="timeline-header">
                                                    <span className="timeline-user">
                                                        <i className="fa-solid fa-user-shield"></i> {log.changed_by_name}
                                                    </span>
                                                    <span className="timeline-time">
                                                        {formatDateTime(log.created_at)}
                                                    </span>
                                                </div>
                                                <div className="timeline-content">
                                                    <p>
                                                        Cambio de estado: <span className="status-badge-prev">{log.previous_status || 'Inicial'}</span>
                                                        <i className="fa-solid fa-arrow-right-long arrow-separator"></i>
                                                        <span className="status-badge" style={{ backgroundColor: `${color}18`, color: color }}>
                                                            {log.new_status}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                ticket.status !== 'Recibido' && (
                                    <div className="timeline-info-note">
                                        <i className="fa-solid fa-circle-info"></i>
                                        <span>El ticket está en estado <strong>"{ticket.status}"</strong> pero no hay registros de auditoría anteriores guardados en base de datos.</span>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cerrar Historial
                    </button>
                </div>
            </div>
        </div>
    );
}
