import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ChatPanel from './ChatPanel';
import { toast } from 'sonner';
import FormSelect from './FormSelect';
import SlaProgressBar from './SlaProgressBar';
import AuditLogModal from './AuditLogModal';
import { getPharmacyDisplayName } from '../utils/pharmacyMap';

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
    
    const getStartCountingDate = (createdAtString) => {
        if (!createdAtString) return new Date();
        const createdDate = new Date(createdAtString);
        createdDate.setHours(0, 0, 0, 0);
        const dayOfWeek = createdDate.getDay();
        const daysToAdd = (4 - dayOfWeek + 7) % 7;
        const startDate = new Date(createdDate);
        startDate.setDate(createdDate.getDate() + daysToAdd);
        startDate.setHours(0, 0, 0, 0);
        return startDate;
    };

    const getDaysElapsedInfo = (ticket) => {
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
    };

    const getSLALimitDays = (ticket) => {
        if (!ticket || !ticket.request_type) return Infinity;
        const type = ticket.request_type;
        const formData = ticket.form_data || {};

        if (type === 'Artes Digital') {
            return 5;
        }

        if (type === 'Rotulación Interna' || type === 'Rotulación interna') {
            const tipoRotulacion = formData.tipoRotulacion || '';
            return tipoRotulacion === 'Cubre Caja' ? 10 : 3;
        }

        if (type === 'Material para impresión' || type === 'Material para impresion') {
            return 10;
        }

        if (type === 'Recetarios Médicos' || type === 'Recetarios medicos') {
            return 20;
        }

        if (
            type.includes('Insumos / utilería') ||
            type.includes('Insumos / utileria') ||
            type.includes('utilería') ||
            type.includes('utileria') ||
            type.includes('Insumos')
        ) {
            return 3;
        }

        return Infinity;
    };



    // Estados del Wizard de Creación
    const [wizardStep, setWizardStep] = useState(1);
    const [requesterRole, setRequesterRole] = useState('Jefe de Tienda');
    const [ticketPriority, setTicketPriority] = useState('Sin prioridad');
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
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [auditLogTicket, setAuditLogTicket] = useState(null);

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
                
                // Si el mensaje no viene de la propia farmacia y no es del sistema
                if (newMsg.sender_id !== currentUser.id && newMsg.sender_name !== 'Sistema') {
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

    // Suscribirse a cambios en tiempo real en la tabla de tickets
    useEffect(() => {
        const ticketsChannel = supabase.channel('pharmacy_tickets_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets'
            }, (payload) => {
                const { eventType, new: newTicket, old: oldTicket } = payload;
                if (eventType === 'INSERT') {
                    if (newTicket.user_id !== currentUser.id) return;
                    setTickets(prev => {
                        if (prev.some(t => t.id === newTicket.id)) return prev;
                        return [newTicket, ...prev];
                    });
                } else if (eventType === 'UPDATE') {
                    if (newTicket.user_id !== currentUser.id) return;
                    setTickets(prev => prev.map(t => t.id === newTicket.id ? newTicket : t));
                    setActiveTicket(prev => prev && prev.id === newTicket.id ? newTicket : prev);
                } else if (eventType === 'DELETE') {
                    setTickets(prev => prev.filter(t => t.id !== oldTicket.id));
                    setActiveTicket(prev => prev && prev.id === oldTicket.id ? null : prev);
                }
            })
            .subscribe();

        return () => {
            ticketsChannel.unsubscribe();
        };
    }, [currentUser.id]);

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
            defaultData.nombreMedico = '';
            defaultData.especialidadMedica = '';
            defaultData.nombreClinica = '';
            defaultData.direccionRecetario = '';
            defaultData.telefonoConsultorio = '';
            defaultData.horarioAtencion = '';
            defaultData.cantidadRecetarios = '';
            defaultData.tipoDiseno = '';
            defaultData.incluyeLogo = '';
            defaultData.otraInformacion = '';
        } else if (requestType === 'Insumos / utilería para activaciones o jornadas médicas') {
            defaultData.tipoActividad = '';
            defaultData.nombreActividad = '';
            defaultData.fechaActividad = '';
            defaultData.horarioActividad = '';
            defaultData.lugarActividad = '';
            defaultData.responsableSitio = '';
            defaultData.objetivoActividad = '';
            defaultData.insumosSolicitados = [];
            defaultData.insumosOtros = '';
            defaultData.detalleInsumos = '';
            defaultData.requiereMontaje = '';
            defaultData.requierePromotora = '';
            defaultData.restriccionesPermisos = '';
        } else if (requestType === 'Rotulación Externa') {
            defaultData.ubicacionInstalacion = '';
            defaultData.tipoReparacion = '';
            defaultData.medidasRotulo = '';
            defaultData.fechaInstalacion = '';
            defaultData.restriccionesPermisosExterna = '';
        }
        setStepSpecificData(defaultData);
    };

    const handleInsumoCheckboxChange = (insumoName) => {
        setStepSpecificData(prev => {
            const currentInsumos = prev.insumosSolicitados || [];
            let updatedInsumos;
            if (currentInsumos.includes(insumoName)) {
                updatedInsumos = currentInsumos.filter(item => item !== insumoName);
            } else {
                updatedInsumos = [...currentInsumos, insumoName];
            }
            if (updatedInsumos.length > 0) {
                setValidationErrors(prevErrors => ({ ...prevErrors, insumosSolicitados: false }));
            }
            return { ...prev, insumosSolicitados: updatedInsumos };
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
        const maxSizeMB = requestType === 'Recetarios Médicos' ? 10 : 5;
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
            if (!(stepSpecificData.nombreMedico || '').trim()) errors.nombreMedico = true;
            if (!(stepSpecificData.especialidadMedica || '').trim()) errors.especialidadMedica = true;
            if (!(stepSpecificData.cantidadRecetarios || '').trim()) errors.cantidadRecetarios = true;
            if (!(stepSpecificData.tipoDiseno || '').trim()) errors.tipoDiseno = true;
            if (!(stepSpecificData.incluyeLogo || '').trim()) errors.incluyeLogo = true;
            if (stepSpecificData.incluyeLogo === 'Si' && selectedFiles.length === 0) {
                errors.logoRequired = true;
            }
        } else if (requestType === 'Insumos / utilería para activaciones o jornadas médicas') {
            if (!(stepSpecificData.tipoActividad || '').trim()) errors.tipoActividad = true;
            if (!(stepSpecificData.nombreActividad || '').trim()) errors.nombreActividad = true;
            if (!(stepSpecificData.fechaActividad || '').trim()) errors.fechaActividad = true;
            if (!(stepSpecificData.horarioActividad || '').trim()) errors.horarioActividad = true;
            if (!(stepSpecificData.lugarActividad || '').trim()) errors.lugarActividad = true;
            if (!(stepSpecificData.responsableSitio || '').trim()) errors.responsableSitio = true;
            if (!(stepSpecificData.objetivoActividad || '').trim()) errors.objetivoActividad = true;
            const hasInsumo = (stepSpecificData.insumosSolicitados || []).length > 0;
            if (!hasInsumo) errors.insumosSolicitados = true;
            
            if (!(stepSpecificData.detalleInsumos || '').trim()) errors.detalleInsumos = true;
            if (!(stepSpecificData.requiereMontaje || '').trim()) errors.requiereMontaje = true;
            if (!(stepSpecificData.requierePromotora || '').trim()) errors.requierePromotora = true;
        } else if (requestType === 'Rotulación Externa') {
            if (!(stepSpecificData.ubicacionInstalacion || '').trim()) errors.ubicacionInstalacion = true;
            if (!(stepSpecificData.fechaInstalacion || '').trim()) errors.fechaInstalacion = true;
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
        setTicketPriority('Sin prioridad');
        setTicketObjective('');
        setTicketAdditionalInfo('');
        setRequestType('');
        setStepSpecificData({});
        setSelectedFiles([]);
        setFileUploadProgresses({});
        setValidationErrors({});
        setIsCreateModalOpen(true);
    };

    const determineAssignee = (type, data) => {
        if (type === 'Artes Digital') {
            const sub = data.tipoMaterial;
            if (['Post para redes sociales', 'Historia para redes sociales', 'Reel / video corto'].includes(sub)) {
                return 'Yarleny';
            }
            if (['Banner web', 'HTML', 'Volante'].includes(sub)) {
                return 'Angelica';
            }
            return 'Yarleny';
        }
        
        if (type === 'Rotulación Interna') {
            return 'Yosselin';
        }
        
        if (type === 'Material para impresión') {
            return 'Yoselin';
        }
        
        if (type === 'Recetarios Médicos') {
            return 'Angelica';
        }
        
        if (type === 'Insumos / utilería para activaciones o jornadas médicas') {
            const act = data.tipoActividad;
            if (['Activación', 'Jornada médica', 'Feria de salud', 'Evento institucional', 'Congreso'].includes(act)) {
                return 'Yoselin';
            }
            return 'Yosselin';
        }
        
        if (type === 'Rotulación Externa') {
            return 'Emma';
        }
        
        return 'Sin asignar';
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        
        const errors = getStep2Errors();
        if (Object.keys(errors).length > 0) {
            setValidationErrors(prev => ({ ...prev, ...errors }));
            if (errors.logoRequired) {
                toast.error('Por favor, adjunte el archivo del logo si seleccionó que debe incluirlo.');
            } else {
                toast.error('Por favor complete todos los campos obligatorios en el formulario.');
            }
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
                    attachments: [],
                    assigned_to: determineAssignee(requestType, stepSpecificData)
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
            setTicketPriority('Sin prioridad');
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
                        <span className="header-user-name">{getPharmacyDisplayName(currentUser.username)}</span>
                        <span className="header-user-role">
                            <i className="fa-solid fa-hospital" style={{ marginRight: '4px', fontSize: '0.65rem', color: '#818cf8' }}></i>
                            Farmacia
                        </span>
                    </div>
                </div>

                {/* Título Central */}
                <div className="header-title-pill">
                    <h1>Mis Solicitudes</h1>
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

            {/* Dashboard Container */}
            <div className="dashboard-container">
                <div className="modern-layout">
                    {/* Barra de Acciones Superior */}
                    <div className="dashboard-actions-bar" style={{ gap: '20px', flexWrap: 'wrap' }}>
                        {/* Mensaje de Información Compacto */}
                        <div className="pharmacy-info-compact">
                            <i className="fa-solid fa-circle-info"></i>
                            <span>
                                El conteo de días transcurridos inicia los <strong>jueves</strong> (tickets creados otros días inician el siguiente jueves).
                            </span>
                        </div>
                        
                        <div className="flex-row gap-8 align-center" style={{ marginLeft: 'auto' }}>
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
                            tickets.map((ticket, idx) => {
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
                                             <div className="accordion-header-left" style={{ maxWidth: '75%', display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: '8px' }}>
                                                 <span className="accordion-ticket-id">
                                                     {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}...`}
                                                 </span>
                                                 {hasUnread && <span className="badge-unread" style={{ flexShrink: 0 }}>Nuevo</span>}
                                                 {/* Badges en línea horizontal */}
                                                 <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                     {ticket.priority && ticket.priority !== 'Sin prioridad' && (
                                                         <span 
                                                             className={`priority-badge-pill priority-${ticket.priority.toLowerCase()}`}
                                                             data-tooltip={`Prioridad: ${ticket.priority}`}
                                                             data-tooltip-position={idx === 0 ? "bottom" : undefined}
                                                         >
                                                             <i className="fa-solid fa-circle-exclamation"></i>
                                                         </span>
                                                     )}
                                                     {ticket.request_type && (
                                                         <span 
                                                             className="type-badge-pill" 
                                                             data-tooltip={`Categoría: ${ticket.request_type}`}
                                                             data-tooltip-position={idx === 0 ? "bottom" : undefined}
                                                         >
                                                             <i className={getRequestTypeIcon(ticket.request_type)}></i>
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
                                                     <div style={{ marginBottom: '16px' }}>
                                                         <SlaProgressBar ticket={ticket} showDetails={true} />
                                                     </div>
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
                                                     <div className="accordion-action-bar-premium">
                                                         <div className="action-bar-meta">
                                                             <span className="metadata-pill">
                                                                 <i className="fa-regular fa-clock"></i> {fecha}
                                                             </span>
                                                         </div>
                                                         <div className="action-bar-controls" onClick={(e) => e.stopPropagation()}>
                                                             <button 
                                                                 className="btn btn-secondary btn-sm"
                                                                 onClick={() => {
                                                                     setAuditLogTicket(ticket);
                                                                     setIsAuditModalOpen(true);
                                                                 }}
                                                                 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                                             >
                                                                 <i className="fa-solid fa-clock-rotate-left"></i>
                                                                 <span>Historial</span>
                                                             </button>
                                                             <button 
                                                                 className={`btn ${hasUnread ? 'btn-danger' : 'btn-secondary'} btn-sm unread-badge-container`}
                                                                 onClick={() => handleOpenChat(ticket)}
                                                                 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                                             >
                                                                 <i className="fa-regular fa-comments"></i>
                                                                 <span>Chat de Soporte</span>
                                                                 {hasUnread && <span className="pulsing-alert-dot"></span>}
                                                             </button>
                                                         </div>
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
                                                <label htmlFor="nombre-medico">
                                                    Nombre del médico como debe aparecer en el recetario
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="nombre-medico" 
                                                    className={validationErrors.nombreMedico ? 'input-invalid' : ''}
                                                    placeholder="Escriba el nombre del médico..."
                                                    value={stepSpecificData.nombreMedico || ''} 
                                                    onChange={(e) => updateStepSpecificField('nombreMedico', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="especialidad-medica">
                                                    Especialidad médica
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="especialidad-medica" 
                                                    className={validationErrors.especialidadMedica ? 'input-invalid' : ''}
                                                    placeholder="Escriba la especialidad médica..."
                                                    value={stepSpecificData.especialidadMedica || ''} 
                                                    onChange={(e) => updateStepSpecificField('especialidadMedica', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="nombre-clinica">
                                                    Nombre de la clínica, hospital o consultorio (Opcional)
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="nombre-clinica" 
                                                    placeholder="Escriba el nombre de la clínica..."
                                                    value={stepSpecificData.nombreClinica || ''} 
                                                    onChange={(e) => updateStepSpecificField('nombreClinica', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="direccion-recetario">
                                                    Dirección que debe aparecer en el recetario (Opcional)
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="direccion-recetario" 
                                                    placeholder="Escriba la dirección..."
                                                    value={stepSpecificData.direccionRecetario || ''} 
                                                    onChange={(e) => updateStepSpecificField('direccionRecetario', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="telefono-consultorio">
                                                    Teléfono / WhatsApp / contacto del consultorio (Opcional)
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="telefono-consultorio" 
                                                    placeholder="Escriba el contacto del consultorio..."
                                                    value={stepSpecificData.telefonoConsultorio || ''} 
                                                    onChange={(e) => updateStepSpecificField('telefonoConsultorio', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="horario-atencion">
                                                    Horario de atención, si aplica (Opcional)
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="horario-atencion" 
                                                    placeholder="Escriba el horario de atención..."
                                                    value={stepSpecificData.horarioAtencion || ''} 
                                                    onChange={(e) => updateStepSpecificField('horarioAtencion', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="cantidad-recetarios">
                                                    Cantidad de recetarios solicitados
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="cantidad-recetarios" 
                                                    className={validationErrors.cantidadRecetarios ? 'input-invalid' : ''}
                                                    placeholder="Escriba la cantidad..."
                                                    value={stepSpecificData.cantidadRecetarios || ''} 
                                                    onChange={(e) => updateStepSpecificField('cantidadRecetarios', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="tipo-diseno">
                                                    ¿Desea diseño nuevo o repetir diseño anterior?
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-diseno" 
                                                    className={validationErrors.tipoDiseno ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoDiseno || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoDiseno', e.target.value)}
                                                    options={['Diseño nuevo', 'Repetir diseño anterior', 'Actualizar información de diseño anterior']}
                                                    placeholder="Seleccione..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="incluye-logo">
                                                    ¿Debe incluir logo del médico, clínica o institución? Adjuntar logo
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="incluye-logo" 
                                                    className={validationErrors.incluyeLogo ? 'input-invalid' : ''}
                                                    value={stepSpecificData.incluyeLogo || ''} 
                                                    onChange={(e) => updateStepSpecificField('incluyeLogo', e.target.value)}
                                                    options={['Si', 'No']}
                                                    placeholder="Seleccione..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="otra-informacion">
                                                    ¿Alguna otra Información que debe llevar el recetario? (Opcional)
                                                </label>
                                                <textarea 
                                                    id="otra-informacion" 
                                                    placeholder="Escriba cualquier otra información adicional..."
                                                    value={stepSpecificData.otraInformacion || ''} 
                                                    onChange={(e) => updateStepSpecificField('otraInformacion', e.target.value)}
                                                    rows="2"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Insumos / utilería para activaciones o jornadas médicas' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="tipo-actividad">
                                                    Tipo de actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="tipo-actividad" 
                                                    className={validationErrors.tipoActividad ? 'input-invalid' : ''}
                                                    value={stepSpecificData.tipoActividad || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoActividad', e.target.value)}
                                                    options={['Activación', 'Jornada médica', 'Feria de salud', 'Evento institucional', 'Congreso', 'Otras']}
                                                    placeholder="Seleccione tipo de actividad..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="nombre-actividad">
                                                    Nombre de la actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="nombre-actividad" 
                                                    className={validationErrors.nombreActividad ? 'input-invalid' : ''}
                                                    placeholder="Escriba el nombre de la actividad..."
                                                    value={stepSpecificData.nombreActividad || ''} 
                                                    onChange={(e) => updateStepSpecificField('nombreActividad', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="fecha-actividad">
                                                    Fecha de la actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                    Especifique la fecha (d/M/yyyy)
                                                </span>
                                                <input 
                                                    type="date" 
                                                    id="fecha-actividad" 
                                                    className={validationErrors.fechaActividad ? 'input-invalid' : ''}
                                                    value={stepSpecificData.fechaActividad || ''} 
                                                    onChange={(e) => updateStepSpecificField('fechaActividad', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="horario-actividad">
                                                    Horario de la actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="horario-actividad" 
                                                    className={validationErrors.horarioActividad ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: 08:00 AM a 04:00 PM..."
                                                    value={stepSpecificData.horarioActividad || ''} 
                                                    onChange={(e) => updateStepSpecificField('horarioActividad', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="lugar-actividad">
                                                    Lugar de la actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="lugar-actividad" 
                                                    className={validationErrors.lugarActividad ? 'input-invalid' : ''}
                                                    placeholder="Dirección exacta o establecimiento..."
                                                    value={stepSpecificData.lugarActividad || ''} 
                                                    onChange={(e) => updateStepSpecificField('lugarActividad', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="responsable-sitio">
                                                    Responsable en sitio
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="responsable-sitio" 
                                                    className={validationErrors.responsableSitio ? 'input-invalid' : ''}
                                                    placeholder="Nombre y apellido del contacto responsable..."
                                                    value={stepSpecificData.responsableSitio || ''} 
                                                    onChange={(e) => updateStepSpecificField('responsableSitio', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="objetivo-actividad">
                                                    Objetivo de la actividad
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="objetivo-actividad" 
                                                    className={validationErrors.objetivoActividad ? 'input-invalid' : ''}
                                                    placeholder="Describa el objetivo de esta actividad..."
                                                    value={stepSpecificData.objetivoActividad || ''} 
                                                    onChange={(e) => updateStepSpecificField('objetivoActividad', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>

                                            <div className="input-group">
                                                <label>
                                                    Insumos o utilería solicitada
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <div 
                                                    className={validationErrors.insumosSolicitados ? 'input-invalid' : ''}
                                                    style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '6px', padding: '10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                                                >
                                                    {['Banner', 'Trípticos', 'Trípticos Caja de Luz', 'Flyer', 'Mantel', 'Mesa', 'Stand', 'Sillas', 'Carpa', 'Bolsos', 'Lápices', 'Cupones', 'Botes', 'Uniformes', 'Equipo audiovisual', 'Extensión', 'Ruleta', 'Vasos para degustación', 'Productos Dermatológicos', 'Muestras médicas', 'Globos', 'Globos personalizados', 'Portaglobos', 'Otras'].map(item => {
                                                        const isChecked = (stepSpecificData.insumosSolicitados || []).includes(item);
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
                                                {((stepSpecificData.insumosSolicitados || []).includes('Otras') || true) && (
                                                    <div style={{ marginTop: '10px' }}>
                                                        <label htmlFor="insumos-otros" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Especifique otros insumos (si aplica)</label>
                                                        <input 
                                                            type="text" 
                                                            id="insumos-otros"
                                                            placeholder="Ejemplo: Banderines, gorras promocionales..."
                                                            value={stepSpecificData.insumosOtros || ''}
                                                            onChange={(e) => updateStepSpecificField('insumosOtros', e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="detalle-insumos">
                                                    Detalle específico de los insumos solicitados
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <textarea 
                                                    id="detalle-insumos" 
                                                    className={validationErrors.detalleInsumos ? 'input-invalid' : ''}
                                                    placeholder="Describa cantidades o características del material solicitado..."
                                                    value={stepSpecificData.detalleInsumos || ''} 
                                                    onChange={(e) => updateStepSpecificField('detalleInsumos', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="requiere-montaje">
                                                    ¿Requiere montaje o instalación?
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="requiere-montaje" 
                                                    className={validationErrors.requiereMontaje ? 'input-invalid' : ''}
                                                    value={stepSpecificData.requiereMontaje || ''} 
                                                    onChange={(e) => updateStepSpecificField('requiereMontaje', e.target.value)}
                                                    options={['Si', 'No', 'No estoy seguro']}
                                                    placeholder="Seleccione..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="requiere-promotora">
                                                    ¿Requiere promotora?
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <FormSelect 
                                                    id="requiere-promotora" 
                                                    className={validationErrors.requierePromotora ? 'input-invalid' : ''}
                                                    value={stepSpecificData.requierePromotora || ''} 
                                                    onChange={(e) => updateStepSpecificField('requierePromotora', e.target.value)}
                                                    options={['Si', 'No']}
                                                    placeholder="Seleccione..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="restricciones-permisos">¿Hay restricciones del lugar o permisos requeridos?</label>
                                                <textarea 
                                                    id="restricciones-permisos" 
                                                    placeholder="Indique si hay horarios restringidos, permisos del centro comercial, etc..."
                                                    value={stepSpecificData.restriccionesPermisos || ''} 
                                                    onChange={(e) => updateStepSpecificField('restriccionesPermisos', e.target.value)}
                                                    rows="2"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {requestType === 'Rotulación Externa' && (
                                        <>
                                            <div className="input-group">
                                                <label htmlFor="ubicacion-instalacion">
                                                    Ubicación donde se instalará la rotulación
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="ubicacion-instalacion" 
                                                    className={validationErrors.ubicacionInstalacion ? 'input-invalid' : ''}
                                                    placeholder="Ejemplo: Entrada principal, ventanal lateral, etc..."
                                                    value={stepSpecificData.ubicacionInstalacion || ''} 
                                                    onChange={(e) => updateStepSpecificField('ubicacionInstalacion', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="tipo-reparacion">
                                                    Reparación (Opcional)
                                                </label>
                                                <FormSelect 
                                                    id="tipo-reparacion" 
                                                    value={stepSpecificData.tipoReparacion || ''} 
                                                    onChange={(e) => updateStepSpecificField('tipoReparacion', e.target.value)}
                                                    options={['Marco Autoservicio', 'Sticker', 'Letras Encajueladas', 'Caja de Luz', 'Microperforado', 'Cambio de lona']}
                                                    placeholder="Seleccione reparación..."
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="medidas-rotulo">
                                                    Medidas exactas del espacio o rótulo (Opcional)
                                                </label>
                                                <input 
                                                    type="text" 
                                                    id="medidas-rotulo" 
                                                    placeholder="Ejemplo: alto x ancho en cm o metros..."
                                                    value={stepSpecificData.medidasRotulo || ''} 
                                                    onChange={(e) => updateStepSpecificField('medidasRotulo', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="fecha-instalacion">
                                                    Fecha requerida para instalación
                                                    <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>
                                                </label>
                                                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                                    Especifique la fecha (d/M/yyyy)
                                                </span>
                                                <input 
                                                    type="date" 
                                                    id="fecha-instalacion" 
                                                    className={validationErrors.fechaInstalacion ? 'input-invalid' : ''}
                                                    value={stepSpecificData.fechaInstalacion || ''} 
                                                    onChange={(e) => updateStepSpecificField('fechaInstalacion', e.target.value)}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label htmlFor="restricciones-externa">
                                                    ¿Existe alguna restricción de instalación, permisos o lineamientos del lugar? (Opcional)
                                                </label>
                                                <textarea 
                                                    id="restricciones-externa" 
                                                    placeholder="Indique si hay restricciones..."
                                                    value={stepSpecificData.restriccionesPermisosExterna || ''} 
                                                    onChange={(e) => updateStepSpecificField('restriccionesPermisosExterna', e.target.value)}
                                                    rows="3"
                                                ></textarea>
                                            </div>
                                        </>
                                    )}

                                    {/* Zona de Carga de Archivos */}
                                    {requestType !== 'Insumos / utilería para activaciones o jornadas médicas' && 
                                     requestType !== 'Rotulación Interna' && 
                                     requestType !== 'Material para impresión' && (
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
                                                        ? 'Límite: 1 archivo, Máx 10MB' 
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
                                    )}

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

            {/* MODAL: Historial de Auditoría (Audit Log) */}
            {isAuditModalOpen && auditLogTicket && (
                <AuditLogModal 
                    isOpen={isAuditModalOpen} 
                    onClose={() => {
                        setIsAuditModalOpen(false);
                        setAuditLogTicket(null);
                    }}
                    ticket={auditLogTicket}
                />
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
            tipoTrabajoExterna: 'Tipo de Trabajo Externo',
            tipoRotulacionExterna: 'Tipo de Rotulación Externa',
            estadoFachada: 'Estado de la Fachada'
        };
        return labels[key] || key;
    };

    const formDataEntries = Object.entries(formData).filter(([key]) => key !== '_type');

    // Identificar si una entrada debe mostrarse a ancho completo
    const isFullWidthKey = (key, val) => {
        if (Array.isArray(val)) return true;
        return ['informacionMaterial', 'detalleTexto', 'indicacionesDiseno', 'informacionContacto', 'objetivoUso', 'estadoFachada', 'textoMaterial'].includes(key);
    };

    // Separar en entradas de ancho medio y ancho completo
    const halfWidthEntries = [];
    const fullWidthEntries = [];

    formDataEntries.forEach(([key, val]) => {
        if (val === undefined || val === null || val === '') return;
        if (isFullWidthKey(key, val)) {
            fullWidthEntries.push([key, val]);
        } else {
            halfWidthEntries.push([key, val]);
        }
    });

    return (
        <div className="structured-details-section">
            <div className="structured-details-title">
                <i className={getRequestTypeIcon(ticket.request_type)}></i>
                <span>Detalles de Solicitud ({ticket.request_type})</span>
            </div>
            
            <div className="structured-details-grid">
                {/* 1. Datos cortos (Ancho Medio) agrupados para optimizar espacio */}
                <div className="structured-detail-item">
                    <span className="structured-detail-label">Rol del Solicitante</span>
                    <span className="structured-detail-value">{ticket.requester_role || 'No especificado'}</span>
                </div>
                
                {ticket.priority && ticket.priority !== 'Sin prioridad' && (
                    <div className="structured-detail-item">
                        <span className="structured-detail-label">Prioridad</span>
                        <span className={`structured-detail-value priority-val-${ticket.priority.toLowerCase()}`}>
                            {ticket.priority}
                        </span>
                    </div>
                )}

                {halfWidthEntries.map(([key, val]) => {
                    const label = getReadableLabel(key);
                    return (
                        <div key={key} className="structured-detail-item">
                            <span className="structured-detail-label">{label}</span>
                            <span className="structured-detail-value" style={{ whiteSpace: 'pre-wrap' }}>{val}</span>
                        </div>
                    );
                })}
                
                {/* 2. Datos largos y descripciones (Ancho Completo) al final */}
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
                
                {fullWidthEntries.map(([key, val]) => {
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
                    
                    return (
                        <div key={key} className="structured-detail-item full-width">
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
