import { useEffect, useRef, useState } from 'react';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { toast } from 'sonner';
import SlaProgressBar from './SlaProgressBar';
import { getPharmacyDisplayName } from '../utils/pharmacyMap';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Devuelve las iniciales del nombre para el avatar (máx 2 caracteres) */
function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

/** Color del avatar basado en el nombre (hash determinístico) */
const AVATAR_COLORS = [
    ['#4f46e5', '#818cf8'],   // índigo
    ['#059669', '#34d399'],   // verde
    ['#d97706', '#fbbf24'],   // ámbar
    ['#dc2626', '#f87171'],   // rojo
    ['#7c3aed', '#a78bfa'],   // violeta
    ['#0891b2', '#22d3ee'],   // cian
    ['#be185d', '#f472b6'],   // rosa
    ['#65a30d', '#a3e635'],   // lima
];

function getAvatarColors(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

function KanbanCard({ ticket, onOpenDetails, isUnread }) {
    const cardRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [justDropped, setJustDropped] = useState(false);

    const displayName = getPharmacyDisplayName(ticket.pharmacy_name);
    const [avatarFrom, avatarTo] = getAvatarColors(displayName);
    const initials = getInitials(displayName);
    const ticketLabel = ticket.ticket_number ? `PF-${ticket.ticket_number}` : `#${ticket.id.substring(0, 6).toUpperCase()}`;

    const fecha = new Date(ticket.created_at).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit'
    });

    useEffect(() => {
        const element = cardRef.current;
        if (!element) return;

        return draggable({
            element,
            getInitialData: () => ({ ticketId: ticket.id, currentStatus: ticket.status }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => {
                setIsDragging(false);
                setJustDropped(true);
                setTimeout(() => setJustDropped(false), 600);
            },
            onGenerateDragPreview({ nativeSetDragImage }) {
                setCustomNativeDragPreview({
                    nativeSetDragImage,
                    render({ container }) {
                        const preview = document.createElement('div');
                        preview.style.cssText = `
                            background: linear-gradient(135deg, ${avatarFrom}22, ${avatarTo}11);
                            border: 1.5px solid ${avatarFrom};
                            border-radius: 10px;
                            padding: 10px 14px;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            font-family: Inter, sans-serif;
                            box-shadow: 0 8px 24px rgba(0,0,0,0.35);
                            backdrop-filter: blur(12px);
                            min-width: 200px;
                            max-width: 260px;
                        `;

                        const avatarEl = document.createElement('div');
                        avatarEl.style.cssText = `
                            width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
                            background: linear-gradient(135deg, ${avatarFrom}, ${avatarTo});
                            display: flex; align-items: center; justify-content: center;
                            color: white; font-weight: 800; font-size: 0.8rem; letter-spacing: 1px;
                        `;
                        avatarEl.textContent = initials;

                        const textEl = document.createElement('div');
                        textEl.style.cssText = 'flex: 1; overflow: hidden;';

                        const nameEl = document.createElement('div');
                        nameEl.style.cssText = `color: white; font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
                        nameEl.textContent = displayName || 'Farmacia';

                        const idEl = document.createElement('div');
                        idEl.style.cssText = `color: ${avatarFrom}; font-size: 0.72rem; font-weight: 700; margin-top: 2px;`;
                        idEl.textContent = ticketLabel;

                        textEl.appendChild(nameEl);
                        textEl.appendChild(idEl);
                        preview.appendChild(avatarEl);
                        preview.appendChild(textEl);
                        container.appendChild(preview);
                    }
                });
            }
        });
    }, [ticket.id, ticket.status, avatarFrom, avatarTo, initials, displayName, ticketLabel]);

    const priorityDotClass = ticket.priority
        ? ticket.priority.toLowerCase().replace(/\s+/g, '-')
        : null;

    return (
        <div
            ref={cardRef}
            className={`kanban-card ${isDragging ? 'dragging' : ''} ${justDropped ? 'card-drop-anim' : ''}`}
            onClick={() => onOpenDetails(ticket)}
        >
            {/* Header: ID + dot prioridad + icono tipo + fecha — todo en una línea */}
            <div className="kanban-card-header">
                <span className="kanban-card-id">{ticketLabel}</span>
                <div className="kanban-card-meta">
                    {ticket.priority && (
                        <span
                            className={`kanban-priority-dot ${priorityDotClass}`}
                            data-tooltip={`Prioridad: ${ticket.priority}`}
                        />
                    )}
                    {ticket.request_type && (
                        <i
                            className={`kanban-type-icon ${getRequestTypeIcon(ticket.request_type)}`}
                            data-tooltip={`Categoría: ${ticket.request_type}`}
                        />
                    )}
                    <span className="kanban-card-date">{fecha}</span>
                </div>
            </div>

            {/* Farmacia: Avatar + nombre */}
            <div className="kanban-pharmacy-row">
                <div
                    className="kanban-avatar"
                    style={{ background: `linear-gradient(135deg, ${avatarFrom}, ${avatarTo})` }}
                    data-tooltip={displayName}
                >
                    {initials}
                </div>
                <div className="kanban-pharmacy-info">
                    <span className="kanban-pharmacy-name">{displayName}</span>
                    {isUnread && (
                        <span className="kanban-unread-dot" />
                    )}
                </div>
            </div>

            {/* Descripción */}
            <p className="kanban-card-desc">{ticket.description}</p>

            {/* SLA */}
            <SlaProgressBar ticket={ticket} />

        </div>
    );
}

// ── Columna ───────────────────────────────────────────────────────────────────

const COLUMN_META = {
    'Recibido':    { icon: 'fa-solid fa-inbox',            color: '#06b6d4', label: 'Recibidos'   },
    'En Proceso':  { icon: 'fa-solid fa-gears',            color: '#4f46e5', label: 'En Proceso'  },
    'En Revision': { icon: 'fa-solid fa-magnifying-glass', color: '#f59e0b', label: 'En Revisión' },
    'Aprobado':    { icon: 'fa-solid fa-circle-check',     color: '#10b981', label: 'Aprobados'   },
    'Finalizado':  { icon: 'fa-solid fa-flag-checkered',   color: '#64748b', label: 'Finalizados' },
    'Rechazado':   { icon: 'fa-solid fa-circle-xmark',     color: '#ef4444', label: 'Rechazados'  },
};

function KanbanColumn({ status, title, tickets, onOpenDetails, unreadTicketIds, columnClass }) {
    const columnRef = useRef(null);
    const [isDraggedOver, setIsDraggedOver] = useState(false);
    const meta = COLUMN_META[status] || { icon: 'fa-solid fa-list', color: '#94a3b8', label: title };

    useEffect(() => {
        const element = columnRef.current;
        if (!element) return;

        return dropTargetForElements({
            element,
            getData: () => ({ status }),
            onDragEnter: () => setIsDraggedOver(true),
            onDragLeave: () => setIsDraggedOver(false),
            onDrop: () => setIsDraggedOver(false),
        });
    }, [status]);

    return (
        <div
            ref={columnRef}
            className={`kanban-column ${columnClass} ${isDraggedOver ? 'drag-over' : ''}`}
            style={{ '--col-color': meta.color }}
        >
            {/* Header con icono y gradiente */}
            <div className="kanban-column-header">
                <div className="kanban-col-title">
                    <span
                        className="kanban-col-icon"
                        style={{ color: meta.color, background: `${meta.color}18` }}
                    >
                        <i className={meta.icon}></i>
                    </span>
                    <h3>{meta.label}</h3>
                </div>
                <span
                    className="column-count-badge"
                    style={{ borderColor: `${meta.color}40`, color: meta.color }}
                >
                    {tickets.length}
                </span>
            </div>

            <div className="kanban-column-body">
                {tickets.length === 0 ? (
                    <div className="kanban-empty-state">
                        <i className={meta.icon} style={{ color: `${meta.color}50`, fontSize: '2rem', marginBottom: '8px' }}></i>
                        <span>Sin solicitudes</span>
                    </div>
                ) : (
                    tickets.map(ticket => (
                        <KanbanCard
                            key={ticket.id}
                            ticket={ticket}
                            onOpenDetails={onOpenDetails}
                            isUnread={unreadTicketIds.has(ticket.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// ── Board Principal ───────────────────────────────────────────────────────────

export default function KanbanBoard({ tickets, onOpenDetails, onStatusChange, unreadTicketIds }) {

    useEffect(() => {
        return monitorForElements({
            onDrop({ source, location }) {
                const destination = location.current.dropTargets[0];
                if (!destination) return;

                const ticketId = source.data.ticketId;
                const sourceStatus = source.data.currentStatus;
                const targetStatus = destination.data.status;

                if (ticketId && targetStatus && sourceStatus !== targetStatus) {
                    if (targetStatus === 'Recibido') {
                        toast.warning('No puedes cambiar el estado de un ticket a Recibido.');
                        return;
                    }
                    onStatusChange(ticketId, targetStatus);
                }
            }
        });
    }, [onStatusChange]);

    const recibidos  = tickets.filter(t => t.status === 'Recibido');
    const enProceso  = tickets.filter(t => t.status === 'En Proceso');
    const enRevision = tickets.filter(t => t.status === 'En Revision');
    const aprobados  = tickets.filter(t => t.status === 'Aprobado');
    const finalizados = tickets.filter(t => t.status === 'Finalizado');
    const rechazados = tickets.filter(t => t.status === 'Rechazado');

    return (
        <div className="kanban-board-container">
            <div className="kanban-board">
                <KanbanColumn status="Recibido"    title="Recibidos"    tickets={recibidos}   onOpenDetails={onOpenDetails} unreadTicketIds={unreadTicketIds} columnClass="kanban-column-recibido"   />
                <KanbanColumn status="En Proceso"  title="En Proceso"   tickets={enProceso}   onOpenDetails={onOpenDetails} unreadTicketIds={unreadTicketIds} columnClass="kanban-column-proceso"    />
                <KanbanColumn status="En Revision" title="En revisión"  tickets={enRevision}  onOpenDetails={onOpenDetails} unreadTicketIds={unreadTicketIds} columnClass="kanban-column-revision"   />
                <KanbanColumn status="Aprobado"    title="Aprobados"    tickets={aprobados}   onOpenDetails={onOpenDetails} unreadTicketIds={unreadTicketIds} columnClass="kanban-column-aprobado"   />
                <KanbanColumn status="Finalizado"  title="Finalizados"  tickets={finalizados} onOpenDetails={onOpenDetails} unreadTicketIds={unreadTicketIds} columnClass="kanban-column-finalizado" />
                <KanbanColumn status="Rechazado"   title="Rechazados"   tickets={rechazados}  onOpenDetails={onOpenDetails} unreadTicketIds={unreadTicketIds} columnClass="kanban-column-rechazado"  />
            </div>
        </div>
    );
}
