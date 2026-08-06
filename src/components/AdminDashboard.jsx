import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';
import KanbanBoard from './KanbanBoard';
import CustomStatusDropdown from './CustomStatusDropdown';
import CustomPriorityDropdown from './CustomPriorityDropdown';
import CustomFilterDropdown from './CustomFilterDropdown';
import CustomAssigneeDropdown from './CustomAssigneeDropdown';
import CustomAssigneeFilterDropdown from './CustomAssigneeFilterDropdown';
import { toast } from 'sonner';
import FormSelect from './FormSelect';
import SlaProgressBar from './SlaProgressBar';
import AuditLogModal from './AuditLogModal';
import CreateTicketModal from './CreateTicketModal';
import { getPharmacyDisplayName } from '../utils/pharmacyMap';
import StickyNotesManager from './StickyNotesManager';



export default function AdminDashboard({ currentUser, onLogout, currentTheme, onToggleTheme }) {
    const [tickets, setTickets] = useState([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterAssignee, setFilterAssignee] = useState('ALL');
    const [activeTicket, setActiveTicket] = useState(null);
    const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedTicketId, setExpandedTicketId] = useState(null);
    const [dbStatus, setDbStatus] = useState(null);
    const [viewType, setViewType] = useState(() => {
        const saved = localStorage.getItem('admin_view_type');
        return (saved && saved !== 'users') ? saved : 'list';
    });

    useEffect(() => {
        if (viewType !== 'users') {
            localStorage.setItem('admin_view_type', viewType);
        }
    }, [viewType]);
    const [selectedDetailTicket, setSelectedDetailTicket] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [auditLogTicket, setAuditLogTicket] = useState(null);

    // Estados de rechazo de tickets
    const [rejectionTicketId, setRejectionTicketId] = useState(null);
    const [rejectionReasonType, setRejectionReasonType] = useState('');
    const [rejectionCustomText, setRejectionCustomText] = useState('');

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
    const [userToDeleteState, setUserToDeleteState] = useState(null);
    const [resetPasswordVal, setResetPasswordVal] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [isSavingReset, setIsSavingReset] = useState(false);

    // Estados de contactos de farmacias
    const [isContactsModalOpen, setIsContactsModalOpen] = useState(false);
    const [selectedPharmacyProfile, setSelectedPharmacyProfile] = useState(null);
    const [contactsRegenteName, setContactsRegenteName] = useState('');
    const [contactsRegenteEmail, setContactsRegenteEmail] = useState('');
    const [contactsJefeName, setContactsJefeName] = useState('');
    const [contactsJefeEmail, setContactsJefeEmail] = useState('');
    const [isSavingContacts, setIsSavingContacts] = useState(false);
    const [contactsError, setContactsError] = useState('');
    const [contactsSuccess, setContactsSuccess] = useState('');

    useEffect(() => {
        loadTickets();
        loadProfiles();
        fetchDbSize();
        runAutoCleanup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-abrir ticket si viene en la URL (?ticket=ID)
    useEffect(() => {
        if (tickets.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const ticketId = params.get('ticket');
            if (ticketId) {
                const foundTicket = tickets.find(t => t.id === ticketId);
                if (foundTicket) {
                    setSelectedDetailTicket(foundTicket);
                    setIsDetailModalOpen(true);
                    
                    // Limpiar el query param de la URL
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                }
            }
        }
    }, [tickets]);

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

    const runAutoCleanup = async () => {
        try {
            const { data, error } = await supabase.rpc('cleanup_old_completed_tickets');
            if (error) {
                console.error('Error running completed tickets cleanup:', error);
            } else if (data) {
                const count = data.cleaned_tickets_count || 0;
                if (count > 0) {
                    console.log(`[Auto Cleanup] Limpieza exitosa de ${count} tickets completados hace más de 2 semanas.`);
                    console.log(`Detalle de eliminación: Mensajes: ${data.messages_deleted}, Entregables: ${data.deliverables_deleted}, Archivos: ${data.files_deleted}`);
                    fetchDbSize();
                }
            }
        } catch (err) {
            console.error('Unexpected error in auto cleanup:', err);
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
                    // Si el chat del ticket está abierto en el modal
                    const isChatOpen = isChatModalOpen && activeTicket && activeTicket.id === newMsg.ticket_id;
                    if (!isChatOpen) {
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
        if (newStatus === 'Recibido') {
            toast.warning('No puedes cambiar el estado de un ticket a Recibido.');
            return;
        }

        if (newStatus === 'Rechazado') {
            setRejectionTicketId(ticketId);
            setRejectionReasonType('');
            setRejectionCustomText('');
            return;
        }

        const isFinal = ['Finalizado', 'Aprobado'].includes(newStatus);
        const finalizedAtValue = isFinal ? new Date().toISOString() : null;

        try {
            const { error } = await supabase
                .from('tickets')
                .update({ status: newStatus, rejection_reason: null, finalized_at: finalizedAtValue })
                .eq('id', ticketId);

            if (error) throw error;

            // Actualizar en listas locales
            setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus, rejection_reason: null, finalized_at: finalizedAtValue } : t));
            if (activeTicket && activeTicket.id === ticketId) {
                setActiveTicket(prev => ({ ...prev, status: newStatus, rejection_reason: null, finalized_at: finalizedAtValue }));
            }
            if (selectedDetailTicket && selectedDetailTicket.id === ticketId) {
                setSelectedDetailTicket(prev => ({ ...prev, status: newStatus, rejection_reason: null, finalized_at: finalizedAtValue }));
            }

            toast.success(`Estado del ticket actualizado a "${newStatus}"`);

            // Registrar mensaje del sistema informando del cambio
            await supabase
                .from('messages')
                .insert({
                    ticket_id: ticketId,
                    sender_id: currentUser.id,
                    sender_name: 'Sistema',
                    message_text: `El estado del ticket ha sido cambiado a: **${newStatus}**`
                });

            // Disparar correo de notificación
            supabase.functions.invoke('send-email', {
                body: { ticket_id: ticketId, type: 'status', new_status: newStatus }
            }).catch(err => console.error('Error al enviar correo por cambio de estado:', err));

        } catch (e) {
            console.error('Error al cambiar estado:', e);
            toast.error('No se pudo actualizar el estado del ticket.');
        }
    };

    const handlePriorityChange = async (ticketId, newPriority) => {
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ priority: newPriority })
                .eq('id', ticketId);

            if (error) throw error;

            setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, priority: newPriority } : t));
            if (activeTicket && activeTicket.id === ticketId) {
                setActiveTicket(prev => ({ ...prev, priority: newPriority }));
            }
            if (selectedDetailTicket && selectedDetailTicket.id === ticketId) {
                setSelectedDetailTicket(prev => ({ ...prev, priority: newPriority }));
            }

            toast.success(`Prioridad del ticket actualizada a "${newPriority}"`);

            await supabase
                .from('messages')
                .insert({
                    ticket_id: ticketId,
                    sender_id: currentUser.id,
                    sender_name: 'Sistema',
                    message_text: `La prioridad del ticket ha sido cambiada a: **${newPriority}**`
                });

        } catch (e) {
            console.error('Error al cambiar prioridad:', e);
            toast.error('No se pudo actualizar la prioridad del ticket.');
        }
    };

    const handleAssigneeChange = async (ticketId, newAssignee) => {
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ assigned_to: newAssignee })
                .eq('id', ticketId);

            if (error) throw error;

            setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assigned_to: newAssignee } : t));
            if (activeTicket && activeTicket.id === ticketId) {
                setActiveTicket(prev => ({ ...prev, assigned_to: newAssignee }));
            }
            if (selectedDetailTicket && selectedDetailTicket.id === ticketId) {
                setSelectedDetailTicket(prev => ({ ...prev, assigned_to: newAssignee }));
            }

            toast.success(`Ticket asignado a: "${newAssignee}"`);

        } catch (e) {
            console.error('Error al cambiar encargado:', e);
            toast.error('No se pudo reasignar el ticket.');
        }
    };

    const handleConfirmRejection = async () => {
        if (!rejectionTicketId) return;

        if (!rejectionReasonType) {
            toast.error('Por favor seleccione un motivo de rechazo.');
            return;
        }

        let finalReason = rejectionReasonType;
        if (rejectionReasonType === 'Otros') {
            if (!rejectionCustomText.trim()) {
                toast.error('Por favor escriba el motivo del rechazo.');
                return;
            }
            if (rejectionCustomText.trim().length > 40) {
                toast.error('El motivo personalizado no puede exceder los 40 caracteres.');
                return;
            }
            finalReason = rejectionCustomText.trim();
        }

        const nowIso = new Date().toISOString();
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ 
                    status: 'Rechazado',
                    rejection_reason: finalReason,
                    finalized_at: nowIso
                })
                .eq('id', rejectionTicketId);

            if (error) throw error;

            // Actualizar en listas locales
            setTickets(prev => prev.map(t => t.id === rejectionTicketId ? { ...t, status: 'Rechazado', rejection_reason: finalReason, finalized_at: nowIso } : t));
            if (activeTicket && activeTicket.id === rejectionTicketId) {
                setActiveTicket(prev => ({ ...prev, status: 'Rechazado', rejection_reason: finalReason, finalized_at: nowIso }));
            }
            if (selectedDetailTicket && selectedDetailTicket.id === rejectionTicketId) {
                setSelectedDetailTicket(prev => ({ ...prev, status: 'Rechazado', rejection_reason: finalReason, finalized_at: nowIso }));
            }

            toast.success('El ticket ha sido rechazado correctamente.');

            // Registrar mensaje del sistema informando del cambio
            await supabase
                .from('messages')
                .insert({
                    ticket_id: rejectionTicketId,
                    sender_id: currentUser.id,
                    sender_name: 'Sistema',
                    message_text: `El estado del ticket ha sido cambiado a: **Rechazado**\nMotivo: ${finalReason}`
                });

            // Disparar correo de notificación
            supabase.functions.invoke('send-email', {
                body: { ticket_id: rejectionTicketId, type: 'status', new_status: 'Rechazado' }
            }).catch(err => console.error('Error al enviar correo por rechazo:', err));

            // Cerrar modal
            setRejectionTicketId(null);
            setRejectionReasonType('');
            setRejectionCustomText('');

        } catch (e) {
            console.error('Error al rechazar ticket:', e);
            toast.error('No se pudo rechazar el ticket.');
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
    const handleDeleteUser = (userToDelete) => {
        if (userToDelete.id === currentUser.id) {
            toast.warning('No puedes eliminar tu propio usuario administrador.');
            return;
        }
        setUserToDeleteState(userToDelete);
    };

    // Confirmar eliminación
    const confirmDeleteUser = async () => {
        if (!userToDeleteState) return;
        const userToDel = userToDeleteState;
        setUserToDeleteState(null);

        try {
            const { error } = await supabase.rpc('delete_profile_user', {
                p_user_id: userToDel.id
            });

            if (error) throw error;

            toast.success('Usuario eliminado correctamente.');
            await loadProfiles();
        } catch (err) {
            toast.error('Error al eliminar usuario: ' + err.message);
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

    const handleOpenContactsModal = async (profile) => {
        setSelectedPharmacyProfile(profile);
        setContactsRegenteName('');
        setContactsRegenteEmail('');
        setContactsJefeName('');
        setContactsJefeEmail('');
        setContactsError('');
        setContactsSuccess('');
        setIsContactsModalOpen(true);

        try {
            const { data, error } = await supabase
                .from('pharmacy_contacts')
                .select('*')
                .eq('profile_id', profile.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setContactsRegenteName(data.regente_name || '');
                setContactsRegenteEmail(data.regente_email || '');
                setContactsJefeName(data.jefe_name || '');
                setContactsJefeEmail(data.jefe_email || '');
            }
        } catch (err) {
            console.error('Error al cargar contactos de la farmacia:', err);
            setContactsError('No se pudieron cargar los contactos existentes.');
        }
    };

    const handleSaveContacts = async (e) => {
        e.preventDefault();
        setContactsError('');
        setContactsSuccess('');
        setIsSavingContacts(true);

        try {
            const { error } = await supabase
                .from('pharmacy_contacts')
                .upsert({
                    profile_id: selectedPharmacyProfile.id,
                    regente_name: contactsRegenteName.trim(),
                    regente_email: contactsRegenteEmail.trim(),
                    jefe_name: contactsJefeName.trim(),
                    jefe_email: contactsJefeEmail.trim(),
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            setContactsSuccess('Contactos actualizados correctamente.');
            toast.success(`Contactos de ${getPharmacyDisplayName(selectedPharmacyProfile.username)} actualizados.`);
            
            setTimeout(() => {
                setIsContactsModalOpen(false);
                setSelectedPharmacyProfile(null);
            }, 1000);
        } catch (err) {
            console.error('Error al guardar contactos:', err);
            setContactsError(err.message || 'Error al guardar los contactos.');
        } finally {
            setIsSavingContacts(false);
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
        const query = search.toLowerCase().trim();
        const displayName = getPharmacyDisplayName(ticket.pharmacy_name).toLowerCase();
        const matchesSearch = ticket.pharmacy_name.toLowerCase().includes(query) ||
                              displayName.includes(query) ||
                              ticket.description.toLowerCase().includes(query) ||
                              ticket.id.toLowerCase().includes(query) ||
                              (ticket.ticket_number && ticket.ticket_number.toString().includes(query));

        const matchesStatus = filterStatus === 'ALL' || ticket.status === filterStatus;
        const matchesAssignee = filterAssignee === 'ALL' || (ticket.assigned_to || 'Sin asignar') === filterAssignee;

        return matchesSearch && matchesStatus && matchesAssignee;
    });

    // Métricas KPI (filtradas por búsqueda y responsable, pero no por estado para mantener visibilidad de todas las columnas)
    const counts = {
        recibido: 0,
        enProceso: 0,
        enRevision: 0,
        aprobado: 0,
        finalizado: 0,
        rechazado: 0
    };
    tickets.forEach(t => {
        const query = search.toLowerCase().trim();
        const displayName = getPharmacyDisplayName(t.pharmacy_name).toLowerCase();
        const matchesSearch = t.pharmacy_name.toLowerCase().includes(query) ||
                              displayName.includes(query) ||
                              t.description.toLowerCase().includes(query) ||
                              t.id.toLowerCase().includes(query) ||
                              (t.ticket_number && t.ticket_number.toString().includes(query));

        const matchesAssignee = filterAssignee === 'ALL' || (t.assigned_to || 'Sin asignar') === filterAssignee;

        if (matchesSearch && matchesAssignee) {
            const s = t.status.toLowerCase();
            if (s === 'recibido') counts.recibido++;
            else if (s === 'en proceso') counts.enProceso++;
            else if (s === 'en revision' || s === 'en revisión') counts.enRevision++;
            else if (s === 'aprobado') counts.aprobado++;
            else if (s === 'finalizado') counts.finalizado++;
            else if (s === 'rechazado') counts.rechazado++;
        }
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
                    <h1>
                        {viewType === 'list' && 'Panel de Lista'}
                        {viewType === 'kanban' && 'Vista Kanban'}
                        {viewType === 'workspace' && 'Vista de Trabajo'}
                        {viewType === 'users' && 'Gestión de Usuarios'}
                    </h1>
                </div>

                {/* Pill Derecho: DB Status + Toggle Tema + Logout */}
                <div className="header-controls-pill">
                    {/* Toggle de Vista: Lista / Kanban / Usuarios */}
                    {viewType !== 'users' ? (
                        <div className="view-toggle-segmented">
                            <button
                                className={`view-toggle-btn ${viewType === 'list' ? 'active' : ''}`}
                                onClick={() => setViewType('list')}
                                title="Vista Lista"
                                aria-label="Vista Lista"
                            >
                                <i className="fa-solid fa-list"></i>
                            </button>
                            <button
                                className={`view-toggle-btn ${viewType === 'kanban' ? 'active' : ''}`}
                                onClick={() => setViewType('kanban')}
                                title="Vista Kanban"
                                aria-label="Vista Kanban"
                            >
                                <i className="fa-solid fa-table-columns"></i>
                            </button>
                            <button
                                className={`view-toggle-btn workspace-only-desktop ${viewType === 'workspace' ? 'active' : ''}`}
                                onClick={() => setViewType('workspace')}
                                title="Espacio de Trabajo"
                                aria-label="Espacio de Trabajo"
                            >
                                <i className="fa-solid fa-window-restore"></i>
                            </button>
                        </div>
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
            <div className={`dashboard-container ${viewType === 'kanban' ? 'kanban-mode' : ''} ${viewType === 'workspace' ? 'workspace-mode' : ''}`}>
                
                {/* 1. ESPACIO DE TRABAJO (WORKSPACE) */}
                {viewType === 'workspace' && (
                    <>
                        {/* Tarjetas de Métricas KPI */}
                        <div className="workspace-metrics-row">
                            <div className="workspace-metric-card">
                                <div className="workspace-metric-icon recibido">
                                    <i className="fa-solid fa-inbox"></i>
                                </div>
                                <div className="workspace-metric-info">
                                    <span className="workspace-metric-value">{counts.recibido}</span>
                                    <span className="workspace-metric-label">Recibidos</span>
                                </div>
                            </div>

                            <div className="workspace-metric-card">
                                <div className="workspace-metric-icon en-proceso">
                                    <i className="fa-solid fa-gears"></i>
                                </div>
                                <div className="workspace-metric-info">
                                    <span className="workspace-metric-value">{counts.enProceso}</span>
                                    <span className="workspace-metric-label">En Proceso</span>
                                </div>
                            </div>

                            <div className="workspace-metric-card">
                                <div className="workspace-metric-icon en-revision">
                                    <i className="fa-solid fa-magnifying-glass"></i>
                                </div>
                                <div className="workspace-metric-info">
                                    <span className="workspace-metric-value">{counts.enRevision}</span>
                                    <span className="workspace-metric-label">En Revisión</span>
                                </div>
                            </div>

                            <div className="workspace-metric-card">
                                <div className="workspace-metric-icon aprobado">
                                    <i className="fa-solid fa-circle-check"></i>
                                </div>
                                <div className="workspace-metric-info">
                                    <span className="workspace-metric-value">{counts.aprobado}</span>
                                    <span className="workspace-metric-label">Aprobados</span>
                                </div>
                            </div>

                            <div className="workspace-metric-card">
                                <div className="workspace-metric-icon finalizado">
                                    <i className="fa-solid fa-flag-checkered"></i>
                                </div>
                                <div className="workspace-metric-info">
                                    <span className="workspace-metric-value">{counts.finalizado}</span>
                                    <span className="workspace-metric-label">Finalizados</span>
                                </div>
                            </div>

                            <div className="workspace-metric-card">
                                <div className="workspace-metric-icon rechazado">
                                    <i className="fa-solid fa-circle-xmark"></i>
                                </div>
                                <div className="workspace-metric-info">
                                    <span className="workspace-metric-value">{counts.rechazado}</span>
                                    <span className="workspace-metric-label">Rechazados</span>
                                </div>
                            </div>
                        </div>

                        {/* Contenedor 3 Columnas Desktop */}
                        <div className="desktop-workspace-container">
                            {/* Columna 1: Sidebar con lista de tickets */}
                            <div className="workspace-sidebar">
                                <div className="sidebar-header-box">
                                    <div className="sidebar-title-row">
                                        <h3>Solicitudes</h3>
                                        <button className="btn btn-secondary btn-icon-only" style={{ padding: '6px 10px', fontSize: '0.8rem' }} onClick={loadTickets} title="Actualizar lista">
                                            <i className="fa-solid fa-rotate"></i>
                                        </button>
                                    </div>
                                    
                                    <div className="sidebar-search-wrapper">
                                        <i className="fa-solid fa-magnifying-glass"></i>
                                        <input 
                                            type="text" 
                                            className="sidebar-search-input" 
                                            placeholder="Buscar ticket o farmacia..." 
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                        />
                                    </div>

                                    {/* Filtros en dropdown: Estado + Responsable */}
                                    <div className="sidebar-filter-dropdowns">
                                        <CustomFilterDropdown
                                            value={filterStatus}
                                            onChange={setFilterStatus}
                                        />
                                        <CustomAssigneeFilterDropdown
                                            value={filterAssignee}
                                            onChange={setFilterAssignee}
                                        />
                                    </div>
                                </div>

                                <div className="sidebar-tickets-list">
                                    {filteredTickets.length === 0 ? (
                                        <div className="empty-state" style={{ height: 'auto', padding: '30px 10px', textAlign: 'center' }}>
                                            <i className="fa-solid fa-inbox" style={{ fontSize: '1.8rem', opacity: 0.5 }}></i>
                                            <p style={{ fontSize: '0.85rem', marginTop: '10px' }}>No hay solicitudes</p>
                                        </div>
                                    ) : (
                                        filteredTickets.map(ticket => {
                                            const isActive = activeTicket && activeTicket.id === ticket.id;
                                            const hasUnread = unreadTicketIds.has(ticket.id);
                                            const fechaCompact = new Date(ticket.created_at).toLocaleDateString('es-ES', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric'
                                            });

                                            return (
                                                <div 
                                                    key={ticket.id}
                                                    className={`sidebar-ticket-card ${isActive ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setActiveTicket(ticket);
                                                        // Quitar de alertas no leídas
                                                        setUnreadTicketIds(prev => {
                                                            const updated = new Set(prev);
                                                            updated.delete(ticket.id);
                                                            return updated;
                                                        });
                                                    }}
                                                >
                                                    <div className="sidebar-ticket-card-header">
                                                        <span className={`card-ticket-id ${hasUnread ? 'unread' : ''}`}>
                                                            {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 6)}`}
                                                        </span>
                                                        <span className={`badge status-pill status-pill-${ticket.status.toLowerCase().replace(' ', '_')}`} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                                                            {ticket.status}
                                                        </span>
                                                    </div>
                                                    
                                                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className="fa-solid fa-hospital" style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}></i>
                                                        {getPharmacyDisplayName(ticket.pharmacy_name)}
                                                    </div>

                                                    <span className="card-ticket-desc-snippet">
                                                        {ticket.description}
                                                    </span>

                                                    <div className="sidebar-ticket-card-badges">
                                                        {ticket.priority && (
                                                            <span className={`card-badge-priority ${ticket.priority.toLowerCase()}`}>
                                                                <i className="fa-solid fa-circle-exclamation"></i>
                                                                {ticket.priority}
                                                            </span>
                                                        )}
                                                        {ticket.request_type && (
                                                            <span className="card-badge-type">
                                                                <i className={getRequestTypeIcon(ticket.request_type)}></i>
                                                                {ticket.request_type.replace(' o jornadas médicas', '').replace('Activaciones/Eventos/Insumos/Utileria', 'Insumos/Utilería').substring(0, 18)}
                                                            </span>
                                                        )}
                                                        {ticket.assigned_to && ticket.assigned_to !== 'Sin asignar' && (
                                                            <span className="card-badge-assignee" style={{ fontSize: '0.68rem', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <i className="fa-solid fa-user-circle" style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}></i>
                                                                {ticket.assigned_to}
                                                            </span>
                                                        )}
                                                        {(() => {
                                                            const daysInfo = getElapsedDays(ticket);
                                                            
                                                            return (
                                                                <span className={`days-elapsed-badge ${!daysInfo.hasStarted ? 'pending' : ''}`} style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px' }}>
                                                                    <i className={daysInfo.hasStarted ? "fa-solid fa-calendar-check" : "fa-regular fa-clock"} style={{ fontSize: '0.68rem' }}></i>
                                                                    {daysInfo.hasStarted ? (
                                                                        `${daysInfo.days} ${daysInfo.days === 1 ? 'día' : 'días'}`
                                                                    ) : (
                                                                        `Inicia el ${daysInfo.startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`
                                                                    )}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>

                                                    <div className="card-ticket-footer">
                                                        <span>Creado: {fechaCompact}</span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Columna 2: Detalles del ticket activo */}
                            <div className="workspace-main-pane">
                                {!activeTicket ? (
                                    <div className="workspace-empty-state">
                                        <i className="fa-solid fa-folder-open"></i>
                                        <p>Selecciona una solicitud de la lista para ver su detalle</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Detalles del ticket */}
                                        <div className="workspace-details-column">
                                            <div className="workspace-details-header">
                                                {/* Fila 1: ID + Farmacia + Fecha */}
                                                <div className="workspace-details-info-row">
                                                    <div className="workspace-details-id-badge">
                                                        {activeTicket.ticket_number ? `TK-${activeTicket.ticket_number}` : `#${activeTicket.id.substring(0,6)}`}
                                                    </div>
                                                    <span className="workspace-details-pharmacy">
                                                        <i className="fa-solid fa-hospital"></i>
                                                        {getPharmacyDisplayName(activeTicket.pharmacy_name)}
                                                    </span>
                                                    <span className="workspace-details-date">
                                                        <i className="fa-regular fa-clock"></i>
                                                        {new Date(activeTicket.created_at).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                                                    </span>
                                                </div>
                                                {/* Fila 2: Acciones */}
                                                <div className="workspace-details-actions-row">
                                                    <button 
                                                        className="btn-history-pill"
                                                        onClick={() => {
                                                            setAuditLogTicket(activeTicket);
                                                            setIsAuditModalOpen(true);
                                                        }}
                                                        title="Ver historial de auditoría"
                                                    >
                                                        <i className="fa-solid fa-clock-rotate-left"></i>
                                                        <span>Historial</span>
                                                    </button>
                                                    <button 
                                                        className={`btn workspace-chat-btn ${unreadTicketIds.has(activeTicket.id) ? 'pulse-alert' : ''}`}
                                                        onClick={() => handleOpenChat(activeTicket)}
                                                        title="Abrir chat de soporte"
                                                    >
                                                        <i className="fa-regular fa-comments"></i>
                                                        <span>Chat</span>
                                                        {unreadTicketIds.has(activeTicket.id) && (
                                                            <span className="btn-unread-badge"></span>
                                                        )}
                                                    </button>
                                                    <div className="workspace-actions-divider"></div>
                                                    <CustomStatusDropdown 
                                                        value={activeTicket.status}
                                                        onChange={(val) => handleStatusChange(activeTicket.id, val)}
                                                    />
                                                    <CustomPriorityDropdown 
                                                        value={activeTicket.priority || 'Normal'}
                                                        onChange={(val) => handlePriorityChange(activeTicket.id, val)}
                                                    />
                                                    <CustomAssigneeDropdown 
                                                        value={activeTicket.assigned_to || 'Sin asignar'}
                                                        onChange={(val) => handleAssigneeChange(activeTicket.id, val)}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '20px' }}>
                                                <SlaProgressBar ticket={activeTicket} showDetails={true} />
                                            </div>

                                            {activeTicket.status === 'Rechazado' && activeTicket.rejection_reason && (
                                                <div className="rejection-reason-banner" style={{ marginBottom: '20px' }}>
                                                    <i className="fa-solid fa-circle-xmark"></i>
                                                    <div>
                                                        <strong>Motivo de rechazo:</strong> {activeTicket.rejection_reason}
                                                    </div>
                                                </div>
                                            )}

                                            {activeTicket.request_type ? (
                                                renderStructuredDetails(activeTicket)
                                            ) : (
                                                <div className="detail-description-box" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descripción</h5>
                                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{activeTicket.description}</p>
                                                </div>
                                            )}

                                            {/* Módulo de Notas Administración en Vista de Trabajo */}
                                            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                                                <StickyNotesManager 
                                                    notes={(() => {
                                                        if (!activeTicket.admin_notes) return [];
                                                        try {
                                                            return typeof activeTicket.admin_notes === 'string' ? JSON.parse(activeTicket.admin_notes) : activeTicket.admin_notes;
                                                        } catch (e) {
                                                            return [];
                                                        }
                                                    })()} 
                                                    onSaveNotes={async (updatedNotes) => {
                                                        try {
                                                            const strNotes = JSON.stringify(updatedNotes);
                                                            const { error } = await supabase
                                                                .from('tickets')
                                                                .update({ admin_notes: strNotes })
                                                                .eq('id', activeTicket.id);
                                                            if (!error) {
                                                                setActiveTicket(prev => ({ ...prev, admin_notes: strNotes }));
                                                                setTickets(prev => prev.map(t => t.id === activeTicket.id ? { ...t, admin_notes: strNotes } : t));
                                                            } else {
                                                                toast.error('No se pudieron guardar las notas');
                                                            }
                                                        } catch (err) {
                                                            console.error('Error guardando notas:', err);
                                                        }
                                                    }} 
                                                    isAdmin={true}
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Fallback Responsivo para Móviles */}
                        <div className="admin-workspace-mobile-fallback">
                            <i className="fa-solid fa-desktop"></i>
                            <h3>Vista Optimizada para Escritorio</h3>
                            <p>El Espacio de Trabajo requiere una pantalla más grande. Por favor, use la vista de Lista o Kanban en su dispositivo móvil.</p>
                            <div className="flex-row gap-12 justify-center" style={{ marginTop: '16px' }}>
                                <button className="btn btn-primary btn-sm" onClick={() => setViewType('list')}>Ver Lista</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setViewType('kanban')}>Ver Kanban</button>
                            </div>
                        </div>
                    </>
                )}

                {/* 2. VISTAS ESTÁNDAR (LISTA / KANBAN / USUARIOS) */}
                {viewType !== 'workspace' && (
                    <div className={`modern-layout ${viewType === 'kanban' ? 'kanban-layout' : ''}`}>
                    {/* Barra de Acciones y Filtros */}
                    {viewType === 'list' && (
                        <div className="search-filter-capsule">
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
                                        style={{ right: '8px' }}
                                        onClick={() => setSearch('')} 
                                        title="Limpiar búsqueda"
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </div>

                            <div className="capsule-divider"></div>

                            <CustomFilterDropdown 
                                value={filterStatus}
                                onChange={setFilterStatus}
                            />
                            <CustomAssigneeFilterDropdown 
                                value={filterAssignee}
                                onChange={setFilterAssignee}
                            />

                            <div className="capsule-divider"></div>

                            <button
                                className="btn btn-primary"
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                                    flexShrink: 0
                                }}
                                onClick={() => setIsCreateModalOpen(true)}
                                title="Crear Nueva Solicitud"
                                aria-label="Crear Nueva Solicitud"
                            >
                                <i className="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    )}

                    {/* Barra de filtro de gestora para Kanban */}
                    {viewType === 'kanban' && (
                        <div className="kanban-filter-bar">
                            <span className="kanban-filter-label">
                                <i className="fa-solid fa-filter"></i> Gestora
                            </span>
                            <div className="kanban-filter-pills">
                                {[
                                    { value: 'ALL', label: 'Todas', icon: 'fa-users' },
                                    { value: 'Yarleny',   label: 'Yarleny',   color: '#a855f7' },
                                    { value: 'Angelica',  label: 'Angelica',  color: '#0ea5e9' },
                                    { value: 'Yoselyn',   label: 'Yoselyn',   color: '#ec4899' },
                                    { value: 'Emma',      label: 'Emma',      color: '#3b82f6' },
                                    { value: 'Sin asignar', label: 'Sin asignar', color: '#64748b' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`kanban-filter-pill ${filterAssignee === opt.value ? 'active' : ''}`}
                                        onClick={() => setFilterAssignee(opt.value)}
                                        style={filterAssignee === opt.value && opt.color ? {
                                            background: opt.color,
                                            borderColor: opt.color,
                                            color: '#fff',
                                            boxShadow: `0 0 12px ${opt.color}55`
                                        } : {}}
                                    >
                                        {opt.icon
                                            ? <i className={`fa-solid ${opt.icon}`}></i>
                                            : <span className="kanban-pill-avatar" style={{ background: opt.color }}>{opt.label.charAt(0)}</span>
                                        }
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                className="btn btn-primary"
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    marginLeft: 'auto',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                                    flexShrink: 0
                                }}
                                onClick={() => setIsCreateModalOpen(true)}
                                title="Crear Nueva Solicitud"
                                aria-label="Crear Nueva Solicitud"
                            >
                                <i className="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    )}

                    {/* Listado en estilo tarjetas modernas */}
                    {viewType === 'kanban' && (() => {
                        const now = new Date();
                        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
                        const activeKanbanTickets = filteredTickets.filter(ticket => {
                            const status = (ticket.status || '').toLowerCase();
                            if (status === 'finalizado' || status === 'rechazado') {
                                const dateToUse = ticket.updated_at || ticket.created_at;
                                if (!dateToUse) return true;
                                const updatedAt = new Date(dateToUse);
                                return (now - updatedAt) < ONE_WEEK_MS;
                            }
                            return true;
                        });
                        return (
                            <KanbanBoard 
                                tickets={activeKanbanTickets}
                                onOpenChat={handleOpenChat}
                                onOpenDetails={(ticket) => {
                                    setSelectedDetailTicket(ticket);
                                    setIsDetailModalOpen(true);
                                }}
                                onStatusChange={handleStatusChange}
                                unreadTicketIds={unreadTicketIds}
                            />
                        );
                    })()}

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
                            filteredTickets.map((ticket, idx) => {
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
                                                               <div className="accordion-header" onClick={() => toggleAccordion(ticket.id)}>
                                             <div className="accordion-header-left" style={{ maxWidth: '75%', display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: '8px' }}>
                                                 <span className="accordion-ticket-id">
                                                     {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}...`}
                                                 </span>
                                                 <span
                                                     className="accordion-pharmacy-name"
                                                     style={{
                                                         color: 'var(--text-primary)',
                                                         fontSize: '0.85rem',
                                                         fontWeight: '600',
                                                         textOverflow: 'ellipsis',
                                                         whiteSpace: 'nowrap',
                                                         overflow: 'hidden',
                                                         maxWidth: '140px',
                                                         flexShrink: 0
                                                     }}
                                                 >
                                                     <i className="fa-solid fa-hospital" style={{ color: 'var(--color-primary)', marginRight: '6px' }}></i>
                                                     {getPharmacyDisplayName(ticket.pharmacy_name)}
                                                 </span>
                                                 {hasUnread && <span className="badge-unread" style={{ flexShrink: 0 }}>Nuevo</span>}
                                                 {/* Badges en línea horizontal */}
                                                 <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                      {ticket.priority && (
                                                          <span 
                                                              className={`priority-badge-pill priority-${ticket.priority.toLowerCase().replace(' ', '-')}`}
                                                              data-tooltip={`Prioridad: ${ticket.priority}`}
                                                              data-tooltip-position={idx === 0 ? "bottom-right-align" : "top-right-align"}
                                                          >
                                                              <i className="fa-solid fa-circle-exclamation"></i>
                                                          </span>
                                                      )}
                                                      {ticket.request_type && (
                                                           <span 
                                                               className="type-badge-pill" 
                                                               data-tooltip={`Categoría: ${ticket.request_type}`}
                                                               data-tooltip-position={idx === 0 ? "bottom-right-align" : "top-right-align"}
                                                           >
                                                               <i className={getRequestTypeIcon(ticket.request_type)}></i>
                                                           </span>
                                                      )}
                                                      {ticket.assigned_to && ticket.assigned_to !== 'Sin asignar' && (
                                                           <span 
                                                               className="assignee-badge-pill" 
                                                               data-tooltip={`Encargado: ${ticket.assigned_to}`}
                                                               data-tooltip-position={idx === 0 ? "bottom-right-align" : "top-right-align"}
                                                               style={{ marginLeft: '4px' }}
                                                           >
                                                               <i className="fa-solid fa-user-gear"></i>
                                                           </span>
                                                      )}
                                                 </div>
                                                  <span
                                                      className="accordion-ticket-desc"
                                                      style={{
                                                          color: 'var(--text-secondary)',
                                                          fontSize: '0.82rem',
                                                          fontWeight: '400',
                                                          overflow: 'hidden',
                                                          textOverflow: 'ellipsis',
                                                          whiteSpace: 'nowrap',
                                                          flex: '1 1 auto',
                                                          minWidth: '0'
                                                      }}
                                                      title={ticket.description}
                                                  >
                                                      {ticket.description}
                                                  </span>
                                              </div>
                                              <div className="accordion-header-right">
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
                                             <div className="accordion-body" style={{ paddingTop: '20px' }}>
                                                 {ticket.status === 'Rechazado' && ticket.rejection_reason && (
                                                     <div className="rejection-reason-banner" style={{ marginBottom: '16px' }}>
                                                         <i className="fa-solid fa-circle-xmark"></i>
                                                         <div>
                                                             <strong>Motivo de rechazo:</strong> {ticket.rejection_reason}
                                                         </div>
                                                     </div>
                                                 )}
                                                 
                                                 <div className="accordion-action-bar-premium">
                                                      <div className="action-bar-controls" onClick={(e) => e.stopPropagation()}>
                                                          <div className="status-selector-wrapper">
                                                              <span className="status-selector-label">
                                                                  Estado:
                                                              </span>
                                                              <CustomStatusDropdown 
                                                                  value={ticket.status}
                                                                  onChange={(val) => handleStatusChange(ticket.id, val)}
                                                              />
                                                          </div>
                                                          <div className="status-selector-wrapper">
                                                              <span className="status-selector-label">
                                                                  Prioridad:
                                                              </span>
                                                              <CustomPriorityDropdown 
                                                                  value={ticket.priority || 'Normal'}
                                                                  onChange={(val) => handlePriorityChange(ticket.id, val)}
                                                              />
                                                          </div>
                                                          <div className="status-selector-wrapper" onClick={(e) => e.stopPropagation()}>
                                                              <span className="status-selector-label">
                                                                  Encargado:
                                                              </span>
                                                              <CustomAssigneeDropdown 
                                                                  value={ticket.assigned_to || 'Sin asignar'}
                                                                  onChange={(val) => handleAssigneeChange(ticket.id, val)}
                                                              />
                                                          </div>
                                                          <button 
                                                              className={`btn ${hasUnread ? 'btn-danger' : 'btn-primary'} btn-sm unread-badge-container`}
                                                              onClick={() => handleOpenChat(ticket)}
                                                              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                                                          >
                                                              <i className="fa-regular fa-comments"></i>
                                                              <span>Chat</span>
                                                              {hasUnread && <span className="pulsing-alert-dot"></span>}
                                                          </button>
                                                      </div>
                                                  </div>
                                                  {ticket.request_type ? (
                                                      renderStructuredDetails(ticket)
                                                  ) : (
                                                      <div className="detail-description-box" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                                                          <h5 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descripción</h5>
                                                          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
                                                      </div>
                                                  )}

                                                  {/* Módulo de Notas Administración en Vista de Lista */}
                                                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                                                      <StickyNotesManager 
                                                          notes={(() => {
                                                              if (!ticket.admin_notes) return [];
                                                              try {
                                                                  return typeof ticket.admin_notes === 'string' ? JSON.parse(ticket.admin_notes) : ticket.admin_notes;
                                                              } catch (e) {
                                                                  return [];
                                                              }
                                                          })()} 
                                                          onSaveNotes={async (updatedNotes) => {
                                                              try {
                                                                  const strNotes = JSON.stringify(updatedNotes);
                                                                  const { error } = await supabase
                                                                      .from('tickets')
                                                                      .update({ admin_notes: strNotes })
                                                                      .eq('id', ticket.id);
                                                                  if (!error) {
                                                                      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, admin_notes: strNotes } : t));
                                                                  } else {
                                                                      toast.error('No se pudieron guardar las notas');
                                                                  }
                                                              } catch (err) {
                                                                  console.error('Error guardando notas:', err);
                                                              }
                                                          }} 
                                                          isAdmin={true}
                                                      />
                                                  </div>
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
                                                                {p.role === 'farmacia' && (
                                                                    <button 
                                                                        className="btn-table-action"
                                                                        onClick={() => handleOpenContactsModal(p)}
                                                                        title="Editar Contactos de Farmacia"
                                                                        style={{ marginLeft: '4px' }}
                                                                    >
                                                                        <i className="fa-solid fa-address-book"></i> Contacto
                                                                    </button>
                                                                )}
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
                                                        <FormSelect
                                                            id="create-role"
                                                            value={createRole}
                                                            onChange={(e) => setCreateRole(e.target.value)}
                                                            options={[
                                                                { value: 'farmacia', label: 'Farmacia' },
                                                                { value: 'admin', label: 'Administrador' }
                                                            ]}
                                                            placeholder="Seleccione un rol..."
                                                            disabled={isSavingNewUser}
                                                        />
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
                )}
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
                                    <span>{getPharmacyDisplayName(selectedDetailTicket.pharmacy_name)}</span>
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
                                <div className="detail-meta-item" style={{ overflow: 'visible' }}>
                                    <label>Prioridad</label>
                                    <CustomPriorityDropdown 
                                        value={selectedDetailTicket.priority || 'Normal'}
                                        onChange={(val) => handlePriorityChange(selectedDetailTicket.id, val)}
                                    />
                                </div>
                                <div className="detail-meta-item" style={{ overflow: 'visible' }}>
                                    <label>Encargado</label>
                                    <CustomAssigneeDropdown 
                                        value={selectedDetailTicket.assigned_to || 'Sin asignar'}
                                        onChange={(val) => handleAssigneeChange(selectedDetailTicket.id, val)}
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
                                <div className="detail-meta-item">
                                    <label>Historial de Ticket</label>
                                    <button 
                                        className="btn btn-secondary btn-sm"
                                        style={{ width: '100%', padding: '4px', fontSize: '0.8rem', marginTop: '2px' }}
                                        onClick={() => {
                                            setAuditLogTicket(selectedDetailTicket);
                                            setIsAuditModalOpen(true);
                                        }}
                                    >
                                        <i className="fa-solid fa-clock-rotate-left"></i> Ver Historial
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <SlaProgressBar ticket={selectedDetailTicket} showDetails={true} />
                            </div>

                            {selectedDetailTicket.status === 'Rechazado' && selectedDetailTicket.rejection_reason && (
                                <div className="rejection-reason-banner" style={{ marginBottom: '16px' }}>
                                    <i className="fa-solid fa-circle-xmark"></i>
                                    <div>
                                        <strong>Motivo de rechazo:</strong> {selectedDetailTicket.rejection_reason}
                                    </div>
                                </div>
                            )}

                            {selectedDetailTicket.request_type ? (
                                renderStructuredDetails(selectedDetailTicket)
                            ) : (
                                <div className="detail-description-box">
                                    <h5>Descripción del Problema</h5>
                                    <p>{selectedDetailTicket.description}</p>
                                </div>
                            )}

                            {/* Módulo de Notas Administración */}
                            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                <StickyNotesManager
                                    notes={(() => {
                                        if (!selectedDetailTicket.admin_notes) return [];
                                        try {
                                            return typeof selectedDetailTicket.admin_notes === 'string' 
                                                ? JSON.parse(selectedDetailTicket.admin_notes) 
                                                : selectedDetailTicket.admin_notes;
                                        } catch (e) {
                                            return [];
                                        }
                                    })()}
                                    onSaveNotes={async (updatedNotes) => {
                                        try {
                                            const { error } = await supabase
                                                .from('tickets')
                                                .update({ admin_notes: JSON.stringify(updatedNotes) })
                                                .eq('id', selectedDetailTicket.id);
                                            
                                            if (!error) {
                                                setSelectedDetailTicket(prev => ({
                                                    ...prev,
                                                    admin_notes: JSON.stringify(updatedNotes)
                                                }));
                                                setTickets(prev => prev.map(t => 
                                                    t.id === selectedDetailTicket.id 
                                                        ? { ...t, admin_notes: JSON.stringify(updatedNotes) } 
                                                        : t
                                                ));
                                            } else {
                                                toast.error('No se pudieron guardar las notas');
                                            }
                                        } catch (err) {
                                            console.error('Error guardando notas:', err);
                                        }
                                    }}
                                    isAdmin={true}
                                />
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

            {/* MODAL 4: Motivo de Rechazo */}
            {rejectionTicketId && (
                <div className="modal-overlay" onClick={() => setRejectionTicketId(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <button className="modal-close-btn" onClick={() => setRejectionTicketId(null)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h3 style={{ marginBottom: '20px', fontSize: '1.3rem', fontWeight: '700', color: 'var(--color-danger)' }}>
                            <i className="fa-solid fa-circle-xmark"></i> Rechazar Solicitud
                        </h3>
                        
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Por favor, seleccione el motivo por el cual está rechazando esta solicitud:
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                            {[
                                'Presupuesto',
                                'No aplica por estrategia',
                                'Falta de aprobación de terceros',
                                'Otros'
                            ].map((reason) => (
                                <label 
                                    key={reason}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '12px 16px',
                                        borderRadius: '10px',
                                        background: 'rgba(255, 255, 255, 0.02)',
                                        border: `1px solid ${rejectionReasonType === reason ? 'var(--color-danger)' : 'var(--border-color)'}`,
                                        cursor: 'pointer',
                                        transition: 'var(--transition-smooth)'
                                    }}
                                    className="rejection-option-label"
                                >
                                    <input 
                                        type="radio" 
                                        name="rejection-reason" 
                                        value={reason} 
                                        checked={rejectionReasonType === reason}
                                        onChange={() => setRejectionReasonType(reason)}
                                        style={{ accentColor: 'var(--color-danger)', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                        {reason}
                                    </span>
                                </label>
                            ))}
                        </div>

                        {rejectionReasonType === 'Otros' && (
                            <div className="input-group" style={{ marginBottom: '20px' }}>
                                <label htmlFor="rejection-custom-text" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Escriba el motivo personalizado:</label>
                                <textarea 
                                    id="rejection-custom-text"
                                    value={rejectionCustomText}
                                    onChange={(e) => setRejectionCustomText(e.target.value)}
                                    maxLength={40}
                                    rows={2}
                                    placeholder="Escriba aquí (máx. 40 caracteres)..."
                                    style={{ width: '100%', resize: 'none' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {rejectionCustomText.length}/40 caracteres
                                </div>
                            </div>
                        )}

                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                            <button className="btn btn-secondary" onClick={() => setRejectionTicketId(null)}>
                                Cancelar
                            </button>
                            <button className="btn btn-danger" onClick={handleConfirmRejection}>
                                Confirmar Rechazo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* El modal antiguo de gestión de usuarios ha sido removido y transformado en una vista a pantalla completa */}

            {/* MODAL: Historial de Auditoría (Audit Log) */}
            {isAuditModalOpen && auditLogTicket && (
                <AuditLogModal 
                    isOpen={isAuditModalOpen} 
                    onClose={() => {
                        setAuditLogTicket(null);
                        setIsAuditModalOpen(false);
                    }}
                    ticket={auditLogTicket}
                />
            )}

            {/* MODAL: Confirmar Eliminación de Usuario */}
            {userToDeleteState && (
                <div className="modal-overlay" onClick={() => setUserToDeleteState(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center', padding: '30px' }}>
                        <div style={{ fontSize: '2.5rem', color: 'var(--color-danger)', marginBottom: '16px' }}>
                            <i className="fa-solid fa-user-xmark"></i>
                        </div>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                            ¿Eliminar Usuario?
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.4' }}>
                            ¿Estás seguro de que deseas eliminar al usuario <strong>"{userToDeleteState.username}"</strong>?
                            <br />
                            <span style={{ color: 'var(--color-danger)', fontWeight: '600', marginTop: '6px', display: 'block' }}>
                                Esta acción es irreversible y eliminará todos sus tickets y mensajes.
                            </span>
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setUserToDeleteState(null)}
                                style={{ flex: 1, padding: '10px 16px', fontSize: '0.85rem', borderRadius: '8px' }}
                            >
                                Cancelar
                            </button>
                            <button 
                                className="btn btn-danger" 
                                onClick={confirmDeleteUser}
                                style={{ flex: 1, padding: '10px 16px', fontSize: '0.85rem', borderRadius: '8px' }}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Editar Contactos de Farmacia */}
            {isContactsModalOpen && selectedPharmacyProfile && (
                <div className="modal-overlay" onClick={() => setIsContactsModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <button className="modal-close-btn" onClick={() => setIsContactsModalOpen(false)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h3 style={{ marginBottom: '20px', fontSize: '1.3rem', fontWeight: '700' }}>
                            <i className="fa-solid fa-address-book"></i> Contactos de Farmacia
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            Configura los nombres y correos de contacto para <strong>{getPharmacyDisplayName(selectedPharmacyProfile.username)}</strong>. Estos correos recibirán notificaciones del sistema.
                        </p>
                        <form onSubmit={handleSaveContacts}>
                            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fa-solid fa-user-shield" style={{ color: 'var(--color-warning)' }}></i> Regente / Supervisor
                                </h4>
                                <div className="input-group" style={{ marginBottom: '12px' }}>
                                    <label htmlFor="regente-name">Nombre Completo</label>
                                    <input 
                                        id="regente-name"
                                        type="text" 
                                        placeholder="Nombre del Regente"
                                        value={contactsRegenteName}
                                        onChange={(e) => setContactsRegenteName(e.target.value)}
                                        disabled={isSavingContacts}
                                    />
                                </div>
                                <div className="input-group" style={{ marginBottom: '4px' }}>
                                    <label htmlFor="regente-email">Correo Electrónico</label>
                                    <input 
                                        id="regente-email"
                                        type="email" 
                                        placeholder="ejemplo@puntofarma.hn"
                                        value={contactsRegenteEmail}
                                        onChange={(e) => setContactsRegenteEmail(e.target.value)}
                                        disabled={isSavingContacts}
                                    />
                                </div>
                            </div>

                            <div style={{ paddingBottom: '12px', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fa-solid fa-user-tie" style={{ color: 'var(--border-focus)' }}></i> Jefe de Farmacia / Tienda
                                </h4>
                                <div className="input-group" style={{ marginBottom: '12px' }}>
                                    <label htmlFor="jefe-name">Nombre Completo</label>
                                    <input 
                                        id="jefe-name"
                                        type="text" 
                                        placeholder="Nombre del Jefe"
                                        value={contactsJefeName}
                                        onChange={(e) => setContactsJefeName(e.target.value)}
                                        disabled={isSavingContacts}
                                    />
                                </div>
                                <div className="input-group" style={{ marginBottom: '4px' }}>
                                    <label htmlFor="jefe-email">Correo Electrónico</label>
                                    <input 
                                        id="jefe-email"
                                        type="email" 
                                        placeholder="jefe@puntofarma.hn"
                                        value={contactsJefeEmail}
                                        onChange={(e) => setContactsJefeEmail(e.target.value)}
                                        disabled={isSavingContacts}
                                    />
                                </div>
                            </div>

                            {contactsError && (
                                <div className="error-alert" style={{ marginTop: '12px', marginBottom: '12px' }}>
                                    <i className="fa-solid fa-triangle-exclamation"></i>
                                    <span>{contactsError}</span>
                                </div>
                            )}

                            {contactsSuccess && (
                                <div className="success-alert" style={{ marginTop: '12px', marginBottom: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <i className="fa-solid fa-circle-check"></i>
                                    <span>{contactsSuccess}</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsContactsModalOpen(false)} disabled={isSavingContacts}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={isSavingContacts}>
                                    <i className="fa-solid fa-floppy-disk"></i> {isSavingContacts ? 'Guardando...' : 'Guardar Contactos'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Creación de Ticket (Independiente) */}
            <CreateTicketModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                currentUser={currentUser}
                onTicketCreated={loadTickets}
                pharmaciesList={profiles.map(p => p.username)}
            />
        </div>
    );
}

// ==========================================
// FUNCIONES AUXILIARES Y RENDERIZADORES
// ==========================================

function getRequestTypeIcon(type) {
    if (!type) return 'fa-solid fa-circle-info';
    const t = type.toLowerCase();
    if (t.includes('artes') || t.includes('digital')) return 'fa-solid fa-laptop-code';
    if (t.includes('rotulación interna') || t.includes('interna')) return 'fa-solid fa-sheet-plastic';
    if (t.includes('impresión') || t.includes('impresion')) return 'fa-solid fa-print';
    if (t.includes('recetario')) return 'fa-solid fa-file-medical';
    if (t.includes('insumo') || t.includes('jornada') || t.includes('utilería') || t.includes('activacion')) return 'fa-solid fa-kit-medical';
    if (t.includes('rotulación externa') || t.includes('externa')) return 'fa-solid fa-store';
    return 'fa-solid fa-file-lines';
}

function getFileIcon(filename) {
    if (!filename) return 'fa-regular fa-file';
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'fa-regular fa-file-image';
    if (['pdf'].includes(ext)) return 'fa-regular fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-regular fa-file-word';
    if (['xls', 'xlsx'].includes(ext)) return 'fa-regular fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fa-regular fa-file-powerpoint';
    if (['zip', 'rar', 'tar', 'gz'].includes(ext)) return 'fa-regular fa-file-zipper';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'fa-regular fa-file-audio';
    if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) return 'fa-regular fa-file-video';
    return 'fa-regular fa-file';
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function renderStructuredDetails(ticket) {
    if (!ticket.request_type) return null;

    const formData = ticket.form_data || {};
    
    const getReadableLabel = (key) => {
        const labels = {
            tipoMaterial: 'Tipo de Material Digital',
            medidas: 'Medidas',
            medidasEspecificas: 'Medidas Específicas',
            informacionMaterial: 'Información del Material',
            incluirTelefono: 'Contacto a Incluir',
            tipoRotulacion: 'Tipo de Rotulación',
            detalleTexto: 'Detalle / Texto',
            tipoMaterialImpreso: 'Tipo de Material Impreso',
            tamanoRequerido: 'Tamaño Requerido',
            cantidadRequerida: 'Cantidad a imprimir',
            indicacionesDiseno: 'Indicaciones de Diseño',
            orientacion: 'Orientación',
            ladosImpresion: 'Lados de Impresión',
            textoMaterial: 'Texto del Material',
            aprobadorArte: 'Aprobador del Arte',
            nombreMedico: 'Nombre del Médico',
            especialidadMedica: 'Especialidad Médica',
            nombreClinica: 'Nombre de la Clínica/Hospital/Consultorio',
            direccionRecetario: 'Dirección del Recetario',
            telefonoConsultorio: 'Contacto del Consultorio',
            horarioAtencion: 'Horario de Atención',
            cantidadRecetarios: 'Cantidad de Recetarios',
            tipoDiseno: 'Tipo de Diseño',
            incluyeLogo: '¿Debe Incluir Logo?',
            otraInformacion: 'Información Adicional',
            tipoActividad: 'Tipo de Actividad',
            nombreActividad: 'Nombre de la Actividad',
            fechaActividad: 'Fecha de la Actividad',
            horarioActividad: 'Horario de la Actividad',
            lugarActividad: 'Lugar de la Actividad',
            responsableSitio: 'Responsable en Sitio',
            objetivoActividad: 'Objetivo de la Actividad',
            insumosSolicitados: 'Insumos / Utilería Solicitada',
            insumosOtros: 'Otros Insumos Especificados',
            detalleInsumos: 'Detalle de Insumos',
            requiereMontaje: '¿Requiere Montaje/Instalación?',
            requierePromotora: '¿Requiere Promotora?',
            restriccionesPermisos: 'Restricciones / Permisos',
            ubicacionInstalacion: 'Ubicación de Instalación',
            tipoReparacion: 'Reparación / Tipo de Rótulo',
            medidasRotulo: 'Medidas de Espacio o Rótulo',
            fechaInstalacion: 'Fecha Requerida de Instalación',
            restriccionesPermisosExterna: 'Restricciones o Permisos',
        };
        return labels[key] || key;
    };

    const formDataEntries = Object.entries(formData).filter(([key]) => key !== '_type');

    return (
        <div className="structured-details-section">
            <div className="structured-details-title">
                <i className={getRequestTypeIcon(ticket.request_type)}></i>
                <span>Detalles de Solicitud ({ticket.request_type})</span>
            </div>
            
            <div className="structured-details-grid">
                <div className="structured-detail-item">
                    <span className="structured-detail-label">Rol del Solicitante</span>
                    <span className="structured-detail-value">{ticket.requester_role || 'No especificado'}</span>
                </div>

                <div className="structured-detail-item">
                    <span className="structured-detail-label">Fecha de Solicitud</span>
                    <span className="structured-detail-value">
                        <i className="fa-regular fa-clock" style={{ marginRight: '5px', opacity: 0.6 }}></i>
                        {new Date(ticket.created_at).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                
                <div className="structured-detail-item">
                    <span className="structured-detail-label">Prioridad</span>
                    <span className={`structured-detail-value priority-val-${(ticket.priority || 'Normal').toLowerCase()}`}>
                        {ticket.priority || 'Normal'}
                    </span>
                </div>
                
                <div className="structured-detail-item full-width">
                    <span className="structured-detail-label">Objetivo</span>
                    <span className="structured-detail-value">{ticket.objective || ticket.description}</span>
                </div>
                
                {ticket.additional_info && (
                    <div className="structured-detail-item full-width">
                        <span className="structured-detail-label">Información Adicional</span>
                        <span className="structured-detail-value">{ticket.additional_info}</span>
                    </div>
                )}
                
                {formDataEntries.map(([key, val]) => {
                    if (val === undefined || val === null || val === '') return null;
                    
                    const label = getReadableLabel(key);
                    
                    if (Array.isArray(val)) {
                        return (
                            <div key={key} className="structured-detail-item full-width">
                                <span className="structured-detail-label">{label}</span>
                                <div className="supplies-checked-list">
                                    {val.map((item, idx) => (
                                        <span key={idx} className="supply-checked-badge">
                                            <i className="fa-solid fa-check"></i>
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    }
                    
                    const isFullWidth = ['informacionMaterial', 'detalleTexto', 'indicacionesDiseno', 'informacionContacto', 'objetivoUso', 'estadoFachada', 'textoMaterial'].includes(key);
                    
                    return (
                        <div key={key} className={`structured-detail-item ${isFullWidth ? 'full-width' : ''}`}>
                            <span className="structured-detail-label">{label}</span>
                            <span className="structured-detail-value" style={{ whiteSpace: 'pre-wrap' }}>{val}</span>
                        </div>
                    );
                })}

                {ticket.attachments && ticket.attachments.length > 0 && (
                    <div className="structured-detail-item full-width" style={{ marginTop: '10px' }}>
                        <span className="structured-detail-label">
                            <i className="fa-solid fa-paperclip" style={{ marginRight: '4px' }}></i>
                            Archivos Adjuntos ({ticket.attachments.length})
                        </span>
                        <div className="wizard-file-list" style={{ marginTop: '8px' }}>
                            {ticket.attachments.map((file, idx) => (
                                <a 
                                    key={idx} 
                                    href={file.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="wizard-file-item"
                                    style={{ textDecoration: 'none', cursor: 'pointer' }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="wizard-file-info">
                                        <i className={getFileIcon(file.name)}></i>
                                        <div className="wizard-file-meta">
                                            <span className="wizard-file-name" style={{ color: 'var(--border-focus)' }}>
                                                {file.name}
                                            </span>
                                            {file.size && (
                                                <span className="wizard-file-size">
                                                    {formatBytes(file.size)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="btn-remove-file" style={{ color: 'var(--border-focus)' }}>
                                        <i className="fa-solid fa-arrow-down-long"></i>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function getStartCountingDate(createdAtString) {
    if (!createdAtString) return new Date();
    const createdDate = new Date(createdAtString);
    createdDate.setHours(0, 0, 0, 0);
    const dayOfWeek = createdDate.getDay();
    const daysToAdd = (4 - dayOfWeek + 7) % 7;
    const startDate = new Date(createdDate);
    startDate.setDate(createdDate.getDate() + daysToAdd);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
}

function getElapsedDays(ticket) {
    if (!ticket || !ticket.created_at) return { days: 0, hasStarted: false, startDate: new Date() };
    const startDate = getStartCountingDate(ticket.created_at);
    
    // Usar finalized_at si el ticket está finalizado, de lo contrario hoy
    const endDate = ticket.finalized_at ? new Date(ticket.finalized_at) : new Date();
    endDate.setHours(0, 0, 0, 0);
    
    if (endDate < startDate) {
        return {
            days: 0,
            hasStarted: false,
            startDate: startDate
        };
    }
    
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return {
        days: diffDays,
        hasStarted: true,
        startDate: startDate
    };
}


