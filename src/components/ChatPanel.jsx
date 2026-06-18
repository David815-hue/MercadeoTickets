import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import CustomStatusDropdown from './CustomStatusDropdown';
import { toast } from 'sonner';



export default function ChatPanel({ ticket, currentUser, isAdmin, onStatusChange }) {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [compressedBlob, setCompressedBlob] = useState(null);
    const [compressedSizeKb, setCompressedSizeKb] = useState(0);
    const [previewUrl, setPreviewUrl] = useState('');
    const [lightboxUrl, setLightboxUrl] = useState(null);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const isAdminInitiated = messages.some(msg => msg.sender_name === 'Administrador');
    const isChatBlocked = currentUser && currentUser.role === 'farmacia' && !isAdminInitiated;

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

    return (
        <div className="chat-container">
            {/* Cabecera del chat */}
            <div className="chat-header flex-row justify-between align-center">
                <div className="chat-ticket-info">
                    <h4>Ticket {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}...`}</h4>
                    {isAdmin ? (
                        <p><i className="fa-solid fa-hospital"></i> <strong>{ticket.pharmacy_name}</strong> - {new Date(ticket.created_at).toLocaleDateString('es-ES')}</p>
                    ) : (
                        <p><i className="fa-regular fa-calendar"></i> Emisión: {new Date(ticket.created_at).toLocaleDateString('es-ES')}</p>
                    )}
                    <p className="chat-ticket-desc">{ticket.description}</p>
                </div>

                {/* Control de Estado */}
                {isAdmin ? (
                    <div className="admin-status-control" style={{ overflow: 'visible' }}>
                        <label>Estado del Ticket</label>
                        <CustomStatusDropdown 
                            value={ticket.status}
                            onChange={(val) => onStatusChange(ticket.id, val)}
                        />
                    </div>
                ) : (
                    <div className="chat-ticket-status">
                        <span className={`badge badge-${ticket.status.toLowerCase().replace(' ', '_')}`}>{ticket.status}</span>
                    </div>
                )}
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
    );
}
