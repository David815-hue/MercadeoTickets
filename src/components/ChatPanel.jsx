import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';



export default function ChatPanel({ ticket, currentUser, isAdmin, onStatusChange }) {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [text, setText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [compressedBlob, setCompressedBlob] = useState(null);
    const [compressedSizeKb, setCompressedSizeKb] = useState(0);
    const [previewUrl, setPreviewUrl] = useState('');

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

    // 2. Compresión de Imagen Client-side con Canvas
    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona un archivo de imagen válido.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
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
                ctx.drawImage(img, 0, 0, width, height);

                // Comprimir al 70% de calidad JPG
                canvas.toBlob((blob) => {
                    setCompressedBlob(blob);
                    setCompressedSizeKb((blob.size / 1024).toFixed(1));
                    setPreviewUrl(URL.createObjectURL(blob));
                }, 'image/jpeg', 0.7);
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
            alert('No puedes enviar mensajes hasta que el administrador inicie la conversación.');
            return;
        }

        setIsSending(true);

        try {
            let imageUrl = null;

            // Subir imagen si la hay
            if (hasImage) {
                const fileName = `${Date.now()}_comprimida.jpg`;
                const filePath = `tickets/${ticket.id}/${fileName}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('ticket-attachments')
                    .upload(filePath, compressedBlob, {
                        contentType: 'image/jpeg'
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
            alert('No se pudo enviar el mensaje: ' + error.message);
        } finally {
            setIsSending(false);
        }
    };

    const escapeHTML = (str) => {
        if (!str) return '';
        return str; // React ya escapa de forma segura por defecto
    };

    return (
        <div className="chat-container">
            {/* Cabecera del chat */}
            <div className="chat-header flex-row justify-between align-center">
                <div className="chat-ticket-info">
                    <h4>Ticket #{ticket.id.substring(0, 8)}...</h4>
                    {isAdmin ? (
                        <p><i className="fa-solid fa-hospital"></i> <strong>{ticket.pharmacy_name}</strong> - {new Date(ticket.created_at).toLocaleDateString('es-ES')}</p>
                    ) : (
                        <p><i className="fa-regular fa-calendar"></i> Emisión: {new Date(ticket.created_at).toLocaleDateString('es-ES')}</p>
                    )}
                    <p className="chat-ticket-desc">{ticket.description}</p>
                </div>

                {/* Control de Estado */}
                {isAdmin ? (
                    <div className="admin-status-control">
                        <label htmlFor="admin-change-status">Estado del Ticket</label>
                        <select 
                            id="admin-change-status" 
                            className="select-status"
                            value={ticket.status}
                            onChange={(e) => onStatusChange(ticket.id, e.target.value)}
                        >
                            <option value="Aceptado">Aceptado</option>
                            <option value="En revision">En revisión</option>
                            <option value="Resuelto">Resuelto</option>
                        </select>
                    </div>
                ) : (
                    <div className="chat-ticket-status">
                        <span className={`badge badge-${ticket.status}`}>{ticket.status}</span>
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
                                        <a href={msg.image_url} target="_blank" rel="noreferrer">
                                            <img src={msg.image_url} className="chat-image" alt="Adjunto" />
                                        </a>
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
        </div>
    );
}
