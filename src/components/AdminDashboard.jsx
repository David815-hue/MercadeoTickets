import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';
import KanbanBoard from './KanbanBoard';
import CustomStatusDropdown from './CustomStatusDropdown';
import CustomFilterDropdown from './CustomFilterDropdown';



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

    // Estados de cuenta y administración
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profiles, setProfiles] = useState([]);
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const userMenuRef = useRef(null);

    // Formulario Perfil
    const [adminUsername, setAdminUsername] = useState(currentUser.username);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    // Formulario Crear Usuario
    const [createUsername, setCreateUsername] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createRole, setCreateRole] = useState('farmacia');
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');
    const [isSavingNewUser, setIsSavingNewUser] = useState(false);

    // Formulario Cambiar Contraseña de otros
    const [selectedUserForReset, setSelectedUserForReset] = useState(null);
    const [resetPasswordVal, setResetPasswordVal] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [isSavingReset, setIsSavingReset] = useState(false);

    useEffect(() => {
        loadTickets();
        fetchDbSize();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Actualizar última conexión en base de datos
    useEffect(() => {
        const updateLastSeen = async () => {
            try {
                await supabase
                    .from('profiles')
                    .update({ last_seen_at: new Date().toISOString() })
                    .eq('id', currentUser.id);
            } catch (err) {
                console.error('Error actualizando última conexión:', err);
            }
        };
        updateLastSeen();
    }, [currentUser.id]);

    // Cerrar menú de usuario al hacer clic fuera
    useEffect(() => {
        function handleClickOutside(e) {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setIsUserMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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

    // Cargar perfiles de usuarios
    const loadProfiles = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('username', { ascending: true });
            if (error) throw error;
            setProfiles(data || []);
        } catch (err) {
            console.error('Error al cargar perfiles:', err);
        }
    };

    // Actualizar perfil de administrador
    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setProfileError('');
        setProfileSuccess('');

        if (!adminUsername.trim()) {
            setProfileError('El nombre de usuario no puede estar vacío.');
            return;
        }

        if (newPassword && newPassword !== confirmPassword) {
            setProfileError('Las contraseñas no coinciden.');
            return;
        }

        setIsSavingProfile(true);

        try {
            // 1. Si el username cambió, actualizarlo en profiles
            if (adminUsername.trim().toUpperCase() !== currentUser.username.toUpperCase()) {
                const { error: profileErr } = await supabase
                    .from('profiles')
                    .update({ username: adminUsername.trim().toUpperCase() })
                    .eq('id', currentUser.id);

                if (profileErr) throw profileErr;
                currentUser.username = adminUsername.trim().toUpperCase();
            }

            // 2. Si se ingresó una nueva contraseña, actualizarla
            if (newPassword) {
                const { error: pwdError } = await supabase.rpc('update_user_password', {
                    p_user_id: currentUser.id,
                    p_new_password: newPassword
                });

                if (pwdError) throw pwdError;
            }

            setProfileSuccess('Perfil actualizado correctamente.');
            setNewPassword('');
            setConfirmPassword('');
            
            setTimeout(() => {
                setIsProfileModalOpen(false);
                setProfileSuccess('');
            }, 1500);

        } catch (err) {
            console.error('Error al actualizar perfil admin:', err);
            setProfileError(err.message || 'Error al guardar los cambios.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    // Crear nuevo usuario (Administrador)
    const handleCreateUserSubmit = async (e) => {
        e.preventDefault();
        setCreateError('');
        setCreateSuccess('');

        if (!createUsername.trim()) {
            setCreateError('El nombre de usuario no puede estar vacío.');
            return;
        }

        if (!createPassword || createPassword.length < 4) {
            setCreateError('La contraseña debe tener al menos 4 caracteres.');
            return;
        }

        setIsSavingNewUser(true);

        try {
            const { error } = await supabase.rpc('create_profile_user', {
                p_username: createUsername.trim().toLowerCase(),
                p_password: createPassword,
                p_role: createRole
            });

            if (error) throw error;

            setCreateSuccess('Usuario creado exitosamente.');
            setCreateUsername('');
            setCreatePassword('');
            setIsCreatingUser(false);
            
            await loadProfiles();

            setTimeout(() => {
                setCreateSuccess('');
            }, 3000);

        } catch (err) {
            console.error('Error al crear usuario:', err);
            setCreateError(err.message || 'Error al crear el perfil de usuario.');
        } finally {
            setIsSavingNewUser(false);
        }
    };

    // Eliminar usuario
    const handleDeleteUser = async (userToDelete) => {
        if (userToDelete.id === currentUser.id) {
            alert('No puedes eliminar tu propio usuario administrador.');
            return;
        }

        if (!window.confirm(`¿Estás seguro de que deseas eliminar al usuario "${userToDelete.username}"?\nEsta acción es irreversible y eliminará todos sus tickets y mensajes.`)) {
            return;
        }

        try {
            const { error } = await supabase.rpc('delete_profile_user', {
                p_user_id: userToDelete.id
            });

            if (error) throw error;

            alert('Usuario eliminado correctamente.');
            await loadProfiles();
        } catch (err) {
            console.error('Error al eliminar usuario:', err);
            alert(err.message || 'No se pudo eliminar el usuario.');
        }
    };

    // Restablecer contraseña de otro usuario
    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        setResetError('');
        setResetSuccess('');

        if (!resetPasswordVal) {
            setResetError('La contraseña no puede estar vacía.');
            return;
        }

        setIsSavingReset(true);

        try {
            const { error } = await supabase.rpc('update_user_password', {
                p_user_id: selectedUserForReset.id,
                p_new_password: resetPasswordVal
            });

            if (error) throw error;

            setResetSuccess('Contraseña restablecida correctamente.');
            setResetPasswordVal('');
            
            setTimeout(() => {
                setSelectedUserForReset(null);
                setResetSuccess('');
            }, 1500);

        } catch (err) {
            console.error('Error al restablecer contraseña:', err);
            setResetError(err.message || 'Error al restablecer la contraseña.');
        } finally {
            setIsSavingReset(false);
        }
    };

    // Formatear última conexión
    const formatLastSeen = (isoString) => {
        if (!isoString) return 'Nunca';
        const date = new Date(isoString);
        const diffMs = new Date() - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Ahora mismo';
        if (diffMins < 60) return `Hace ${diffMins} min${diffMins > 1 ? 's' : ''}`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
        
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
                    {/* Toggle de Vista: Lista / Kanban / Usuarios */}
                    {viewType !== 'users' ? (
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
                    ) : (
                        <button
                            className="btn btn-secondary btn-xs"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => setViewType('list')}
                            title="Volver a solicitudes"
                        >
                            <i className="fa-solid fa-arrow-left"></i> Solicitudes
                        </button>
                    )}

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

                    {/* Menú de Usuario */}
                    <div className="user-menu-container" ref={userMenuRef}>
                        <button
                            className={`btn-user-menu ${isUserMenuOpen ? 'active' : ''}`}
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            title="Opciones de cuenta"
                        >
                            <i className="fa-solid fa-user-gear"></i>
                        </button>
                        {isUserMenuOpen && (
                            <div className="user-menu-dropdown">
                                <button 
                                    className="user-menu-item"
                                    onClick={() => {
                                        setAdminUsername(currentUser.username);
                                        setIsProfileModalOpen(true);
                                        setIsUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fa-solid fa-user-pen"></i> Gestionar Perfil
                                </button>
                                <button 
                                    className="user-menu-item"
                                    onClick={() => {
                                        setViewType('users');
                                        loadProfiles();
                                        setIsUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fa-solid fa-users-gear"></i> Gestionar Usuarios
                                </button>
                                <button 
                                    className="user-menu-item logout"
                                    onClick={onLogout}
                                >
                                    <i className="fa-solid fa-arrow-right-from-bracket"></i> Cerrar Sesión
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Dashboard Container */}
            <div className="dashboard-container">
                <div className="modern-layout">
                    {/* Barra de Acciones y Filtros */}
                    {viewType === 'list' && (
                        <div className="dashboard-actions-bar" style={{ gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <div className="flex-row gap-12 align-center flex-wrap">
                                <div className="search-input-wrapper">
                                    <i className="fa-solid fa-magnifying-glass search-icon"></i>
                                    <input 
                                        type="text" 
                                        placeholder="Buscar farmacia o ticket..." 
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                    {search && (
                                        <button 
                                            className="clear-search-btn" 
                                            onClick={() => setSearch('')} 
                                            title="Limpiar búsqueda"
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    )}
                                </div>

                                <CustomFilterDropdown 
                                    value={filterStatus}
                                    onChange={setFilterStatus}
                                />

                                <button 
                                    className="btn btn-secondary btn-refresh-premium" 
                                    onClick={loadTickets} 
                                    title="Actualizar lista"
                                >
                                    <i className="fa-solid fa-rotate"></i>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Listado en estilo tarjetas modernas */}
                    {viewType === 'kanban' && (
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
                    )}

                    {viewType === 'list' && (
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

                    {viewType === 'users' && (
                        <div className="user-management-screen">
                            <div className="user-management-header">
                                <h2>
                                    <i className="fa-solid fa-users-gear"></i> Gestión de Usuarios
                                </h2>
                                {!isCreatingUser && !selectedUserForReset && (
                                    <button className="btn btn-primary" onClick={() => setIsCreatingUser(true)}>
                                        <i className="fa-solid fa-user-plus"></i> Crear Nuevo Usuario
                                    </button>
                                )}
                            </div>

                            <div className={`user-management-grid ${(isCreatingUser || selectedUserForReset) ? 'has-sidebar' : ''}`}>
                                {/* Listado de usuarios */}
                                <div className="user-management-card" style={{ flex: 1 }}>
                                    <h3>
                                        <i className="fa-solid fa-list-ul"></i> Listado de Perfiles
                                    </h3>
                                    <div className="user-list-table-container full-view">
                                        <table className="user-table">
                                            <thead>
                                                <tr>
                                                    <th>Nombre de Usuario</th>
                                                    <th>Rol</th>
                                                    <th>Creado el</th>
                                                    <th>Última Conexión</th>
                                                    <th>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {profiles.map(p => (
                                                    <tr key={p.id}>
                                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.username}</td>
                                                        <td>
                                                            <span className={`badge badge-${p.role}`} style={{ textTransform: 'capitalize' }}>
                                                                {p.role}
                                                            </span>
                                                        </td>
                                                        <td>{new Date(p.created_at).toLocaleDateString('es-ES')}</td>
                                                        <td>{formatLastSeen(p.last_seen_at)}</td>
                                                        <td>
                                                            <div className="table-actions">
                                                                <button 
                                                                    className="btn-table-action"
                                                                    onClick={() => {
                                                                        setSelectedUserForReset(p);
                                                                        setIsCreatingUser(false);
                                                                        setResetError('');
                                                                        setResetSuccess('');
                                                                    }}
                                                                    title="Restablecer Contraseña"
                                                                >
                                                                    <i className="fa-solid fa-key"></i> Pass
                                                                </button>
                                                                {p.id !== currentUser.id && (
                                                                    <button 
                                                                        className="btn-table-action delete"
                                                                        onClick={() => handleDeleteUser(p)}
                                                                        title="Eliminar Usuario"
                                                                    >
                                                                        <i className="fa-solid fa-trash-can"></i> Borrar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Sidebar de acción activa: Crear o Restablecer */}
                                {(isCreatingUser || selectedUserForReset) && (
                                    <div className="user-management-card">
                                        {isCreatingUser && (
                                            <div className="user-form-card">
                                                <h3><i className="fa-solid fa-user-plus"></i> Registrar Usuario</h3>
                                                <form onSubmit={handleCreateUserSubmit}>
                                                    <div className="input-group">
                                                        <label htmlFor="create-username">Nombre de Usuario</label>
                                                        <input 
                                                            id="create-username"
                                                            type="text" 
                                                            placeholder="Ej: PFH002 o ADMIN2"
                                                            value={createUsername}
                                                            onChange={(e) => setCreateUsername(e.target.value)}
                                                            required
                                                            disabled={isSavingNewUser}
                                                        />
                                                    </div>
                                                    <div className="input-group">
                                                        <label htmlFor="create-password">Contraseña</label>
                                                        <input 
                                                            id="create-password"
                                                            type="password" 
                                                            placeholder="Mínimo 4 caracteres"
                                                            value={createPassword}
                                                            onChange={(e) => setCreatePassword(e.target.value)}
                                                            required
                                                            disabled={isSavingNewUser}
                                                        />
                                                    </div>
                                                    <div className="input-group">
                                                        <label htmlFor="create-role">Rol</label>
                                                        <select
                                                            id="create-role"
                                                            value={createRole}
                                                            onChange={(e) => setCreateRole(e.target.value)}
                                                            required
                                                            disabled={isSavingNewUser}
                                                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '10px' }}
                                                        >
                                                            <option value="farmacia">Farmacia</option>
                                                            <option value="admin">Administrador</option>
                                                        </select>
                                                    </div>

                                                    {createError && (
                                                        <div className="error-alert" style={{ marginTop: '12px' }}>
                                                            <i className="fa-solid fa-triangle-exclamation"></i>
                                                            <span>{createError}</span>
                                                        </div>
                                                    )}

                                                    {createSuccess && (
                                                        <div className="success-alert" style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <i className="fa-solid fa-circle-check"></i>
                                                            <span>{createSuccess}</span>
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                                        <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={isSavingNewUser}>
                                                            <i className="fa-solid fa-user-check"></i> Registrar
                                                        </button>
                                                        <button type="button" className="btn btn-secondary" onClick={() => { setIsCreatingUser(false); setCreateError(''); }} disabled={isSavingNewUser}>
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        )}

                                        {selectedUserForReset && (
                                            <div className="user-form-card">
                                                <h3><i className="fa-solid fa-key"></i> Restablecer Contraseña</h3>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                                    Cambiando contraseña de <strong>{selectedUserForReset.username}</strong>.
                                                </p>
                                                <form onSubmit={handleResetPasswordSubmit}>
                                                    <div className="input-group">
                                                        <label htmlFor="reset-password">Nueva Contraseña</label>
                                                        <input 
                                                            id="reset-password"
                                                            type="password" 
                                                            placeholder="Introduce la nueva contraseña"
                                                            value={resetPasswordVal}
                                                            onChange={(e) => setResetPasswordVal(e.target.value)}
                                                            required
                                                            disabled={isSavingReset}
                                                        />
                                                    </div>

                                                    {resetError && (
                                                        <div className="error-alert" style={{ marginTop: '12px' }}>
                                                            <i className="fa-solid fa-triangle-exclamation"></i>
                                                            <span>{resetError}</span>
                                                        </div>
                                                    )}

                                                    {resetSuccess && (
                                                        <div className="success-alert" style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <i className="fa-solid fa-circle-check"></i>
                                                            <span>{resetSuccess}</span>
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSavingReset}>
                                                            <i className="fa-solid fa-floppy-disk"></i> Actualizar
                                                        </button>
                                                        <button type="button" className="btn btn-secondary" onClick={() => { setSelectedUserForReset(null); setResetError(''); }} disabled={isSavingReset}>
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
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

            {/* MODAL 3: Gestionar Perfil */}
            {isProfileModalOpen && (
                <div className="modal-overlay" onClick={() => setIsProfileModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setIsProfileModalOpen(false)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h3 style={{ marginBottom: '20px', fontSize: '1.3rem', fontWeight: '700' }}>
                            <i className="fa-solid fa-user-pen"></i> Gestionar Perfil
                        </h3>
                        <form onSubmit={handleUpdateProfile}>
                            <div className="input-group">
                                <label htmlFor="profile-username">Nombre de Usuario</label>
                                <input 
                                    id="profile-username"
                                    type="text" 
                                    placeholder="Introduce tu nombre de usuario"
                                    value={adminUsername}
                                    onChange={(e) => setAdminUsername(e.target.value)}
                                    required
                                    disabled={isSavingProfile}
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="profile-password">Nueva Contraseña (Opcional)</label>
                                <input 
                                    id="profile-password"
                                    type="password" 
                                    placeholder="Introduce tu nueva contraseña si deseas cambiarla" 
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    disabled={isSavingProfile}
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="profile-confirm-password">Confirmar Nueva Contraseña</label>
                                <input 
                                    id="profile-confirm-password"
                                    type="password" 
                                    placeholder="Confirma tu nueva contraseña" 
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={isSavingProfile}
                                />
                            </div>
                            
                            {profileError && (
                                <div className="error-alert" style={{ marginTop: '12px' }}>
                                    <i className="fa-solid fa-triangle-exclamation"></i>
                                    <span>{profileError}</span>
                                </div>
                            )}
                            
                            {profileSuccess && (
                                <div className="success-alert" style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fa-solid fa-circle-check"></i>
                                    <span>{profileSuccess}</span>
                                </div>
                            )}

                            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '20px' }} disabled={isSavingProfile}>
                                <i className="fa-solid fa-floppy-disk"></i> {isSavingProfile ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* El modal antiguo de gestión de usuarios ha sido removido y transformado en una vista a pantalla completa */}
        </div>
    );
}
