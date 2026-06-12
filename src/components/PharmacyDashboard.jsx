import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';



export default function PharmacyDashboard({ currentUser, onLogout, currentTheme, onToggleTheme }) {
    const [tickets, setTickets] = useState([]);
    const [description, setDescription] = useState('');
    const [activeTicket, setActiveTicket] = useState(null);
    const [expandedTicketId, setExpandedTicketId] = useState(null);
    const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());
    
    // Estados de modales
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadTickets();
    }, []);

    // Suscribirse a mensajes globales para capturar alertas en tiempo real (mensajes nuevos y cambios de estado)
    useEffect(() => {
        const channel = supabase.channel('pharmacy_global_chat_notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                const newMsg = payload.new;
                
                // Si el mensaje viene del admin o del sistema (ej: cambios de estado)
                if (newMsg.sender_id !== currentUser.id) {
                    // Si el chat no está abierto actualmente con este ticket
                    if (!isChatModalOpen || !activeTicket || activeTicket.id !== newMsg.ticket_id) {
                        setUnreadTicketIds(prev => {
                            const updated = new Set(prev);
                            updated.add(newMsg.ticket_id);
                            return updated;
                        });
                    }
                }
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [activeTicket, isChatModalOpen, currentUser.id]);

    const loadTickets = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTickets(data || []);
            
            // Sincronizar ticket activo si hay
            if (activeTicket) {
                const updated = data.find(t => t.id === activeTicket.id);
                if (updated) setActiveTicket(updated);
            }
        } catch (e) {
            console.error('Error al cargar tickets:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        const desc = description.trim();
        if (!desc) return;

        setIsSubmitting(true);

        try {
            const { data, error } = await supabase
                .from('tickets')
                .insert({
                    user_id: currentUser.id,
                    pharmacy_name: currentUser.username,
                    description: desc
                })
                .select()
                .single();

            if (error) throw error;

            setDescription('');
            setIsCreateModalOpen(false); // Cerrar modal
            await loadTickets();

            // Abrir el chat del nuevo ticket inmediatamente
            if (data) {
                setActiveTicket(data);
                setIsChatModalOpen(true);
            }
        } catch (error) {
            console.error('Error al crear ticket:', error);
            alert('Hubo un error al enviar el ticket: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleAccordion = (ticketId) => {
        setExpandedTicketId(expandedTicketId === ticketId ? null : ticketId);
    };

    const handleOpenChat = (ticket) => {
        setActiveTicket(ticket);
        
        // Quitar de alertas leídas
        setUnreadTicketIds(prev => {
            const updated = new Set(prev);
            updated.delete(ticket.id);
            return updated;
        });
        
        setIsChatModalOpen(true);
    };

    const handleCloseChat = () => {
        setIsChatModalOpen(false);
        setActiveTicket(null);
        loadTickets(); // Recargar para ver si cambió el estado mientras chateaba
    };

    return (
        <div id="pharmacy-screen">
            {/* Header */}
            <header className="app-header">
                <div className="header-logo">
                    <i className="fa-solid fa-ticket"></i>
                    <h2>FarmaTickets <span className="badge badge-pharmacy">Farmacia</span></h2>
                </div>
                <div className="user-profile">
                    <i className="fa-solid fa-hospital-user"></i>
                    <span className="user-name">{currentUser.username}</span>
                    <button 
                        className="theme-toggle-btn" 
                        onClick={onToggleTheme} 
                        title="Cambiar tema"
                        style={{ marginRight: '4px' }}
                    >
                        {currentTheme === 'dark' ? <i className="fa-solid fa-sun"></i> : <i className="fa-solid fa-moon"></i>}
                    </button>
                    <button className="btn btn-danger btn-sm logout-btn" onClick={onLogout} title="Cerrar sesión">
                        <i className="fa-solid fa-power-off"></i>
                    </button>
                </div>
            </header>

            {/* Dashboard Container (Modernized) */}
            <div className="dashboard-container">
                <div className="modern-layout">
                    {/* Barra de Acciones Superior */}
                    <div className="dashboard-actions-bar">
                        <div className="dashboard-title-area">
                            <h2>Mis Solicitudes</h2>
                            <p>Consulta el estado de tus reportes y comunícate con soporte técnico.</p>
                        </div>
                        <div className="flex-row gap-12 align-center">
                            <button className="btn btn-secondary btn-icon-only" onClick={loadTickets} title="Actualizar lista">
                                <i className="fa-solid fa-rotate"></i>
                            </button>
                            <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
                                <i className="fa-solid fa-circle-plus"></i> Crear Nuevo Ticket
                            </button>
                        </div>
                    </div>

                    {/* Acordeón de Tickets */}
                    <div className="accordion-list">
                        {isLoading && tickets.length === 0 ? (
                            <div className="empty-state">
                                <i className="fa-solid fa-circle-notch fa-spin"></i>
                                <p>Cargando tickets...</p>
                            </div>
                        ) : tickets.length === 0 ? (
                            <div className="empty-state">
                                <i className="fa-solid fa-inbox"></i>
                                <p>No tienes tickets registrados. ¡Crea uno nuevo arriba!</p>
                            </div>
                        ) : (
                            tickets.map(ticket => {
                                const isExpanded = expandedTicketId === ticket.id;
                                const hasUnread = unreadTicketIds.has(ticket.id);
                                const fecha = new Date(ticket.created_at).toLocaleDateString('es-ES', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });

                                return (
                                    <div 
                                        key={ticket.id}
                                        className={`accordion-item ${isExpanded ? 'expanded' : ''}`}
                                        style={{ borderLeft: hasUnread ? '3px solid var(--color-danger)' : '' }}
                                    >
                                        {/* Cabecera del acordeón (Muestra descripción en lugar de la fecha) */}
                                        <div className="accordion-header" onClick={() => toggleAccordion(ticket.id)}>
                                             <div className="accordion-header-left" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', display: 'flex', alignItems: 'center' }}>
                                                 <span className="accordion-ticket-id">#{ticket.id.substring(0, 8)}...</span>
                                                 {hasUnread && <span className="badge-unread" style={{ marginLeft: '8px', flexShrink: 0 }}>Nuevo Mensaje</span>}
                                                <span 
                                                    className="accordion-ticket-desc" 
                                                    style={{ 
                                                        color: 'var(--text-secondary)', 
                                                        marginLeft: '16px',
                                                        fontSize: '0.9rem',
                                                        fontWeight: '500'
                                                    }}
                                                >
                                                    {ticket.description}
                                                </span>
                                            </div>
                                            <div className="accordion-header-right">
                                                {/* Alerta roja pulsante si hay actualización de chat o de estado */}
                                                {hasUnread && (
                                                    <span 
                                                        className="pulsing-alert-dot" 
                                                        style={{ position: 'relative', top: 'auto', right: 'auto', marginRight: '8px' }}
                                                    ></span>
                                                )}
                                                <span className={`badge badge-${ticket.status}`}>{ticket.status}</span>
                                                <i className="fa-solid fa-chevron-down accordion-chevron"></i>
                                            </div>
                                        </div>

                                        {/* Cuerpo expandible (Sin duplicar descripción, solo fecha y botón alineados) */}
                                        {isExpanded && (
                                            <div className="accordion-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px' }}>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    <i className="fa-regular fa-clock"></i> Fecha de emisión: {fecha}
                                                </span>
                                                <button 
                                                    className={`btn ${hasUnread ? 'btn-danger' : 'btn-secondary'} unread-badge-container`}
                                                    onClick={() => handleOpenChat(ticket)}
                                                >
                                                    <i className="fa-regular fa-comments"></i> 
                                                    <span>Chat de Soporte</span>
                                                    {hasUnread && <span className="pulsing-alert-dot"></span>}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL 1: Crear Nuevo Ticket */}
            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setIsCreateModalOpen(false)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h3 style={{ marginBottom: '20px', fontSize: '1.3rem', fontWeight: '700' }}>
                            <i className="fa-solid fa-circle-plus"></i> Crear Nuevo Ticket
                        </h3>
                        <form onSubmit={handleCreateTicket}>
                            <div className="input-group">
                                <label>Farmacia Solicitante</label>
                                <input 
                                    type="text" 
                                    value={currentUser.username} 
                                    readOnly 
                                    className="input-readonly" 
                                />
                            </div>
                            <div className="input-group">
                                <label>Fecha de Emisión</label>
                                <input 
                                    type="text" 
                                    value={new Date().toLocaleDateString('es-ES')} 
                                    readOnly 
                                    className="input-readonly" 
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="ticket-description">Descripción del Problema</label>
                                <textarea 
                                    id="ticket-description" 
                                    placeholder="Escribe en detalle el inconveniente o requerimiento..." 
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    required 
                                    rows="4"
                                    disabled={isSubmitting}
                                    autoFocus
                                ></textarea>
                            </div>
                            
                            {/* Placeholder del Lunes */}
                            <div className="monday-form-placeholder">
                                <div className="placeholder-icon"><i className="fa-solid fa-file-invoice"></i></div>
                                <div className="placeholder-text">
                                    <strong>Formularios Adicionales</strong>
                                    <span>Se habilitarán el lunes según la estructura requerida.</span>
                                </div>
                            </div>

                            <button type="submit" className="btn btn-success btn-block" disabled={isSubmitting}>
                                <i className="fa-solid fa-paper-plane"></i> {isSubmitting ? 'Enviando...' : 'Enviar Ticket'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: Chat del Ticket */}
            {isChatModalOpen && activeTicket && (
                <div className="modal-overlay" onClick={handleCloseChat}>
                    <div className="modal-content modal-content-chat" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={handleCloseChat}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <ChatPanel 
                            ticket={activeTicket} 
                            currentUser={currentUser} 
                            isAdmin={false}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
