import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';



export default function AdminDashboard({ currentUser, onLogout, currentTheme, onToggleTheme }) {
    const [tickets, setTickets] = useState([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [activeTicket, setActiveTicket] = useState(null);
    const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedTicketId, setExpandedTicketId] = useState(null);

    useEffect(() => {
        loadTickets();
    }, []);

    const toggleAccordion = (ticketId) => {
        setExpandedTicketId(expandedTicketId === ticketId ? null : ticketId);
    };

    // Suscribirse a notificaciones de chat globales para el administrador
    useEffect(() => {
        const channel = supabase.channel('admin_global_chat_notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                const newMsg = payload.new;
                
                // Si el mensaje es enviado por una farmacia (no es admin ni del sistema)
                if (newMsg.sender_name !== 'Administrador' && newMsg.sender_name !== 'Sistema') {
                    // Si el chat del ticket no está abierto en este instante
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
    }, [activeTicket, isChatModalOpen]);

    const loadTickets = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTickets(data || []);

            // Sincronizar ticket activo si estuviera abierto
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

    const handleStatusChange = async (ticketId, newStatus) => {
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ status: newStatus })
                .eq('id', ticketId);

            if (error) throw error;

            // Actualizar en listas locales
            setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
            if (activeTicket && activeTicket.id === ticketId) {
                setActiveTicket(prev => ({ ...prev, status: newStatus }));
            }

            // Registrar mensaje del sistema informando del cambio
            await supabase
                .from('messages')
                .insert({
                    ticket_id: ticketId,
                    sender_id: currentUser.id,
                    sender_name: 'Sistema',
                    message_text: `El estado del ticket ha sido cambiado a: **${newStatus}**`
                });

        } catch (e) {
            console.error('Error al cambiar estado:', e);
            alert('No se pudo actualizar el estado del ticket.');
        }
    };

    const handleOpenChat = (ticket) => {
        setActiveTicket(ticket);
        
        // Quitar de alertas no leídas
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
        loadTickets(); // Recargar lista al cerrar para refrescar posibles cambios
    };

    // Filtrado local
    const filteredTickets = tickets.filter(ticket => {
        const matchesSearch = ticket.pharmacy_name.toLowerCase().includes(search.toLowerCase().trim()) ||
                              ticket.description.toLowerCase().includes(search.toLowerCase().trim()) ||
                              ticket.id.toLowerCase().includes(search.toLowerCase().trim());

        const matchesStatus = filterStatus === 'ALL' || ticket.status === filterStatus;

        return matchesSearch && matchesStatus;
    });

    return (
        <div id="admin-screen">
            {/* Header */}
            <header className="app-header">
                <div className="header-logo">
                    <i className="fa-solid fa-ticket-simple"></i>
                    <h2>FarmaTickets <span className="badge badge-admin">Administrador</span></h2>
                </div>
                <div className="user-profile">
                    <i className="fa-solid fa-user-shield"></i>
                    <span className="user-name">Administración</span>
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

            {/* Dashboard Container */}
            <div className="dashboard-container">
                <div className="modern-layout">
                    {/* Barra de Acciones y Filtros */}
                    <div className="dashboard-actions-bar" style={{ gap: '20px', flexWrap: 'wrap' }}>
                        <div className="dashboard-title-area">
                            <h2>Panel de Administración</h2>
                            <p>Gestión global de incidentes y chat de soporte directo con las farmacias.</p>
                        </div>
                        <div className="flex-row gap-12 align-center flex-wrap">
                            <input 
                                type="text" 
                                placeholder="🔍 Buscar farmacia o ticket..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ maxWidth: '220px', padding: '8px 12px', fontSize: '0.85rem' }}
                            />
                            <select 
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                style={{ maxWidth: '160px', padding: '8px 12px', fontSize: '0.85rem' }}
                            >
                                <option value="ALL">Todos los estados</option>
                                <option value="Aceptado">Aceptado</option>
                                <option value="En revision">En revisión</option>
                                <option value="Resuelto">Resuelto</option>
                            </select>
                            <button className="btn btn-secondary btn-icon-only" onClick={loadTickets} title="Actualizar lista">
                                <i className="fa-solid fa-rotate"></i>
                            </button>
                        </div>
                    </div>

                    {/* Listado en estilo tarjetas modernas */}
                    <div className="accordion-list">
                        {isLoading && tickets.length === 0 ? (
                            <div className="empty-state">
                                <i className="fa-solid fa-circle-notch fa-spin"></i>
                                <p>Cargando solicitudes...</p>
                            </div>
                        ) : filteredTickets.length === 0 ? (
                            <div className="empty-state">
                                <i className="fa-solid fa-inbox"></i>
                                <p>No hay solicitudes para mostrar.</p>
                            </div>
                        ) : (
                            filteredTickets.map(ticket => {
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
                                        {/* Cabecera del acordeón */}
                                        <div className="accordion-header" onClick={() => toggleAccordion(ticket.id)}>
                                            <div className="accordion-header-left" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', display: 'flex', alignItems: 'center' }}>
                                                <span className="accordion-ticket-id">#{ticket.id.substring(0, 8)}...</span>
                                                <span 
                                                    className="accordion-ticket-pharmacy" 
                                                    style={{ 
                                                        color: 'var(--text-primary)', 
                                                        marginLeft: '12px', 
                                                        fontWeight: '700',
                                                        fontSize: '0.95rem',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    <i className="fa-solid fa-hospital" style={{ color: 'var(--color-primary)', marginRight: '6px' }}></i>
                                                    {ticket.pharmacy_name}
                                                </span>
                                                {hasUnread && <span className="badge-unread" style={{ marginLeft: '8px', flexShrink: 0 }}>Nuevo Mensaje</span>}
                                                <span 
                                                    className="accordion-ticket-desc" 
                                                    style={{ 
                                                        color: 'var(--text-secondary)', 
                                                        marginLeft: '16px', 
                                                        fontSize: '0.9rem',
                                                        fontWeight: '500',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    — {ticket.description}
                                                </span>
                                            </div>
                                            <div className="accordion-header-right">
                                                {/* Alerta roja pulsante */}
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

                                        {/* Cuerpo expandible */}
                                        {isExpanded && (
                                            <div className="accordion-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        <i className="fa-regular fa-clock"></i> Fecha de emisión: {fecha}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                                                            Cambiar Estado:
                                                        </span>
                                                        <select 
                                                            value={ticket.status}
                                                            onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                                                            className="select-status"
                                                            style={{ 
                                                                padding: '6px 12px', 
                                                                fontSize: '0.85rem',
                                                                background: 'rgba(15, 23, 42, 0.8)',
                                                                border: '1px solid var(--border-color)',
                                                                borderRadius: '8px',
                                                                color: 'var(--text-primary)',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <option value="Aceptado">Aceptado</option>
                                                            <option value="En revision">En revisión</option>
                                                            <option value="Resuelto">Resuelto</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <button 
                                                    className={`btn ${hasUnread ? 'btn-danger' : 'btn-primary'} unread-badge-container`}
                                                    onClick={() => handleOpenChat(ticket)}
                                                >
                                                    <i className="fa-regular fa-comments"></i> 
                                                    <span>Resolver e Interactuar</span>
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

            {/* MODAL: Chat de Administración */}
            {isChatModalOpen && activeTicket && (
                <div className="modal-overlay" onClick={handleCloseChat}>
                    <div className="modal-content modal-content-chat" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={handleCloseChat}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <ChatPanel 
                            ticket={activeTicket} 
                            currentUser={currentUser} 
                            isAdmin={true}
                            onStatusChange={handleStatusChange}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
