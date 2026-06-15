import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';
import KanbanBoard from './KanbanBoard';
import CustomStatusDropdown from './CustomStatusDropdown';



export default function AdminDashboard({ currentUser, onLogout, currentTheme, onToggleTheme }) {
    const [tickets, setTickets] = useState([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [activeTicket, setActiveTicket] = useState(null);
    const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedTicketId, setExpandedTicketId] = useState(null);
    const [dbStatus, setDbStatus] = useState(null);
    const [viewType, setViewType] = useState('list'); // 'list' o 'kanban'
    const [selectedDetailTicket, setSelectedDetailTicket] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    useEffect(() => {
        loadTickets();
        fetchDbSize();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchDbSize = async () => {
        try {
            const { data, error } = await supabase.rpc('get_db_size');
            if (!error && data) {
                setDbStatus(data);
            }
        } catch (err) {
            console.error('Error fetching db size:', err);
        }
    };

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
            // Sincronizar ticket de detalle si estuviera abierto
            if (selectedDetailTicket) {
                const updated = data.find(t => t.id === selectedDetailTicket.id);
                if (updated) setSelectedDetailTicket(updated);
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
            if (selectedDetailTicket && selectedDetailTicket.id === ticketId) {
                setSelectedDetailTicket(prev => ({ ...prev, status: newStatus }));
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
            {/* Header Flotante Premium */}
            <header className="app-header">
                {/* Pill Izquierdo: Avatar + Info */}
                <div className="header-user-pill">
                    <div className="user-avatar avatar-admin">
                        {(currentUser.username || 'A').charAt(0)}
                    </div>
                    <div className="header-user-info">
                        <span className="header-user-name">Administración</span>
                        <span className="header-user-role">
                            <i className="fa-solid fa-shield-halved" style={{ marginRight: '4px', fontSize: '0.65rem', color: '#f59e0b' }}></i>
                            Admin
                        </span>
                    </div>
                </div>

                {/* Título Central */}
                <div className="header-title-pill">
                    <h1>Panel de Administración</h1>
                </div>

                {/* Pill Derecho: DB Status + Toggle Tema + Logout */}
                <div className="header-controls-pill">
                    {/* Toggle de Vista: Lista / Kanban */}
                    <button
                        className="view-toggle-track"
                        onClick={() => setViewType(prev => prev === 'list' ? 'kanban' : 'list')}
                        title={viewType === 'list' ? 'Cambiar a vista Kanban' : 'Cambiar a vista Lista'}
                        aria-label="Alternar vista"
                    >
                        <span className={`view-toggle-thumb ${viewType === 'kanban' ? 'active' : ''}`}>
                            {viewType === 'list'
                                ? <i className="fa-solid fa-list"></i>
                                : <i className="fa-solid fa-table-columns"></i>
                            }
                        </span>
                    </button>

                    <div className="header-divider"></div>

                    {/* Indicadores de Base de Datos y Storage */}
                    {dbStatus && (
                        <>
                            {/* Base de Datos (Postgres) */}
                            {(() => {
                                const dbData = dbStatus.db || dbStatus;
                                return (
                                    <div className="db-status-icon-wrap" title="Base de Datos">
                                        <i
                                            className="fa-solid fa-database db-status-icon"
                                            style={{
                                                color: dbData.percentage > 85
                                                    ? 'var(--color-danger)'
                                                    : dbData.percentage > 60
                                                        ? 'var(--color-warning)'
                                                        : 'var(--color-success)'
                                            }}
                                        ></i>
                                        {/* Tooltip flotante */}
                                        <div className="db-tooltip">
                                            <div className="db-tooltip-title">
                                                <i className="fa-solid fa-database"></i>
                                                Base de Datos (500 MB)
                                            </div>
                                            <div className="db-tooltip-bar-wrap">
                                                <div
                                                    className="db-tooltip-bar-fill"
                                                    style={{
                                                        width: `${Math.min(dbData.percentage, 100)}%`,
                                                        background: dbData.percentage > 85
                                                            ? 'var(--color-danger)'
                                                            : dbData.percentage > 60
                                                                ? 'var(--color-warning)'
                                                                : 'var(--color-success)'
                                                    }}
                                                ></div>
                                            </div>
                                            <div className="db-tooltip-meta">
                                                <span>{dbData.size_pretty} usado</span>
                                                <span className="db-tooltip-pct">{dbData.percentage}% de {dbData.limit_pretty}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Almacenamiento de Archivos (Storage) */}
                            {dbStatus.storage && (
                                <div className="db-status-icon-wrap" title="Almacenamiento de Archivos">
                                    <i
                                        className="fa-solid fa-cloud db-status-icon"
                                        style={{
                                            color: dbStatus.storage.percentage > 85
                                                ? 'var(--color-danger)'
                                                : dbStatus.storage.percentage > 60
                                                    ? 'var(--color-warning)'
                                                    : 'var(--color-success)'
                                        }}
                                    ></i>
                                    {/* Tooltip flotante */}
                                    <div className="db-tooltip">
                                        <div className="db-tooltip-title">
                                            <i className="fa-solid fa-cloud"></i>
                                            Storage de Archivos (1 GB)
                                        </div>
                                        <div className="db-tooltip-bar-wrap">
                                            <div
                                                className="db-tooltip-bar-fill"
                                                style={{
                                                    width: `${Math.min(dbStatus.storage.percentage, 100)}%`,
                                                    background: dbStatus.storage.percentage > 85
                                                        ? 'var(--color-danger)'
                                                        : dbStatus.storage.percentage > 60
                                                            ? 'var(--color-warning)'
                                                            : 'var(--color-success)'
                                                }}
                                            ></div>
                                        </div>
                                        <div className="db-tooltip-meta">
                                            <span>{dbStatus.storage.size_pretty} usado</span>
                                            <span className="db-tooltip-pct">{dbStatus.storage.percentage}% de {dbStatus.storage.limit_pretty}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <div className="header-divider"></div>

                    {/* Toggle Animado Pill */}
                    <button
                        className="theme-toggle-track"
                        onClick={onToggleTheme}
                        title={currentTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                        aria-label="Alternar tema"
                    >
                        <span className="theme-toggle-thumb">
                            {currentTheme === 'dark'
                                ? <i className="fa-solid fa-moon"></i>
                                : <i className="fa-solid fa-sun"></i>
                            }
                        </span>
                    </button>

                    <div className="header-divider"></div>

                    {/* Logout Icon */}
                    <button
                        className="btn-logout-icon"
                        onClick={onLogout}
                        title="Cerrar sesión"
                    >
                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                    </button>
                </div>
            </header>

            {/* Dashboard Container */}
            <div className="dashboard-container">
                <div className="modern-layout">
                    {/* Barra de Acciones y Filtros */}
                    {viewType === 'list' && (
                        <div className="dashboard-actions-bar" style={{ gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
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
                    )}

                    {/* Listado en estilo tarjetas modernas */}
                    {viewType === 'kanban' ? (
                        <KanbanBoard 
                            tickets={tickets}
                            onOpenChat={handleOpenChat}
                            onOpenDetails={(ticket) => {
                                setSelectedDetailTicket(ticket);
                                setIsDetailModalOpen(true);
                            }}
                            onStatusChange={handleStatusChange}
                            unreadTicketIds={unreadTicketIds}
                        />
                    ) : (
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
                                        style={{ 
                                            borderLeft: hasUnread ? '3px solid var(--color-danger)' : '',
                                            zIndex: isExpanded ? 50 : 1
                                        }}
                                    >
                                        {/* Cabecera del acordeón */}
                                        <div className="accordion-header" onClick={() => toggleAccordion(ticket.id)}>
                                            <div className="accordion-header-left" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', display: 'flex', alignItems: 'center' }}>
                                                <span className="accordion-ticket-id">
                                                    {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}...`}
                                                </span>
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
                                                <span className={`badge status-pill status-pill-${ticket.status.toLowerCase().replace(' ', '_')}`}>
                                                    {ticket.status}
                                                </span>
                                                <i className="fa-solid fa-chevron-down accordion-chevron"></i>
                                            </div>
                                        </div>

                                        {/* Cuerpo expandible */}
                                        {isExpanded && (
                                            <div className="accordion-body-row">
                                                <span className="accordion-body-date">
                                                    <i className="fa-regular fa-clock"></i> {fecha}
                                                </span>
                                                <div className="accordion-body-status-ctrl" onClick={(e) => e.stopPropagation()}>
                                                    <span className="accordion-body-status-label">Estado</span>
                                                    <CustomStatusDropdown 
                                                        value={ticket.status}
                                                        onChange={(val) => handleStatusChange(ticket.id, val)}
                                                    />
                                                </div>
                                                <button 
                                                    className={`btn ${hasUnread ? 'btn-danger' : 'btn-primary'} btn-sm unread-badge-container`}
                                                    onClick={() => handleOpenChat(ticket)}
                                                >
                                                    <i className="fa-regular fa-comments"></i>
                                                    <span>Interactuar</span>
                                                    {hasUnread && <span className="pulsing-alert-dot"></span>}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        </div>
                    )}
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

            {/* MODAL: Detalles del Ticket */}
            {isDetailModalOpen && selectedDetailTicket && (
                <div className="modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setIsDetailModalOpen(false)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <div className="detail-modal-layout">
                            <div className="detail-modal-header">
                                <h3>Detalles de Solicitud</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    Ticket {selectedDetailTicket.ticket_number ? `TK-${selectedDetailTicket.ticket_number}` : `#${selectedDetailTicket.id}`}
                                </p>
                            </div>
                            
                            <div className="detail-meta-grid">
                                <div className="detail-meta-item">
                                    <label>Farmacia Solicitante</label>
                                    <span>{selectedDetailTicket.pharmacy_name}</span>
                                </div>
                                <div className="detail-meta-item">
                                    <label>Fecha de Emisión</label>
                                    <span>
                                        {new Date(selectedDetailTicket.created_at).toLocaleString('es-ES', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                                <div className="detail-meta-item" style={{ overflow: 'visible' }}>
                                    <label>Estado</label>
                                    <CustomStatusDropdown 
                                        value={selectedDetailTicket.status}
                                        onChange={(val) => handleStatusChange(selectedDetailTicket.id, val)}
                                    />
                                </div>
                                <div className="detail-meta-item">
                                    <label>Chat de Soporte</label>
                                    <button 
                                        className="btn btn-primary btn-sm"
                                        style={{ width: '100%', padding: '4px', fontSize: '0.8rem', marginTop: '2px' }}
                                        onClick={() => {
                                            setIsDetailModalOpen(false);
                                            handleOpenChat(selectedDetailTicket);
                                        }}
                                    >
                                        <i className="fa-regular fa-comments"></i> Abrir Chat
                                    </button>
                                </div>
                            </div>

                            <div className="detail-description-box">
                                <h5>Descripción del Problema</h5>
                                <p>{selectedDetailTicket.description}</p>
                            </div>

                            <div className="detail-modal-footer">
                                <button className="btn btn-secondary" onClick={() => setIsDetailModalOpen(false)}>Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
