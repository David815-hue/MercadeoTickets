import React, { useState } from 'react';
import { toast } from 'sonner';

const STICKY_COLORS = [
    { name: 'Amarillo', bg: '#fff7ed', cardBg: '#fef08a', text: '#713f12', border: '#fde047', tape: 'rgba(253, 224, 71, 0.5)' },
    { name: 'Celeste', bg: '#f0f9ff', cardBg: '#bae6fd', text: '#0369a1', border: '#7dd3fc', tape: 'rgba(125, 211, 252, 0.5)' },
    { name: 'Rosado', bg: '#fdf2f8', cardBg: '#fbcfe8', text: '#831843', border: '#f472b6', tape: 'rgba(244, 114, 182, 0.5)' },
    { name: 'Verde Menta', bg: '#f0fdf4', cardBg: '#bbf7d0', text: '#14532d', border: '#86efac', tape: 'rgba(134, 239, 172, 0.5)' },
    { name: 'Lavanda', bg: '#faf5ff', cardBg: '#e9d5ff', text: '#581c87', border: '#c084fc', tape: 'rgba(192, 132, 252, 0.5)' }
];

const ROTATIONS = [-1.5, 1.2, -0.8, 1.5, -1.8, 0.9];

export default function StickyNotesManager({ notes = [], onSaveNotes, isAdmin = true }) {
    const [noteList, setNoteList] = useState(() => {
        if (Array.isArray(notes) && notes.length > 0) {
            return notes;
        }
        return [];
    });

    const handleAddNote = () => {
        const newNote = {
            id: Date.now() + Math.random().toString(36).substring(7),
            text: '',
            colorIndex: Math.floor(Math.random() * STICKY_COLORS.length),
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const updated = [newNote, ...noteList];
        setNoteList(updated);
        if (onSaveNotes) onSaveNotes(updated);
    };

    const handleUpdateNoteText = (id, textValue) => {
        const updated = noteList.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    text: textValue,
                    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
            }
            return n;
        });
        setNoteList(updated);
        if (onSaveNotes) onSaveNotes(updated);
    };

    const handleUpdateNoteColor = (id, colorIdx) => {
        const updated = noteList.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    colorIndex: colorIdx,
                    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
            }
            return n;
        });
        setNoteList(updated);
        if (onSaveNotes) onSaveNotes(updated);
    };

    const handleDeleteNote = (id) => {
        const updated = noteList.filter(n => n.id !== id);
        setNoteList(updated);
        if (onSaveNotes) onSaveNotes(updated);
        toast.info('Nota eliminada');
    };

    return (
        <div style={{ marginTop: '14px' }}>
            {/* Header del módulo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-note-sticky" style={{ fontSize: '0.95rem' }}></i>
                    </div>
                    <span style={{ fontSize: '0.92rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                        Notas Administración ({noteList.length})
                    </span>
                </div>

                {isAdmin && (
                    <button
                        type="button"
                        onClick={handleAddNote}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            color: '#fff',
                            fontWeight: '700',
                            fontSize: '0.78rem',
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <i className="fa-solid fa-plus"></i>
                        <span>Agregar Nota</span>
                    </button>
                )}
            </div>

            {noteList.length === 0 ? (
                <div 
                    style={{
                        padding: '24px',
                        borderRadius: '18px',
                        border: '2px dashed var(--border-color)',
                        background: 'rgba(0,0,0,0.015)',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.82rem'
                    }}
                >
                    <i className="fa-solid fa-sticky-note" style={{ fontSize: '2rem', opacity: 0.35, marginBottom: '6px', display: 'block' }}></i>
                    No hay notas asignadas a este ticket.
                    {isAdmin && (
                        <div style={{ marginTop: '6px' }}>
                            <button
                                type="button"
                                onClick={handleAddNote}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#f59e0b',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                Haz clic aquí para añadir la primera nota
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div 
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: '20px 16px',
                        paddingTop: '8px'
                    }}
                >
                    {noteList.map((note, index) => {
                        const theme = STICKY_COLORS[note.colorIndex % STICKY_COLORS.length];
                        const rotation = ROTATIONS[index % ROTATIONS.length];

                        return (
                            <div
                                key={note.id}
                                style={{
                                    position: 'relative',
                                    background: theme.cardBg,
                                    color: theme.text,
                                    borderRadius: '16px',
                                    border: `1.5px solid ${theme.border}`,
                                    padding: '16px 14px 12px 14px',
                                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 3px 8px rgba(0, 0, 0, 0.05)',
                                    transform: `rotate(${rotation}deg)`,
                                    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                }}
                                className="real-sticky-note"
                            >
                                {/* Cinta / Tape Scotch en la parte superior central */}
                                <div 
                                    style={{
                                        position: 'absolute',
                                        top: '-10px',
                                        left: '50%',
                                        transform: 'translateX(-50%) rotate(-1deg)',
                                        width: '72px',
                                        height: '20px',
                                        background: 'rgba(255, 255, 255, 0.65)',
                                        backdropFilter: 'blur(4px)',
                                        WebkitBackdropFilter: 'blur(4px)',
                                        border: '1px solid rgba(255, 255, 255, 0.85)',
                                        borderRadius: '3px',
                                        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.08)',
                                        pointerEvents: 'none',
                                        zIndex: 2
                                    }}
                                ></div>

                                {/* Botón de basurero arriba a la derecha */}
                                {isAdmin && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteNote(note.id)}
                                            title="Eliminar nota"
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: theme.text,
                                                opacity: 0.6,
                                                cursor: 'pointer',
                                                padding: '2px',
                                                fontSize: '0.85rem',
                                                transition: 'opacity 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                                        >
                                            <i className="fa-solid fa-trash-can"></i>
                                        </button>
                                    </div>
                                )}

                                {/* Cuerpo Editable */}
                                {isAdmin ? (
                                    <textarea
                                        rows="4"
                                        value={note.text || ''}
                                        onChange={(e) => handleUpdateNoteText(note.id, e.target.value)}
                                        placeholder="Escribe tu nota aquí..."
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            boxShadow: 'none',
                                            outline: 'none',
                                            padding: '4px 6px',
                                            margin: 0,
                                            resize: 'none',
                                            fontSize: '0.88rem',
                                            lineHeight: '1.45',
                                            color: theme.text,
                                            fontFamily: 'inherit',
                                            width: '100%',
                                            minHeight: '75px'
                                        }}
                                    ></textarea>
                                ) : (
                                    <p style={{ fontSize: '0.88rem', lineHeight: '1.45', color: theme.text, margin: 0, whiteSpace: 'pre-wrap', minHeight: '55px' }}>
                                        {note.text}
                                    </p>
                                )}

                                {/* Footer: Swatches de color + Timestamp */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: `1px dashed ${theme.text}22` }}>
                                    {isAdmin ? (
                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                            {STICKY_COLORS.map((c, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => handleUpdateNoteColor(note.id, idx)}
                                                    style={{
                                                        width: '13px',
                                                        height: '13px',
                                                        borderRadius: '50%',
                                                        background: c.cardBg,
                                                        border: `1.5px solid ${c.text}`,
                                                        cursor: 'pointer',
                                                        opacity: note.colorIndex === idx ? 1 : 0.45,
                                                        transform: note.colorIndex === idx ? 'scale(1.25)' : 'scale(1)',
                                                        boxShadow: note.colorIndex === idx ? `0 0 6px ${c.text}66` : 'none',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    title={c.name}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div></div>
                                    )}

                                    <span style={{ fontSize: '0.68rem', opacity: 0.75, fontWeight: '700', letterSpacing: '0.2px' }}>
                                        {note.updatedAt}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
