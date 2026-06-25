import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import CustomStatusDropdown from './CustomStatusDropdown';
import { toast } from 'sonner';
import { getPharmacyDisplayName } from '../utils/pharmacyMap';
import DeliverablesPanel from './DeliverablesPanel';

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

export default function ChatPanel({ ticket, currentUser, isAdmin, onStatusChange }) {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [compressedBlob, setCompressedBlob] = useState(null);
    const [compressedSizeKb, setCompressedSizeKb] = useState(0);
    const [previewUrl, setPreviewUrl] = useState('');
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [showDeliverables, setShowDeliverables] = useState(false);
    const [hasDeliverables, setHasDeliverables] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const isAdminInitiated = messages.some(msg => msg.sender_name === 'Administrador');
    const isChatBlocked = currentUser && currentUser.role === 'farmacia' && !isAdminInitiated;

    // Verificar si hay entregables (para la Farmacia)
    useEffect(() => {
        if (!ticket || isAdmin) return;

        const checkDeliverables = async () => {
            try {
                const { count, error } = await supabase
                    .from('ticket_deliverables')
                    .select('*', { count: 'exact', head: true })
                    .eq('ticket_id', ticket.id);
                if (!error) {
                    setHasDeliverables(count > 0);
                }
            } catch (err) {
                console.error('Error checking deliverables:', err);
            }
        };

        checkDeliverables();

        const channel = supabase.channel(`public:ticket_deliverables_count:ticket_id=eq.${ticket.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'ticket_deliverables',
                filter: `ticket_id=eq.${ticket.id}`
            }, () => {
                checkDeliverables();
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [ticket, isAdmin]);

    // Cambiar dinámicamente el tamaño del modal a ancho ancho (wide)
    useEffect(() => {
        const modalContent = document.querySelector('.modal-content-chat');
        const shouldSplit = (isAdmin && showDeliverables) || (!isAdmin && hasDeliverables);
        if (modalContent) {
            if (shouldSplit) {
                modalContent.classList.add('modal-content-chat--wide');
            } else {
                modalContent.classList.remove('modal-content-chat--wide');
            }
        }
        return () => {
            if (modalContent) {
                modalContent.classList.remove('modal-content-chat--wide');
            }
        };
    }, [showDeliverables, hasDeliverables, isAdmin]);

    // 1. Cargar mensajes y suscribirse a cambios en tiempo real
    useEffect(() => {
        if (!ticket) return;

        loadMessages();

        // Suscribirse a mensajes en tiempo real
        const channel = supabase.channel(`public:messages:ticket_id=eq.${ticket.id}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `ticket_id=eq.${ticket.id}`
            }, (payload) => {
                setMessages(prev => {
                    // Evitar duplicados por si acaso
                    if (prev.some(m => m.id === payload.new.id)) return prev;

                    return [...prev, payload.new];
                });
            })
            .subscribe();

        // Cleanup: desuscribirse
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticket]);

    // Hacer scroll automático al recibir mensajes
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadMessages = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('ticket_id', ticket.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data || []);
        } catch (e) {
            console.error('Error al cargar mensajes:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 2. Compresión de Imagen Client-side con Canvas (Inteligente y de Alta Calidad)
    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Por favor selecciona un archivo de imagen válido.');
            return;
        }

        // Si el archivo es pequeño (menos de 2.5 MB), lo enviamos original sin compresión para mantener calidad 100% perfecta (ideal para capturas de pantalla)
        if (file.size < 2.5 * 1024 * 1024) {
            setCompressedBlob(file);
            setCompressedSizeKb((file.size / 1024).toFixed(1));
            setPreviewUrl(URL.createObjectURL(file));
            return;
        }

        // Si es más grande de 2.5 MB, hacemos una compresión suave de alta calidad
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 2048; // Aumentado a 2K para máxima nitidez
                const MAX_HEIGHT = 2048;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Comprimir al 90% de calidad JPG (calidad prácticamente idéntica al original)
                canvas.toBlob((blob) => {
                    setCompressedBlob(blob || file);
                    setCompressedSizeKb(((blob ? blob.size : file.size) / 1024).toFixed(1));
                    setPreviewUrl(URL.createObjectURL(blob || file));
                }, 'image/jpeg', 0.9);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    const clearSelectedImage = () => {
        setCompressedBlob(null);
        setCompressedSizeKb(0);
        setPreviewUrl('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // 3. Enviar Mensaje
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const msgText = text.trim();
        const hasImage = compressedBlob !== null;

        if (!msgText && !hasImage) return;
        if (isChatBlocked) {
            toast.warning('No puedes enviar mensajes hasta que el administrador inicie la conversación.');
            return;
        }

        setIsSending(true);

        try {
            let imageUrl = null;

            // Subir imagen si la hay
            if (hasImage) {
                const extension = compressedBlob.type === 'image/png' ? 'png' : 'jpg';
                const fileName = `${Date.now()}_adjunto.${extension}`;
                const filePath = `tickets/${ticket.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('ticket-attachments')
                    .upload(filePath, compressedBlob, {
                        contentType: compressedBlob.type
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('ticket-attachments')
                    .getPublicUrl(filePath);

                imageUrl = urlData.publicUrl;
            }

            // Insertar fila del mensaje
            const { data: insertedMsg, error: msgError } = await supabase
                .from('messages')
                .insert({
                    ticket_id: ticket.id,
                    sender_id: currentUser.id,
                    sender_name: currentUser.role === 'admin' ? 'Administrador' : currentUser.username,
                    message_text: msgText || null,
                    image_url: imageUrl
                })
                .select()
                .single();

            if (msgError) throw msgError;

            // Actualizar localmente de inmediato
            if (insertedMsg) {
                setMessages(prev => {
                    if (prev.some(m => m.id === insertedMsg.id)) return prev;
                    return [...prev, insertedMsg];
                });
            }

            // Limpiar inputs
            setText('');
            clearSelectedImage();

        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            toast.error('No se pudo enviar el mensaje: ' + error.message);
        } finally {
            setIsSending(false);
        }
    };

    const shouldSplit = (isAdmin && showDeliverables) || (!isAdmin && hasDeliverables);

    return (
        <div className={`chat-split-wrapper ${shouldSplit ? 'split-active' : ''}`}>
            <div className="chat-container">
                {/* Cabecera del chat */}
                <div className="chat-header">
                    <div className="chat-header-top flex-row justify-between align-center" style={{ marginBottom: '14px', width: '100%', gap: '16px' }}>
                        <div className="chat-ticket-meta">
                            <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                                Ticket {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}...`}
                            </h4>
                            <div className="chat-meta-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {isAdmin && (
                                    <span style={{ fontSize: '0.7rem' }}>
                                        <i className="fa-solid fa-hospital" style={{ marginRight: '4px', color: 'var(--color-primary)' }}></i>
                                        <strong style={{ fontSize: '0.7rem', fontWeight: 600 }}>{getPharmacyDisplayName(ticket.pharmacy_name)}</strong>
                                    </span>
                                )}
                                {isAdmin && ticket.request_type && <span>•</span>}
                                {ticket.request_type && (
                                    <span className="chat-category-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 600 }}>
                                        <i className={getRequestTypeIcon(ticket.request_type)}></i>
                                        {ticket.request_type}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Control de Estado y Toggle de Entregables */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isAdmin ? (
                                <div className="admin-status-control-clean" style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'visible' }} onClick={(e) => e.stopPropagation()}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Estado:</span>
                                    <CustomStatusDropdown 
                                        value={ticket.status}
                                        onChange={(val) => onStatusChange(ticket.id, val)}
                                    />
                                </div>
                            ) : (
                                <div className="chat-ticket-status">
                                    <span className={`badge status-pill status-pill-${ticket.status.toLowerCase().replace(' ', '_')}`} style={{ fontSize: '0.68rem', padding: '3px 8px' }}>{ticket.status}</span>
                                </div>
                            )}

                            {isAdmin && (
                                <div 
                                    className="deliverables-toggle-container"
                                    onClick={() => setShowDeliverables(!showDeliverables)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        padding: '5px 10px',
                                        borderRadius: '20px',
                                        border: '1px solid var(--border-color)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <i className="fa-solid fa-box-archive" style={{ color: showDeliverables ? 'var(--color-primary)' : 'var(--text-muted)', fontSize: '0.72rem' }}></i>
                                        Entregables
                                    </span>
                                    <div 
                                        className={`custom-switch ${showDeliverables ? 'active' : ''}`}
                                        style={{
                                            width: '30px',
                                            height: '16px',
                                            borderRadius: '8px',
                                            background: showDeliverables ? 'var(--color-primary)' : 'rgba(255,255,255,0.15)',
                                            position: 'relative',
                                            transition: 'background-color 0.25s ease',
                                            display: 'inline-block'
                                        }}
                                    >
                                        <div 
                                            className="switch-knob"
                                            style={{
                                                width: '12px',
                                                height: '12px',
                                                borderRadius: '50%',
                                                background: '#fff',
                                                position: 'absolute',
                                                top: '2px',
                                                left: showDeliverables ? '16px' : '2px',
                                                transition: 'left 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="chat-ticket-desc-banner" title={ticket.description}>
                        <span className="desc-banner-label">Descripción:</span> {ticket.description}
                    </div>
                </div>

                {/* Cuerpo del chat (Mensajes) */}
                <div className="chat-messages">
                    {isLoading ? (
                        <div className="empty-state">
                            <i className="fa-solid fa-spinner fa-spin"></i>
                            <p>Cargando conversación...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="empty-state">
                            <i className="fa-regular fa-comment-dots"></i>
                            <p>No hay mensajes en este chat. Escribe un mensaje para iniciar.</p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isSystem = msg.sender_name === 'Sistema';
                            const isOutgoing = msg.sender_id === currentUser.id && !isSystem;
                            const fecha = new Date(msg.created_at).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            if (isSystem) {
                                return (
                                    <div 
                                        key={msg.id}
                                        style={{
                                            alignSelf: 'center', 
                                            margin: '10px 0', 
                                            fontSize: '0.8rem', 
                                            background: 'rgba(255,255,255,0.05)', 
                                            padding: '4px 12px', 
                                            borderRadius: '12px', 
                                            color: 'var(--text-secondary)', 
                                            textAlign: 'center', 
                                            maxWidth: '90%'
                                        }}
                                    >
                                        <span>{msg.message_text}</span>
                                    </div>
                                );
                            }

                            return (
                                <div 
                                    key={msg.id} 
                                    className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}
                                >
                                    <span className="message-meta">{msg.sender_name} • {fecha}</span>
                                    <div className="message-content">
                                        {msg.message_text && <p>{msg.message_text}</p>}
                                        {msg.image_url && (
                                            <div 
                                                className="chat-image-wrap"
                                                onClick={() => setLightboxUrl(msg.image_url)}
                                                title="Click para ampliar imagen"
                                            >
                                                <img src={msg.image_url} className="chat-image" alt="Adjunto" />
                                                <div className="chat-image-overlay">
                                                    <i className="fa-solid fa-magnifying-glass-plus"></i>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {isChatBlocked && (
                    <div 
                        className="chat-blocked-banner" 
                        style={{ 
                            padding: '10px 16px', 
                            background: 'rgba(245, 158, 11, 0.1)', 
                            borderTop: '1px solid var(--border-color)', 
                            borderBottom: '1px solid var(--border-color)', 
                            color: 'var(--color-warning)', 
                            fontSize: '0.85rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            fontWeight: '500'
                        }}
                    >
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>Esperando a que el administrador inicie la conversación para poder responder.</span>
                    </div>
                )}

                {/* Input del chat */}
                <form className="chat-input-area" onSubmit={handleSendMessage}>
                    {previewUrl && (
                        <div className="image-preview-bar">
                            <img src={previewUrl} alt="Vista previa" />
                            <button type="button" className="btn-close-preview" onClick={clearSelectedImage}>
                                <i className="fa-solid fa-circle-xmark"></i>
                            </button>
                            <div className="compression-info">
                                <i className="fa-solid fa-wand-magic-sparkles"></i> Comprimida ({compressedSizeKb} KB)
                            </div>
                        </div>
                    )}
                    <div className="input-controls">
                        <label 
                            className={`btn-attach ${isChatBlocked ? 'disabled' : ''}`} 
                            title={isChatBlocked ? "Chat bloqueado hasta que el administrador responda" : "Adjuntar imagen"}
                            style={isChatBlocked ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
                        >
                            <i className="fa-solid fa-image"></i>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleImageSelect}
                                disabled={isSending || isChatBlocked}
                            />
                        </label>
                        <input 
                            type="text" 
                            placeholder={isChatBlocked ? "Esperando respuesta del administrador..." : (isSending ? "Enviando..." : "Escribe un mensaje o pregunta...")} 
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={isSending || isChatBlocked}
                            autoComplete="off"
                        />
                        <button type="submit" className="btn btn-primary" disabled={isSending || isChatBlocked || (!text.trim() && !compressedBlob)}>
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    </div>
                </form>

                {/* LIGHTBOX: Visor de Imágenes Integrado */}
                {lightboxUrl && (
                    <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
                        <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                            <button className="lightbox-close-btn" onClick={() => setLightboxUrl(null)} title="Cerrar visor">
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                            <img src={lightboxUrl} alt="Vista ampliada" className="lightbox-image" />
                            <div className="lightbox-actions">
                                <a href={lightboxUrl} download target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                                    <i className="fa-solid fa-download"></i> Descargar Imagen
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {shouldSplit && (
                <DeliverablesPanel 
                    ticket={ticket}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                />
            )}
        </div>
    );
}
