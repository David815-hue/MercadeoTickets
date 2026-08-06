import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import FormSelect from './FormSelect';

const CATEGORY_DURATIONS = {
    'Artes Digital': '5 días',
    'Rotulación Interna': '3 días (Cubrecajas 10 días)',
    'Material para impresión': '10 días',
    'Recetarios Médicos': '20 días',
    'Activaciones/Eventos/Insumos/Utileria': '3 días'
};

export default function CreateTicketModal({ isOpen, onClose, currentUser, onTicketCreated, pharmaciesList = [] }) {
    const [wizardStep, setWizardStep] = useState(1);
    const [selectedPharmacy, setSelectedPharmacy] = useState(currentUser.role === 'admin' ? 'MERCADEO' : currentUser.username);
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
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const resetForm = () => {
        setWizardStep(1);
        setSelectedPharmacy(currentUser.role === 'admin' ? 'MERCADEO' : currentUser.username);
        setRequesterRole('Jefe de Tienda');
        setTicketPriority('Sin prioridad');
        setTicketObjective('');
        setTicketAdditionalInfo('');
        setRequestType('');
        setStepSpecificData({});
        setSelectedFiles([]);
        setFileUploadProgresses({});
        setValidationErrors({});
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleRequestTypeChange = (type) => {
        setRequestType(type);
        if (validationErrors.requestType) {
            setValidationErrors(prev => ({ ...prev, requestType: false }));
        }
    };

    const initStepSpecificData = () => {
        const defaultData = {};
        if (requestType === 'Artes Digital') {
            defaultData.tipoMaterial = '';
            defaultData.medidas = '';
            defaultData.medidasEspecificas = '';
            defaultData.informacionMaterial = '';
            defaultData.incluirTelefono = '';
        } else if (requestType === 'Rotulación Interna') {
            defaultData.tipoRotulacion = '';
            defaultData.medidas = '';
            defaultData.detalleTexto = '';
        } else if (requestType === 'Material para impresión') {
            defaultData.tipoMaterialImpreso = '';
            defaultData.tamanoRequerido = '';
            defaultData.orientacion = '';
            defaultData.cantidadRequerida = '';
            defaultData.ladosImpresion = '';
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
        } else if (requestType === 'Activaciones/Eventos/Insumos/Utileria') {
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
            if (['Cubre Caja', 'Puerta Mesón', 'Sticker'].includes(stepSpecificData.tipoRotulacion) && !(stepSpecificData.medidas || '').trim()) {
                errors.medidas = true;
            }
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
        } else if (requestType === 'Activaciones/Eventos/Insumos/Utileria') {
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
        if (type === 'Rotulación Interna') return 'Yoselyn';
        if (type === 'Material para impresión') return 'Yoselyn';
        if (type === 'Recetarios Médicos') return 'Angelica';
        if (type === 'Activaciones/Eventos/Insumos/Utileria') return 'Yoselyn';
        if (type === 'Rotulación Externa') return 'Emma';
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
            const targetPharmacy = currentUser.role === 'admin' 
                ? (selectedPharmacy || 'MERCADEO')
                : currentUser.username;

            const { data: ticket, error: ticketError } = await supabase
                .from('tickets')
                .insert({
                    user_id: currentUser.id,
                    pharmacy_name: targetPharmacy,
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

            toast.success(`Solicitud #${ticket.ticket_number || ''} creada exitosamente`);
            resetForm();
            onClose();
            if (onTicketCreated) onTicketCreated();

        } catch (e) {
            console.error('Error al crear ticket:', e);
            toast.error('Ocurrió un error al crear la solicitud: ' + (e.message || 'Error desconocido'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={handleClose}>
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
                            {currentUser.role === 'admin' && (
                                <div className="input-group">
                                    <label>Farmacia / Sucursal que Solicita</label>
                                    <FormSelect
                                        value={selectedPharmacy}
                                        onChange={(e) => setSelectedPharmacy(e.target.value)}
                                        options={['MERCADEO', ...pharmaciesList.filter(p => p !== 'MERCADEO')]}
                                        placeholder="Seleccione farmacia o sucursal..."
                                    />
                                </div>
                            )}

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
                                        { id: 'Activaciones/Eventos/Insumos/Utileria', label: 'Activaciones/Eventos/Insumos/Utileria', icon: 'fa-solid fa-kit-medical' },
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

                            {requestType === 'Activaciones/Eventos/Insumos/Utileria' && (
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
                            <div className="input-group">
                                <label>
                                    Adjuntar Archivos / Fotos
                                    {requestType === 'Recetarios Médicos' && stepSpecificData.incluyeLogo === 'Si' && (
                                        <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>* (Logo Obligatorio)</span>
                                    )}
                                </label>
                                
                                <div 
                                    className={`file-drop-zone ${validationErrors.logoRequired ? 'input-invalid' : ''}`}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <i className="fa-solid fa-cloud-arrow-up"></i>
                                    <p style={{ margin: '6px 0 2px 0', fontSize: '0.88rem', fontWeight: '600' }}>
                                        Arrastra archivos aquí o haz clic para buscar
                                    </p>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {requestType === 'Recetarios Médicos'
                                            ? 'Máximo 1 archivo (Hasta 10MB)'
                                            : 'Máximo 3 archivos (Documentos, Imágenes, Videos hasta 5MB c/u)'}
                                    </span>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileSelect} 
                                        multiple={requestType !== 'Recetarios Médicos'}
                                        style={{ display: 'none' }}
                                        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                    />
                                </div>

                                {selectedFiles.length > 0 && (
                                    <div className="selected-files-list" style={{ marginTop: '12px' }}>
                                        {selectedFiles.map((file, idx) => (
                                            <div key={idx} className="selected-file-item">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                    <i className="fa-solid fa-paperclip" style={{ color: 'var(--color-primary)' }}></i>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: '500' }} className="text-truncate">{file.name}</span>
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                                    </span>
                                                </div>
                                                
                                                {fileUploadProgresses[file.name] !== undefined && isSubmitting ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100px' }}>
                                                        <div className="progress-bar-wrap" style={{ flex: 1, height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div className="progress-bar-fill" style={{ width: `${fileUploadProgresses[file.name]}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s' }}></div>
                                                        </div>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{fileUploadProgresses[file.name]}%</span>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        type="button" 
                                                        className="btn-icon-remove" 
                                                        onClick={() => removeFile(idx)}
                                                        disabled={isSubmitting}
                                                        title="Eliminar archivo"
                                                    >
                                                        <i className="fa-solid fa-trash-can"></i>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

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
                                    className="btn btn-primary"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i> Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i> Crear Solicitud
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </form>
            </div>
        </div>
    );
}
