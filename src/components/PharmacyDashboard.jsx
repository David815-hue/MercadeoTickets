import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';
import { toast } from 'sonner';
import FormSelect from './FormSelect';

const CATEGORY_DURATIONS = {
    'Artes Digital': '5 días',
    'Rotulación Interna': '3 días (Cubrecajas 10 días)',
    'Material para impresión': '10 días',
    'Recetarios Médicos': '20 días',
    'Insumos / utilería para activaciones o jornadas médicas': '3 días'
};



export default function PharmacyDashboard({ currentUser, onLogout, currentTheme, onToggleTheme }) {
    const [tickets, setTickets] = useState([]);
    const [activeTicket, setActiveTicket] = useState(null);
    const [expandedTicketId, setExpandedTicketId] = useState(null);
    const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());
    
    // Estados del Wizard de Creación
    const [wizardStep, setWizardStep] = useState(1);
    const [requesterRole, setRequesterRole] = useState('Jefe de Tienda');
    const [ticketPriority, setTicketPriority] = useState('Normal');
    const [ticketObjective, setTicketObjective] = useState('');
    const [ticketAdditionalInfo, setTicketAdditionalInfo] = useState('');
    const [requestType, setRequestType] = useState('');
    const [stepSpecificData, setStepSpecificData] = useState({});
    const [validationErrors, setValidationErrors] = useState({});
    
    // Adjuntos del Paso 2
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [fileUploadProgresses, setFileUploadProgresses] = useState({});
    const fileInputRef = useRef(null);
    
    // Estados de modales
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Gestión de perfil
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const userMenuRef = useRef(null);

    useEffect(() => {
        loadTickets();
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

    const handleRequestTypeChange = (newType) => {
        setRequestType(newType);
        setSelectedFiles([]);
        setStepSpecificData({});
        if (validationErrors.requestType) {
            setValidationErrors(prev => ({ ...prev, requestType: false }));
        }
    };

    const initStepSpecificData = () => {
        if (Object.keys(stepSpecificData).length > 0 && stepSpecificData._type === requestType) {
            return;
        }
        
        let defaultData = { _type: requestType };
        if (requestType === 'Artes Digital') {
            defaultData.tipoMaterial = 'Post para redes sociales';
            defaultData.medidas = 'Estándar';
            defaultData.medidasEspecificas = '';
            defaultData.informacionMaterial = '';
            defaultData.incluirTelefono = '';
        } else if (requestType === 'Rotulación Interna') {
            defaultData.tipoRotulacion = 'Rótulo Prefabricado';
            defaultData.medidas = '';
            defaultData.detalleTexto = '';
        } else if (requestType === 'Material para impresión') {
            defaultData.tipoMaterialImpreso = 'Volante';
            defaultData.tamanoRequerido = '';
            defaultData.orientacion = 'Vertical';
            defaultData.cantidadRequerida = '';
            defaultData.ladosImpresion = 'Una cara';
            defaultData.textoMaterial = '';
            defaultData.aprobadorArte = '';
        } else if (requestType === 'Recetarios Médicos') {
            defaultData.tipoRecetario = 'Recetario Normal';
            defaultData.nombreMedico = '';
            defaultData.codigoColegiado = '';
            defaultData.ubicacionClinica = '';
            defaultData.informacionContacto = '';
        } else if (requestType === 'Insumos / utilería para activaciones o jornadas médicas') {
            defaultData.insumos = [];
            defaultData.insumosOtros = '';
            defaultData.fechaEvento = '';
            defaultData.ubicacionEvento = '';
            defaultData.objetivoUso = '';
        } else if (requestType === 'Rotulación Externa') {
            defaultData.tipoRotulacionExterna = 'Fachada principal';
            defaultData.medidas = '';
            defaultData.indicacionesDiseno = '';
            defaultData.estadoFachada = '';
        }
        setStepSpecificData(defaultData);
    };

    const handleInsumoCheckboxChange = (insumoName) => {
        setStepSpecificData(prev => {
            const currentInsumos = prev.insumos || [];
            let updatedInsumos;
            if (currentInsumos.includes(insumoName)) {
                updatedInsumos = currentInsumos.filter(item => item !== insumoName);
            } else {
                updatedInsumos = [...currentInsumos, insumoName];
            }
            return { ...prev, insumos: updatedInsumos };
        });
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        addFiles(files);
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        addFiles(files);
    };

    const addFiles = (files) => {
        const maxFiles = requestType === 'Recetarios Médicos' ? 1 : 3;
        const maxSizeMB = 5;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        
        let newFiles = [...selectedFiles];
        let errors = [];

        files.forEach(file => {
            if (file.size > maxSizeBytes) {
                errors.push(`El archivo "${file.name}" supera el límite de ${maxSizeMB}MB.`);
                return;
            }
            
            const allowedExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'ogg'];
            const ext = file.name.split('.').pop().toLowerCase();
            if (!allowedExtensions.includes(ext)) {
                errors.push(`El tipo de archivo de "${file.name}" no está permitido.`);
                return;
            }

            if (newFiles.some(f => f.name === file.name && f.size === file.size)) {
                return;
            }

            newFiles.push(file);
        });

        if (newFiles.length > maxFiles) {
            errors.push(`Límite superado: Solo se permiten hasta ${maxFiles} archivo(s) para esta solicitud.`);
            newFiles = newFiles.slice(0, maxFiles);
        }

        if (errors.length > 0) {
            errors.forEach(err => toast.error(err));
        }

        setSelectedFiles(newFiles);
    };

    const removeFile = (index) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const updateStepSpecificField = (field, value) => {
        setStepSpecificData(prev => ({ ...prev, [field]: value }));
        if (validationErrors[field]) {
            setValidationErrors(prev => ({ ...prev, [field]: false }));
        }
        if (field === 'medidas' && value === 'Estándar') {
            setValidationErrors(prev => ({ ...prev, medidasEspecificas: false }));
        }
        if (field === 'insumosOtros') {
            setValidationErrors(prev => ({ ...prev, insumos: false }));
        }
    };

    const getStep2Errors = () => {
        const errors = {};
        if (requestType === 'Artes Digital') {
            if (!(stepSpecificData.tipoMaterial || '').trim()) errors.tipoMaterial = true;
            if (!(stepSpecificData.medidas || '').trim()) errors.medidas = true;
            if (stepSpecificData.medidas === 'Otras' && !(stepSpecificData.medidasEspecificas || '').trim()) {
                errors.medidasEspecificas = true;
            }
            if (!(stepSpecificData.informacionMaterial || '').trim()) errors.informacionMaterial = true;
        } else if (requestType === 'Rotulación Interna') {
            if (!(stepSpecificData.tipoRotulacion || '').trim()) errors.tipoRotulacion = true;
            if (!(stepSpecificData.medidas || '').trim()) errors.medidas = true;
            if (!(stepSpecificData.detalleTexto || '').trim()) errors.detalleTexto = true;
        } else if (requestType === 'Material para impresión') {
            if (!(stepSpecificData.tipoMaterialImpreso || '').trim()) errors.tipoMaterialImpreso = true;
            if (!(stepSpecificData.tamanoRequerido || '').trim()) errors.tamanoRequerido = true;
            if (!(stepSpecificData.orientacion || '').trim()) errors.orientacion = true;
            if (!(stepSpecificData.cantidadRequerida || '').trim()) errors.cantidadRequerida = true;
            if (!(stepSpecificData.ladosImpresion || '').trim()) errors.ladosImpresion = true;
            if (!(stepSpecificData.textoMaterial || '').trim()) errors.textoMaterial = true;
            if (!(stepSpecificData.aprobadorArte || '').trim()) errors.aprobadorArte = true;
        } else if (requestType === 'Recetarios Médicos') {
            if (!(stepSpecificData.tipoRecetario || '').trim()) errors.tipoRecetario = true;
            if (!(stepSpecificData.nombreMedico || '').trim()) errors.nombreMedico = true;
            if (!(stepSpecificData.codigoColegiado || '').trim()) errors.codigoColegiado = true;
            if (!(stepSpecificData.ubicacionClinica || '').trim()) errors.ubicacionClinica = true;
            if (!(stepSpecificData.informacionContacto || '').trim()) errors.informacionContacto = true;
        } else if (requestType === 'Insumos / utilería para activaciones o jornadas médicas') {
            const hasInsumo = (stepSpecificData.insumos || []).length > 0 || (stepSpecificData.insumosOtros || '').trim() !== '';
            if (!hasInsumo) errors.insumos = true;
            if (!(stepSpecificData.fechaEvento || '').trim()) errors.fechaEvento = true;
            if (!(stepSpecificData.ubicacionEvento || '').trim()) errors.ubicacionEvento = true;
            if (!(stepSpecificData.objetivoUso || '').trim()) errors.objetivoUso = true;
        } else if (requestType === 'Rotulación Externa') {
            if (!(stepSpecificData.tipoRotulacionExterna || '').trim()) errors.tipoRotulacionExterna = true;
            if (!(stepSpecificData.medidas || '').trim()) errors.medidas = true;
            if (!(stepSpecificData.indicacionesDiseno || '').trim()) errors.indicacionesDiseno = true;
            if (!(stepSpecificData.estadoFachada || '').trim()) errors.estadoFachada = true;
        }
        return errors;
    };

    const handleNextStep = () => {
        const errors = {};
        if (!ticketObjective.trim()) {
            errors.objective = true;
        }
        if (!requestType) {
            errors.requestType = true;
        }

        if (Object.keys(errors).length > 0) {
            setValidationErrors(prev => ({ ...prev, ...errors }));
            toast.error('Por favor complete todos los campos obligatorios en el formulario.');
            return;
        }

        setValidationErrors(prev => {
            const copy = { ...prev };
            delete copy.objective;
            delete copy.requestType;
            return copy;
        });

        initStepSpecificData();
        setWizardStep(2);
    };

    const openCreateModal = () => {
        setWizardStep(1);
        setRequesterRole('Jefe de Tienda');
        setTicketPriority('Normal');
        setTicketObjective('');
        setTicketAdditionalInfo('');
        setRequestType('');
        setStepSpecificData({});
        setSelectedFiles([]);
        setFileUploadProgresses({});
        setValidationErrors({});
        setIsCreateModalOpen(true);
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        
        const errors = getStep2Errors();
        if (Object.keys(errors).length > 0) {
            setValidationErrors(prev => ({ ...prev, ...errors }));
            toast.error('Por favor complete todos los campos obligatorios en el formulario.');
            return;
        }

        setIsSubmitting(true);

        try {
            const { data: ticket, error: ticketError } = await supabase
                .from('tickets')
                .insert({
                    user_id: currentUser.id,
                    pharmacy_name: currentUser.username,
                    description: ticketObjective.trim(),
                    requester_role: requesterRole,
                    priority: ticketPriority,
                    request_type: requestType,
                    objective: ticketObjective.trim(),
                    additional_info: ticketAdditionalInfo.trim(),
                    form_data: stepSpecificData,
                    attachments: []
                })
                .select()
                .single();

            if (ticketError) throw ticketError;

            let uploadedAttachments = [];
            if (selectedFiles.length > 0) {
                for (const file of selectedFiles) {
                    setFileUploadProgresses(prev => ({ ...prev, [file.name]: 10 }));
                    
                    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                    const filePath = `tickets/${ticket.id}/${Date.now()}_${cleanFileName}`;
                    
                    const progressInterval = setInterval(() => {
                        setFileUploadProgresses(prev => {
                            const current = prev[file.name] || 10;
                            if (current < 85) {
                                return { ...prev, [file.name]: current + 15 };
                            }
                            return prev;
                        });
                    }, 200);

                    try {
                        const { error: uploadError } = await supabase.storage
                            .from('ticket-attachments')
                            .upload(filePath, file);

                        clearInterval(progressInterval);

                        if (uploadError) throw uploadError;

                        const { data: urlData } = supabase.storage
                            .from('ticket-attachments')
                            .getPublicUrl(filePath);

                        setFileUploadProgresses(prev => ({ ...prev, [file.name]: 100 }));
                        uploadedAttachments.push({
                            name: file.name,
                            url: urlData.publicUrl,
                            size: file.size
                        });
                    } catch (uploadErr) {
                        clearInterval(progressInterval);
                        console.error(`Error al subir archivo ${file.name}:`, uploadErr);
                        toast.warning(`No se pudo subir el archivo "${file.name}". El ticket se creará sin este archivo.`);
                    }
                }

                if (uploadedAttachments.length > 0) {
                    const { error: updateError } = await supabase
                        .from('tickets')
                        .update({ attachments: uploadedAttachments })
                        .eq('id', ticket.id);

                    if (updateError) throw updateError;
                }
            }

            setWizardStep(1);
            setRequesterRole('Jefe de Tienda');
            setTicketPriority('Normal');
            setTicketObjective('');
            setTicketAdditionalInfo('');
            setRequestType('');
            setStepSpecificData({});
            setSelectedFiles([]);
            setFileUploadProgresses({});
            
            setIsCreateModalOpen(false);
            await loadTickets();
            toast.success('¡Solicitud de mercadeo creada con éxito!');

            if (ticket) {
                const updatedTicket = {
                    ...ticket,
                    attachments: uploadedAttachments
                };
                setActiveTicket(updatedTicket);
            }
        } catch (error) {
            console.error('Error al crear ticket:', error);
            toast.error('Hubo un error al enviar el ticket: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleAccordion = (ticketId) => {
        setExpandedTicketId(expandedTicketId === ticketId ? null : ticketId);
    };

    const handleOpenChat = async (ticket) => {
        try {
            // Verificar si el administrador ha iniciado la conversación
            const { data, error } = await supabase
                .from('messages')
                .select('id')
                .eq('ticket_id', ticket.id)
                .eq('sender_name', 'Administrador')
                .limit(1);

            if (error) throw error;

            if (!data || data.length === 0) {
                toast.warning('Para iniciar un chat con mercadeo, debe esperar que ellos inicien el chat');
                return;
            }

            setActiveTicket(ticket);
            
            // Quitar de alertas leídas
            setUnreadTicketIds(prev => {
                const updated = new Set(prev);
                updated.delete(ticket.id);
                return updated;
            });
            
            setIsChatModalOpen(true);
        } catch (err) {
            console.error('Error al abrir el chat:', err);
            toast.error('No se pudo abrir el chat de soporte en este momento.');
        }
    };

    const handleCloseChat = () => {
        setIsChatModalOpen(false);
        setActiveTicket(null);
        loadTickets(); // Recargar para ver si cambió el estado mientras chateaba
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setProfileError('');
        setProfileSuccess('');

        if (!newPassword) {
            setProfileError('La contraseña no puede estar vacía.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setProfileError('Las contraseñas no coinciden.');
            return;
        }

        setIsSavingProfile(true);

        try {
            const { error } = await supabase.rpc('update_user_password', {
                p_user_id: currentUser.id,
                p_new_password: newPassword
            });

            if (error) throw error;

            setProfileSuccess('Contraseña actualizada correctamente.');
            setNewPassword('');
            setConfirmPassword('');
            
            setTimeout(() => {
                setIsProfileModalOpen(false);
                setProfileSuccess('');
            }, 1500);

        } catch (err) {
            console.error('Error al actualizar perfil:', err);
            setProfileError(err.message || 'Error al actualizar contraseña.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    return (
        <div id="pharmacy-screen">
            {/* Header Flotante Premium */}
            <header className="app-header">
                {/* Pill Izquierdo: Avatar + Info */}
                <div className="header-user-pill">
                    <div className="user-avatar avatar-pharmacy">
                        {(currentUser.username || 'F').charAt(0).toUpperCase()}
                    </div>
                    <div className="header-user-info">
                        <span className="header-user-name">{currentUser.username}</span>
                        <span className="header-user-role">
                            <i className="fa-solid fa-hospital" style={{ marginRight: '4px', fontSize: '0.65rem', color: '#818cf8' }}></i>
                            Farmacia
                        </span>
                    </div>
                </div>

                {/* Pill Derecho: Toggle Tema + Logout */}
                <div className="header-controls-pill">
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
                                        setIsProfileModalOpen(true);
                                        setIsUserMenuOpen(false);
                                    }}
                                >
                                    <i className="fa-solid fa-user-pen"></i> Gestionar Perfil
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

            {/* Dashboard Container (Modernized) */}
            <div className="dashboard-container">
                <div className="modern-layout">
                    {/* Barra de Acciones Superior */}
                    <div className="dashboard-actions-bar">
                        <div className="dashboard-title-area">
                            <h2>Mis Solicitudes</h2>
                            <p>Consulta el estado de tus reportes y comunícate con soporte técnico.</p>
                        </div>
                        <div className="flex-row gap-8 align-center">
                            <button className="btn btn-secondary btn-icon-only" onClick={loadTickets} title="Actualizar lista">
                                <i className="fa-solid fa-rotate"></i>
                            </button>
                            <button className="btn btn-primary" onClick={openCreateModal}>
                                <i className="fa-solid fa-circle-plus"></i> Crear Ticket
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
                                        style={{ 
                                            borderLeft: hasUnread ? '3px solid var(--color-danger)' : '',
                                            zIndex: isExpanded ? 50 : 1
                                        }}
                                    >
                                        {/* Cabecera del acordeón */}
                                        <div className="accordion-header" onClick={() => toggleAccordion(ticket.id)}>
                                             <div className="accordion-header-left" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                 <span className="accordion-ticket-id">
                                                     {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}...`}
                                                 </span>
                                                 {hasUnread && <span className="badge-unread" style={{ flexShrink: 0 }}>Nuevo Mensaje</span>}
                                                 {ticket.priority && (
                                                     <span className={`priority-badge-pill priority-${ticket.priority.toLowerCase()}`} style={{ flexShrink: 0 }}>
                                                         <i className="fa-solid fa-circle-exclamation"></i>
                                                         {ticket.priority}
                                                     </span>
                                                 )}
                                                 {ticket.request_type && (
                                                     <span className="type-badge-pill" style={{ flexShrink: 0 }}>
                                                         <i className={getRequestTypeIcon(ticket.request_type)}></i>
                                                         {ticket.request_type}
                                                     </span>
                                                 )}
                                                <span 
                                                    className="accordion-ticket-desc" 
                                                    style={{ 
                                                        color: 'var(--text-secondary)', 
                                                        fontSize: '0.9rem',
                                                        fontWeight: '500'
                                                    }}
                                                >
                                                    — {ticket.description}
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
                                                {ticket.request_type ? (
                                                    renderStructuredDetails(ticket)
                                                ) : (
                                                    <div className="detail-description-box" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                                                        <h5 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descripción</h5>
                                                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
                                                    </div>
                                                )}
                                                <div className="accordion-body-row" style={{ padding: '16px 0 0 0', borderTop: '1px solid var(--border-color)', marginTop: '8px' }}>
                                                    <span className="accordion-body-date">
                                                        <i className="fa-regular fa-clock"></i> {fecha}
                                                    </span>
                                                    <button 
                                                        className={`btn ${hasUnread ? 'btn-danger' : 'btn-secondary'} btn-sm unread-badge-container`}
                                                        onClick={() => handleOpenChat(ticket)}
                                                    >
                                                        <i className="fa-regular fa-comments"></i>
                                                        <span>Chat de Soporte</span>
                                                        {hasUnread && <span className="pulsing-alert-dot"></span>}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL 1: Crear Nuevo Ticket (Wizard) */}
            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setIsCreateModalOpen(false)}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        
                        <h3 style={{ marginBottom: '20px', fontSize: '1.3rem', fontWeight: '700' }}>
                            <i className="fa-solid fa-circle-plus"></i> Crear Solicitud de Mercadeo
                        </h3>

                        {/* Stepper */}
                        <div className="wizard-stepper">
                            <div className="wizard-stepper-progress" style={{ width: wizardStep === 1 ? '0%' : 'calc(100% - 158px)' }}></div>
                            <div className={`wizard-step-indicator ${wizardStep === 1 ? 'active' : 'completed'}`}>
                                <div className="wizard-step-circle">1</div>
                                <span className="wizard-step-label">Datos Generales</span>
                            </div>
                            <div className={`wizard-step-indicator ${wizardStep === 2 ? 'active' : ''}`}>
                                <div className="wizard-step-circle">2</div>
                                <span className="wizard-step-label">Especificaciones</span>
                            </div>
                        </div>

                        <form onSubmit={handleCreateTicket}>
                            {wizardStep === 1 ? (
                                <>
                                    <div className="input-group">
                                        <label>Su Rol</label>
                                        <div className="wizard-selection-grid">
                                            <div 
                                                className={`selection-card ${requesterRole === 'Supervisor' ? 'active' : ''}`}
                                                onClick={() => setRequesterRole('Supervisor')}
                                            >
                                                <i className="fa-solid fa-user-tie"></i>
                                                <span>Supervisor</span>
                                            </div>
                                            <div 
                                                className={`selection-card ${requesterRole === 'Jefe de Tienda' ? 'active' : ''}`}
                                                onClick={() => setRequesterRole('Jefe de Tienda')}
                                            >
                                                <i className="fa-solid fa-user-shield"></i>
                                                <span>Jefe de Tienda</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label>Nivel de Prioridad</label>
                                        <div className="priority-selector-row">
                                            <button
                                                type="button"
                                                className={`priority-option-btn priority-normal ${ticketPriority === 'Normal' ? 'active' : ''}`}
                                                onClick={() => setTicketPriority('Normal')}
                                            >
                                                <i className="fa-solid fa-circle-check"></i> Normal
                                            </button>
                                            <button
                                                type="button"
                                                className={`priority-option-btn priority-alta ${ticketPriority === 'Alta' ? 'active' : ''}`}
                                                onClick={() => setTicketPriority('Alta')}
                                            >
                                                <i className="fa-solid fa-circle-exclamation"></i> Alta
                                            </button>
                                            <button
                                                type="button"
                                                className={`priority-option-btn priority-urgente ${ticketPriority === 'Urgente' ? 'active' : ''}`}
                                                onClick={() => setTicketPriority('Urgente')}
                                            >
                                                <i className="fa-solid fa-triangle-exclamation"></i> Urgente
                                            </button>
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label htmlFor="wizard-objective">
                                            Breve objetivo de la solicitud
                                            <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                        </label>
                                        <textarea
                                            id="wizard-objective"
                                            className={validationErrors.objective ? 'input-invalid' : ''}
                                            placeholder="Explique brevemente el objetivo de la solicitud..."
                                            value={ticketObjective}
                                            onChange={(e) => {
                                                setTicketObjective(e.target.value);
                                                if (validationErrors.objective && e.target.value.trim()) {
                                                    setValidationErrors(prev => ({ ...prev, objective: false }));
                                                }
                                            }}
                                            rows="3"
                                        ></textarea>
                                    </div>

                                    <div className="input-group">
                                        <label htmlFor="wizard-additional">Información adicional importante (Opcional)</label>
                                        <textarea
                                            id="wizard-additional"
                                            placeholder="Indique cualquier información adicional importante para la solicitud..."
                                            value={ticketAdditionalInfo}
                                            onChange={(e) => setTicketAdditionalInfo(e.target.value)}
                                            rows="2"
                                        ></textarea>
                                    </div>

                                    <div className="input-group">
                                        <label>
                                            Tipo de Solicitud
                                            <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                        </label>

                                            {requestType && CATEGORY_DURATIONS[requestType] && (
                                                <div className="selected-duration-info-banner">
                                                    <i className="fa-regular fa-clock"></i>
                                                    <span>Esta solicitud se tardará aproximadamente: <strong>{CATEGORY_DURATIONS[requestType]}</strong></span>
                                                </div>
                                            )}
                                        <div className={`wizard-category-grid ${validationErrors.requestType ? 'input-invalid' : ''}`}>
                                            {[
                                                { id: 'Artes Digital', label: 'Artes Digitales', icon: 'fa-solid fa-laptop-code' },
                                                { id: 'Rotulación Interna', label: 'Rotulación Interna', icon: 'fa-solid fa-sheet-plastic' },
                                                { id: 'Material para impresión', label: 'Material de Impresión', icon: 'fa-solid fa-print' },
                                                { id: 'Recetarios Médicos', label: 'Recetarios Médicos', icon: 'fa-solid fa-file-medical' },
                                                { id: 'Insumos / utilería para activaciones o jornadas médicas', label: 'Insumos / Utilería', icon: 'fa-solid fa-kit-medical' },
                                                { id: 'Rotulación Externa', label: 'Rotulación Externa', icon: 'fa-solid fa-store' }
                                            ].map(cat => (
                                                <div
                                                    key={cat.id}
                                                    className={`selection-card ${requestType === cat.id ? 'active' : ''}`}
                                                    onClick={() => handleRequestTypeChange(cat.id)}
                                                >
                                                    <i className={cat.icon}></i>
                                                    <span style={{ fontSize: '0.78rem' }}>{cat.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex-row justify-end" style={{ marginTop: '20px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={handleNextStep}
                                        >
                                            Siguiente <i className="fa-solid fa-arrow-right" style={{ marginLeft: '6px' }}></i>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* PASO 2: Preguntas Dinámicas */}
                                    {requestType === 'Artes Digital' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="tipo-material">
                                                    Tipo de material digital solicitado
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-material" 
                                                    className={validationErrors.tipoMaterial ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoMaterial || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoMaterial', e.target.value)}
                                                    options={['Post para redes sociales', 'Historia para redes sociales', 'Reel / video corto', 'Banner web', 'HTML', 'Volante']}
                                                    placeholder="Seleccione tipo de material..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="medidas-artes">
                                                    Medidas requeridas
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="medidas-artes" 
                                                    className={validationErrors.medidas ? 'input-invalid' : ''}
                                                    value={stepSpecificData.medidas || ''} 
                                                    onChange={(e) => updateStepSpecificField('medidas', e.target.value)}
                                                    options={['Estándar', 'Otras']}
                                                    placeholder="Seleccione tipo de medida..."
                                                />
                                            </div>

                                            {stepSpecificData.medidas === 'Otras' && (
                                                <div className="input-group animate-fade-in">
                                                    <label htmlFor="medidas-especificas">
                                                        Especifique las medidas
                                                        <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        id="medidas-especificas" 
                                                        className={validationErrors.medidasEspecificas ? 'input-invalid' : ''}
                                                        placeholder="Ejemplo: 1200 x 628 px, o 15 x 20 cm..."
                                                        value={stepSpecificData.medidasEspecificas || ''} 
                                                        onChange={(e) => updateStepSpecificField('medidasEspecificas', e.target.value)}
                                                    />
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label htmlFor="informacion-material">
                                                    Información que debe llevar el material
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="informacion-material" 
                                                    className={validationErrors.informacionMaterial ? 'input-invalid' : ''}
                                                    placeholder="Escriba los textos, títulos y detalles que debe llevar el arte..."
                                                    value={stepSpecificData.informacionMaterial || ''} 
                                                    onChange={(e) => updateStepSpecificField('informacionMaterial', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="incluir-telefono">Teléfono, enlace o código QR a incluir (Opcional)</label>
                                                <input 
                                                    type="text" 
                                                    id="incluir-telefono" 
                                                    placeholder="Especifique el número, link o código QR a incluir..."
                                                    value={stepSpecificData.incluirTelefono || ''} 
                                                    onChange={(e) => updateStepSpecificField('incluirTelefono', e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Rotulación Interna' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="tipo-rotulacion">
                                                    Tipo de rotulación solicitada
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-rotulacion" 
                                                    className={validationErrors.tipoRotulacion ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoRotulacion || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoRotulacion', e.target.value)}
                                                    options={['Rótulo Prefabricado', 'Cubre Caja', 'Puerta Mesón', 'Sticker', 'Otras']}
                                                    placeholder="Seleccione tipo de rotulación..."
                                                />
                                            </div>

                                            {['Cubre Caja', 'Puerta Mesón', 'Sticker'].includes(stepSpecificData.tipoRotulacion) && (
                                                <div className="input-group">
                                                    <label htmlFor="medidas-rotulacion">
                                                        Medidas requeridas (Ancho x Alto en cm)
                                                        <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        id="medidas-rotulacion" 
                                                        className={validationErrors.medidas ? 'input-invalid' : ''}
                                                        placeholder="Ejemplo: 120 x 80 cm"
                                                        value={stepSpecificData.medidas || ''} 
                                                        onChange={(e) => updateStepSpecificField('medidas', e.target.value)}
                                                    />
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label htmlFor="detalle-texto-rotulacion">
                                                    Detalle o texto que debe llevar la rotulación
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="detalle-texto-rotulacion" 
                                                    className={validationErrors.detalleTexto ? 'input-invalid' : ''}
                                                    placeholder="Escriba los textos e indicaciones de diseño..."
                                                    value={stepSpecificData.detalleTexto || ''} 
                                                    onChange={(e) => updateStepSpecificField('detalleTexto', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Material para impresión' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="tipo-material-impreso">
                                                    Tipo de material impreso solicitado
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-material-impreso" 
                                                    className={validationErrors.tipoMaterialImpreso ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoMaterialImpreso || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoMaterialImpreso', e.target.value)}
                                                    options={['Volante', 'Afiche', 'Brochure', 'Trifolio', 'Tarjeta de Presentación', 'Invitación', 'Sticker', 'Otras']}
                                                    placeholder="Seleccione tipo de material..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="tamano-impreso">
                                                    Tamaño requerido
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="tamano-impreso" 
                                                    className={validationErrors.tamanoRequerido ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: carta, media carta, A4, 30 x 40 cm, 60 x 90 cm."
                                                    value={stepSpecificData.tamanoRequerido || ''} 
                                                    onChange={(e) => updateStepSpecificField('tamanoRequerido', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="orientacion-impreso">
                                                    Orientación
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="orientacion-impreso" 
                                                    className={validationErrors.orientacion ? 'input-invalid' : ''}
                                                    value={stepSpecificData.orientacion || ''} 
                                                    onChange={(e) => updateStepSpecificField('orientacion', e.target.value)}
                                                    options={['Vertical', 'Horizontal', 'Cuadrado', 'No aplica']}
                                                    placeholder="Seleccione orientación..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="cantidad-impreso">
                                                    Cantidad a imprimir
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="cantidad-impreso" 
                                                    className={validationErrors.cantidadRequerida ? 'input-invalid' : ''}
                                                    placeholder="Escriba su respuesta"
                                                    value={stepSpecificData.cantidadRequerida || ''} 
                                                    onChange={(e) => updateStepSpecificField('cantidadRequerida', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="lados-impresion">
                                                    ¿Será impresión a una cara o doble cara?
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="lados-impresion" 
                                                    className={validationErrors.ladosImpresion ? 'input-invalid' : ''}
                                                    value={stepSpecificData.ladosImpresion || ''} 
                                                    onChange={(e) => updateStepSpecificField('ladosImpresion', e.target.value)}
                                                    options={['Una cara', 'Doble cara', 'No estoy seguro']}
                                                    placeholder="Seleccione lados..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="texto-material">
                                                    Texto exacto que debe llevar el material
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="texto-material" 
                                                    className={validationErrors.textoMaterial ? 'input-invalid' : ''}
                                                    placeholder="Escriba su respuesta"
                                                    value={stepSpecificData.textoMaterial || ''} 
                                                    onChange={(e) => updateStepSpecificField('textoMaterial', e.target.value)}
                                                    rows="4"
                                                ></textarea>
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="aprobador-arte">
                                                    ¿Quién debe aprobar el arte final antes de imprimir?
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="aprobador-arte" 
                                                    className={validationErrors.aprobadorArte ? 'input-invalid' : ''}
                                                    placeholder="Escriba su respuesta"
                                                    value={stepSpecificData.aprobadorArte || ''} 
                                                    onChange={(e) => updateStepSpecificField('aprobadorArte', e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Recetarios Médicos' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="tipo-recetario">
                                                    Tipo de Recetario solicitado
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-recetario" 
                                                    className={validationErrors.tipoRecetario ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoRecetario || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoRecetario', e.target.value)}
                                                    options={['Recetario Normal', 'Recetario Controlado / Especial']}
                                                    placeholder="Seleccione tipo de recetario..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="nombre-medico">
                                                    Nombre completo y Especialidad del Médico
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="nombre-medico" 
                                                    className={validationErrors.nombreMedico ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: Dr. Juan Pérez - Pediatra"
                                                    value={stepSpecificData.nombreMedico || ''} 
                                                    onChange={(e) => updateStepSpecificField('nombreMedico', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="codigo-colega">
                                                    Código de Colegiado o Registro Médico
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="codigo-colega" 
                                                    className={validationErrors.codigoColegiado ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: Col. 12345"
                                                    value={stepSpecificData.codigoColegiado || ''} 
                                                    onChange={(e) => updateStepSpecificField('codigoColegiado', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="ubicacion-clinica">
                                                    Ubicación / Clínica del Médico
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="ubicacion-clinica" 
                                                    className={validationErrors.ubicacionClinica ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: Clínica Médica San José, 3er nivel..."
                                                    value={stepSpecificData.ubicacionClinica || ''} 
                                                    onChange={(e) => updateStepSpecificField('ubicacionClinica', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="contacto-recetario">
                                                    Información de contacto a colocar (teléfonos, correo, etc.)
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="contacto-recetario" 
                                                    className={validationErrors.informacionContacto ? 'input-invalid' : ''}
                                                    placeholder="Escriba los teléfonos, horarios de atención, etc."
                                                    value={stepSpecificData.informacionContacto || ''} 
                                                    onChange={(e) => updateStepSpecificField('informacionContacto', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Insumos / utilería para activaciones o jornadas médicas' && (
                                        <>
                                            <div className="input-group">
                                                <label>
                                                    Insumos solicitados (Marque al menos uno o especifique otro)
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <div 
                                                    className={validationErrors.insumos ? 'input-invalid' : ''}
                                                    style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '6px', padding: '10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                                                >
                                                    {['Toldos / Carpas', 'Mesas plegables', 'Sillas plegables', 'Roll-ups / Banners', 'Hieleras / Termos', 'Parlante / Sonido', 'Manteles promocionales'].map(item => {
                                                        const isChecked = (stepSpecificData.insumos || []).includes(item);
                                                        return (
                                                            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: '500' }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={isChecked}
                                                                    onChange={() => handleInsumoCheckboxChange(item)}
                                                                    style={{ accentColor: 'var(--border-focus)', width: '16px', height: '16px' }}
                                                                />
                                                                {item}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ marginTop: '10px' }}>
                                                    <label htmlFor="insumos-otros" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Otros insumos (Especifique)</label>
                                                    <input 
                                                        type="text" 
                                                        id="insumos-otros"
                                                        className={validationErrors.insumos ? 'input-invalid' : ''}
                                                        placeholder="Ejemplo: Trifolios promocionales extra..."
                                                        value={stepSpecificData.insumosOtros || ''}
                                                        onChange={(e) => updateStepSpecificField('insumosOtros', e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="fecha-evento">
                                                    Fecha del evento / jornada
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="date" 
                                                    id="fecha-evento" 
                                                    className={validationErrors.fechaEvento ? 'input-invalid' : ''}
                                                    value={stepSpecificData.fechaEvento || ''} 
                                                    onChange={(e) => updateStepSpecificField('fechaEvento', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="ubicacion-evento">
                                                    Ubicación o dirección exacta de la actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="ubicacion-evento" 
                                                    className={validationErrors.ubicacionEvento ? 'input-invalid' : ''}
                                                    placeholder="Especifique dirección, farmacia anfitriona o parqueo..."
                                                    value={stepSpecificData.ubicacionEvento || ''} 
                                                    onChange={(e) => updateStepSpecificField('ubicacionEvento', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="objetivo-insumos">
                                                    Objetivo y descripción del uso de los insumos
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="objetivo-insumos" 
                                                    className={validationErrors.objetivoUso ? 'input-invalid' : ''}
                                                    placeholder="Detalle el tipo de actividad y cómo se usarán los materiales..."
                                                    value={stepSpecificData.objetivoUso || ''} 
                                                    onChange={(e) => updateStepSpecificField('objetivoUso', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Rotulación Externa' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="tipo-rotulacion-externa">
                                                    Tipo de rotulación externa
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-rotulacion-externa" 
                                                    className={validationErrors.tipoRotulacionExterna ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoRotulacionExterna || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoRotulacionExterna', e.target.value)}
                                                    options={['Fachada principal', 'Rótulo luminoso', 'Rótulo de bandera / doble cara', 'Pintura / Decoración exterior', 'Valla publicitaria', 'Otras']}
                                                    placeholder="Seleccione tipo de rotulación externa..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="medidas-externa">
                                                    Medidas aproximadas del espacio exterior (Ancho x Alto en metros)
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="medidas-externa" 
                                                    className={validationErrors.medidas ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: 4.5 x 2.2 metros"
                                                    value={stepSpecificData.medidas || ''} 
                                                    onChange={(e) => updateStepSpecificField('medidas', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="indicaciones-externa">
                                                    Indicaciones de diseño, textos y colores
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="indicaciones-externa" 
                                                    className={validationErrors.indicacionesDiseno ? 'input-invalid' : ''}
                                                    placeholder="Detalle qué textos debe incluir, logotipos a destacar y colores sugeridos..."
                                                    value={stepSpecificData.indicacionesDiseno || ''} 
                                                    onChange={(e) => updateStepSpecificField('indicacionesDiseno', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="estado-fachada">
                                                    Estado actual de la fachada (rótulo anterior, altura, etc.)
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="estado-fachada" 
                                                    className={validationErrors.estadoFachada ? 'input-invalid' : ''}
                                                    placeholder="Describa si requiere desmontar un rótulo anterior, altura a la que va instalado, etc..."
                                                    value={stepSpecificData.estadoFachada || ''} 
                                                    onChange={(e) => updateStepSpecificField('estadoFachada', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {/* Zona de Carga de Archivos */}
                                    <div className="input-group" style={{ marginTop: '20px' }}>
                                        <label>Adjuntar logos, imágenes o archivos necesarios (Opcional)</label>
                                        <div 
                                            className="wizard-file-dropzone"
                                            onDragOver={handleDragOver}
                                            onDrop={handleDrop}
                                            onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                        >
                                            <i className="fa-solid fa-cloud-arrow-up"></i>
                                            <h5>Arrastra y suelta tus archivos aquí</h5>
                                            <p>o haz clic para buscar en tu dispositivo</p>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                {requestType === 'Recetarios Médicos' 
                                                    ? 'Límite: 1 archivo, Máx 5MB' 
                                                    : 'Límite: 3 archivos, Máx 5MB por archivo'}
                                            </p>
                                        </div>
                                        <input 
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileSelect}
                                            multiple={requestType !== 'Recetarios Médicos'}
                                            style={{ display: 'none' }}
                                        />
                                        
                                        {selectedFiles.length > 0 && (
                                            <div className="wizard-file-list">
                                                {selectedFiles.map((file, idx) => (
                                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                        <div className="wizard-file-item">
                                                            <div className="wizard-file-info">
                                                                <i className={getFileIcon(file.name)}></i>
                                                                <div className="wizard-file-meta">
                                                                    <span className="wizard-file-name">{file.name}</span>
                                                                    <span className="wizard-file-size">{formatBytes(file.size)}</span>
                                                                </div>
                                                            </div>
                                                            <button 
                                                                type="button" 
                                                                className="btn-remove-file"
                                                                onClick={() => removeFile(idx)}
                                                                disabled={isSubmitting}
                                                            >
                                                                <i className="fa-solid fa-trash-can"></i>
                                                            </button>
                                                        </div>
                                                        {fileUploadProgresses[file.name] !== undefined && (
                                                            <div className="file-upload-progress-container">
                                                                <div 
                                                                    className="file-upload-progress-bar" 
                                                                    style={{ width: `${fileUploadProgresses[file.name]}%` }}
                                                                ></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Botones de navegación del paso 2 */}
                                    <div className="flex-row justify-between" style={{ marginTop: '24px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setWizardStep(1)}
                                            disabled={isSubmitting}
                                        >
                                            <i className="fa-solid fa-arrow-left" style={{ marginRight: '6px' }}></i> Atrás
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn btn-success"
                                            disabled={isSubmitting}
                                        >
                                            <i className="fa-solid fa-paper-plane"></i> {isSubmitting ? 'Enviando...' : 'Enviar Ticket'}
                                        </button>
                                    </div>
                                </>
                            )}
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
                                <label>Nombre de Usuario</label>
                                <input 
                                    type="text" 
                                    value={currentUser.username} 
                                    readOnly 
                                    className="input-readonly" 
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="profile-password">Nueva Contraseña</label>
                                <input 
                                    id="profile-password"
                                    type="password" 
                                    placeholder="Introduce tu nueva contraseña" 
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required 
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
                                    required 
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
            tipoRecetario: 'Tipo de Recetario',
            nombreMedico: 'Nombre y Especialidad del Médico',
            codigoColegiado: 'Código de Colegiado / Registro',
            ubicacionClinica: 'Ubicación / Clínica',
            informacionContacto: 'Información de Contacto',
            insumos: 'Insumos Solicitados',
            insumosOtros: 'Otros Insumos',
            fechaEvento: 'Fecha del Evento',
            ubicacionEvento: 'Ubicación de la Actividad',
            objetivoUso: 'Objetivo del Evento',
            tipoRotulacionExterna: 'Tipo de Rotulación Externa',
            estadoFachada: 'Estado de la Fachada'
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
