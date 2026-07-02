import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

export default function DeliverablesPanel({ ticket, currentUser, isAdmin }) {
    const [deliverables, setDeliverables] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [note, setNote] = useState('');
    const [correctionNote, setCorrectionNote] = useState('');
    const [activeCorrectionId, setActiveCorrectionId] = useState(null);
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);
    const hasRequestedCorrections = deliverables.some(d => d.status === 'Con Correcciones');

    // 1. Cargar entregables y suscribirse a cambios en tiempo real
    useEffect(() => {
        if (!ticket) return;

        loadDeliverables();

        // Suscribirse a entregables en tiempo real
        const channel = supabase.channel(`public:ticket_deliverables:ticket_id=eq.${ticket.id}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'ticket_deliverables',
                filter: `ticket_id=eq.${ticket.id}`
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setDeliverables(prev => {
                        if (prev.some(d => d.id === payload.new.id)) return prev;
                        // Ordenar por versión descendente para mostrar el más reciente arriba
                        return [payload.new, ...prev].sort((a, b) => b.version - a.version);
                    });
                } else if (payload.eventType === 'UPDATE') {
                    setDeliverables(prev => 
                        prev.map(d => d.id === payload.new.id ? payload.new : d)
                            .sort((a, b) => b.version - a.version)
                    );
                } else if (payload.eventType === 'DELETE') {
                    setDeliverables(prev => prev.filter(d => d.id !== payload.old.id));
                }
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [ticket]);

    const loadDeliverables = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('ticket_deliverables')
                .select('*')
                .eq('ticket_id', ticket.id)
                .order('version', { ascending: false });

            if (error) throw error;
            setDeliverables(data || []);
        } catch (e) {
            console.error('Error al cargar entregables:', e);
            toast.error('No se pudieron cargar los entregables.');
        } finally {
            setIsLoading(false);
        }
    };

    // Helper para formatear tamaño de archivo
    const formatFileSize = (bytes) => {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // 2. Subir Entregable (Solo Administrador)
    const handleUploadDeliverable = async (e) => {
        e.preventDefault();
        const file = selectedFile;
        if (!file) {
            toast.warning('Selecciona un archivo primero.');
            return;
        }

        setIsUploading(true);
        try {
            // Calcular número de versión automáticamente
            const nextVersion = deliverables.length > 0 
                ? Math.max(...deliverables.map(d => d.version)) + 1 
                : 1;

            const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `${Date.now()}_v${nextVersion}_${sanitizedFileName}`;
            const filePath = `tickets/${ticket.id}/deliverables/${fileName}`;

            // 1. Subir a Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('ticket-attachments')
                .upload(filePath, file, {
                    contentType: file.type,
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // 2. Obtener URL Pública
            const { data: urlData } = supabase.storage
                .from('ticket-attachments')
                .getPublicUrl(filePath);

            const fileUrl = urlData.publicUrl;

            // 3. Registrar en base de datos
            const { error: insertError } = await supabase
                .from('ticket_deliverables')
                .insert({
                    ticket_id: ticket.id,
                    uploaded_by: currentUser.id,
                    file_url: fileUrl,
                    file_name: file.name,
                    version: nextVersion,
                    status: 'Pendiente',
                    note: note.trim() || null
                });

            if (insertError) throw insertError;

            toast.success(`Entregable V${nextVersion} subido con éxito.`);
            setNote('');
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';

            // Opcional: Insertar un mensaje de sistema en el chat informando del nuevo entregable
            await supabase.from('messages').insert({
                ticket_id: ticket.id,
                sender_id: currentUser.id,
                sender_name: 'Sistema',
                message_text: `📢 Se ha subido un nuevo entregable oficial: ${file.name} (Versión ${nextVersion}).`
            });

        } catch (error) {
            console.error('Error al subir entregable:', error);
            toast.error('Error al subir entregable: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    // 3. Aprobar Entregable (Farmacia)
    const handleApprove = async (id, version, name) => {
        try {
            const { error } = await supabase
                .from('ticket_deliverables')
                .update({ status: 'Aprobado', note: 'Entregable aprobado por la farmacia.' })
                .eq('id', id);

            if (error) throw error;
            toast.success('¡Entregable aprobado!');

            // Registrar mensaje de sistema en el chat
            await supabase.from('messages').insert({
                ticket_id: ticket.id,
                sender_id: currentUser.id,
                sender_name: 'Sistema',
                message_text: `✅ La farmacia ha aprobado el entregable: ${name} (Versión ${version}).`
            });

            // Cambiar estado de ticket a 'En Revision' o 'Aprobado'
            // Opcional: Esto lo puede manejar el flujo del negocio
        } catch (error) {
            console.error('Error al aprobar:', error);
            toast.error('No se pudo aprobar el entregable.');
        }
    };

    // 4. Rechazar/Solicitar cambios (Farmacia)
    const handleRequestCorrections = async (e, id, version, name) => {
        e.preventDefault();
        if (hasRequestedCorrections) {
            toast.error('Límite de ajustes alcanzado. Solo se permite 1 solicitud de ajustes por ticket.');
            return;
        }

        if (!correctionNote.trim()) {
            toast.warning('Por favor especifica las correcciones necesarias.');
            return;
        }

        try {
            const { error } = await supabase
                .from('ticket_deliverables')
                .update({ 
                    status: 'Con Correcciones', 
                    note: `Correcciones solicitadas: ${correctionNote.trim()}` 
                })
                .eq('id', id);

            if (error) throw error;
            toast.success('Solicitud de correcciones enviada.');

            // Registrar mensaje de sistema en el chat con los cambios solicitados
            await supabase.from('messages').insert({
                ticket_id: ticket.id,
                sender_id: currentUser.id,
                sender_name: 'Sistema',
                message_text: `❌ La farmacia solicita correcciones en el entregable (V${version}): "${correctionNote.trim()}"`
            });

            setCorrectionNote('');
            setActiveCorrectionId(null);
        } catch (error) {
            console.error('Error al solicitar cambios:', error);
            toast.error('No se pudo enviar la solicitud de cambios.');
        }
    };

    const isImage = (url) => {
        if (!url) return false;
        const cleanUrl = url.split('?')[0].toLowerCase();
        return cleanUrl.endsWith('.jpg') || 
               cleanUrl.endsWith('.jpeg') || 
               cleanUrl.endsWith('.png') || 
               cleanUrl.endsWith('.gif') || 
               cleanUrl.endsWith('.webp');
    };

    return (
        <div className="deliverables-panel">
            <div className="deliverables-header">
                <h3>
                    <i className="fa-solid fa-box-archive" style={{ marginRight: '8px', color: 'var(--color-primary)' }}></i>
                    Entregables Oficiales
                </h3>
                <p className="deliverables-subtitle">Archivos y propuestas finales de diseño</p>
            </div>

            {/* Formulario de Subida (Solo para el Admin) */}
            {isAdmin && (
                <form className="deliverables-upload-form" onSubmit={handleUploadDeliverable}>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                        {!selectedFile ? (
                            <label className="upload-file-label">
                                <i className="fa-solid fa-cloud-arrow-up"></i>
                                <span>Seleccionar Entregable Oficial</span>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    className="hidden" 
                                    required
                                    disabled={isUploading}
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            setSelectedFile(file);
                                        }
                                    }}
                                />
                            </label>
                        ) : (
                            <div className="selected-file-preview-card">
                                <div className="file-info-left">
                                    <div className="file-icon-wrapper">
                                        {selectedFile.type.startsWith('image/') ? (
                                            <i className="fa-solid fa-file-image text-indigo"></i>
                                        ) : selectedFile.name.endsWith('.pdf') ? (
                                            <i className="fa-solid fa-file-pdf text-red"></i>
                                        ) : selectedFile.name.endsWith('.zip') || selectedFile.name.endsWith('.rar') ? (
                                            <i className="fa-solid fa-file-zipper text-yellow"></i>
                                        ) : (
                                            <i className="fa-solid fa-file text-gray"></i>
                                        )}
                                    </div>
                                    <div className="file-meta-details">
                                        <div className="file-preview-name" title={selectedFile.name}>{selectedFile.name}</div>
                                        <div className="file-preview-size">{formatFileSize(selectedFile.size)}</div>
                                    </div>
                                </div>
                                <button 
                                    type="button" 
                                    className="remove-file-preview-btn"
                                    onClick={() => {
                                        setSelectedFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    disabled={isUploading}
                                    title="Quitar archivo"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                        <input 
                            type="text" 
                            placeholder="Nota adicional opcional (Ej: Propuesta de logo v1)" 
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            disabled={isUploading}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-main)' }}
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        disabled={isUploading || !selectedFile}
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                        {isUploading ? (
                            <>
                                <i className="fa-solid fa-spinner fa-spin"></i> Subiendo...
                            </>
                        ) : (
                            <>
                                <i className="fa-solid fa-upload"></i> Subir Entregable Oficial
                            </>
                        )}
                    </button>
                </form>
            )}

            {/* Listado de Entregables */}
            <div className="deliverables-list">
                {isLoading ? (
                    <div className="deliverables-empty">
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        <p>Cargando entregables...</p>
                    </div>
                ) : deliverables.length === 0 ? (
                    <div className="deliverables-empty">
                        <i className="fa-solid fa-folder-open" style={{ fontSize: '2.5rem', opacity: 0.3, marginBottom: '12px' }}></i>
                        <p>No se han subido entregables oficiales para este ticket aún.</p>
                    </div>
                ) : (
                    deliverables.map((item) => (
                        <div key={item.id} className={`deliverable-card status-${item.status.toLowerCase().replace(' ', '_')}`}>
                            <div className="deliverable-card-header">
                                <div className="version-tag">V{item.version}</div>
                                <span className={`badge status-pill status-pill-${item.status.toLowerCase().replace(' ', '_')}`}>
                                    {item.status}
                                </span>
                            </div>

                            {/* Vista previa o Icono */}
                            {isImage(item.file_url) ? (
                                <div 
                                    className="deliverable-preview-wrap"
                                    onClick={() => setLightboxUrl(item.file_url)}
                                >
                                    <img src={item.file_url} alt={item.file_name} className="deliverable-preview-img" />
                                    <div className="deliverable-preview-overlay">
                                        <i className="fa-solid fa-magnifying-glass-plus"></i> Ampliar propuesta
                                    </div>
                                </div>
                            ) : (
                                <div className="deliverable-file-icon-wrap">
                                    <i className="fa-solid fa-file-pdf file-icon-big"></i>
                                    <span className="file-icon-name">{item.file_name}</span>
                                </div>
                            )}

                            <div className="deliverable-card-body">
                                <h5 className="deliverable-filename" title={item.file_name}>
                                    {item.file_name}
                                </h5>
                                {item.note && (
                                    <p className="deliverable-note">
                                        <strong>Detalle:</strong> {item.note}
                                    </p>
                                )}
                                <span className="deliverable-date">
                                    Subido el {new Date(item.created_at).toLocaleDateString('es-ES')} a las {new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>

                            <div className="deliverable-card-actions">
                                <a href={item.file_url} download target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ flex: 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                                    <i className="fa-solid fa-download"></i> Descargar
                                </a>

                                {/* Acciones exclusivas de la Farmacia cuando el entregable está Pendiente */}
                                {!isAdmin && item.status === 'Pendiente' && (
                                    <div className="farmacia-decision-btns" style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px', marginTop: '8px' }}>
                                        <div style={{ display: 'flex', width: '100%', gap: '8px' }}>
                                            <button 
                                                onClick={() => handleApprove(item.id, item.version, item.file_name)}
                                                className="btn btn-success btn-sm" 
                                                style={{ flex: 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}
                                            >
                                                <i className="fa-solid fa-check"></i> Aprobar
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setActiveCorrectionId(activeCorrectionId === item.id ? null : item.id);
                                                    setCorrectionNote('');
                                                }}
                                                className="btn btn-danger btn-sm"
                                                disabled={hasRequestedCorrections}
                                                title={hasRequestedCorrections ? "Ya has solicitado ajustes una vez para este ticket." : "Solicitar ajustes"}
                                                style={{ 
                                                    flex: 1, 
                                                    display: 'inline-flex', 
                                                    justifyContent: 'center', 
                                                    alignItems: 'center', 
                                                    gap: '4px',
                                                    opacity: hasRequestedCorrections ? 0.5 : 1,
                                                    cursor: hasRequestedCorrections ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <i className="fa-solid fa-triangle-exclamation"></i> Ajustes {hasRequestedCorrections && "(Límite)"}
                                            </button>
                                        </div>
                                        {hasRequestedCorrections && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-danger)', marginTop: '4px', textAlign: 'center', fontWeight: 500 }}>
                                                <i className="fa-solid fa-circle-info"></i> Límite de 1 ajuste por ticket alcanzado.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Formulario desplegable para solicitar correcciones (solo Farmacia) */}
                            {!isAdmin && activeCorrectionId === item.id && (
                                <form 
                                    className="deliverable-correction-form animate-slide-down"
                                    onSubmit={(e) => handleRequestCorrections(e, item.id, item.version, item.file_name)}
                                    style={{ marginTop: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                >
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-danger)', display: 'block', marginBottom: '6px' }}>
                                        ¿Qué correcciones o cambios necesitas?
                                    </label>
                                    <textarea
                                        rows="2"
                                        required
                                        value={correctionNote}
                                        onChange={(e) => setCorrectionNote(e.target.value)}
                                        placeholder="Ej: Por favor cambiar el color del texto a azul y agrandar el logo..."
                                        style={{ width: '100%', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-main)', resize: 'vertical', marginBottom: '8px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button 
                                            type="button" 
                                            className="btn btn-secondary btn-xs"
                                            onClick={() => setActiveCorrectionId(null)}
                                        >
                                            Cancelar
                                        </button>
                                        <button type="submit" className="btn btn-danger btn-xs">
                                            Enviar Ajustes
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* LIGHTBOX para previsualizar entregables */}
            {lightboxUrl && (
                <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="lightbox-close-btn" onClick={() => setLightboxUrl(null)} title="Cerrar visor">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <img src={lightboxUrl} alt="Entregable Ampliado" className="lightbox-image" />
                    </div>
                </div>
            )}
        </div>
    );
}
