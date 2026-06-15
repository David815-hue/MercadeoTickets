import { useEffect, useRef, useState } from 'react';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

// Componente KanbanCard (Tarjeta)
function KanbanCard({ ticket, onOpenChat, onOpenDetails, isUnread }) {
    const cardRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const element = cardRef.current;
        if (!element) return;

        return draggable({
            element,
            getInitialData: () => ({ ticketId: ticket.id, currentStatus: ticket.status }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => setIsDragging(false),
        });
    }, [ticket.id, ticket.status]);

    const fecha = new Date(ticket.created_at).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit'
    });

    return (
        <div 
            ref={cardRef} 
            className={`kanban-card ${isDragging ? 'dragging' : ''}`}
            onClick={() => onOpenDetails(ticket)}
        >
            <div className="kanban-card-header">
                <span className="kanban-card-id">
                    {ticket.ticket_number ? `TK-${ticket.ticket_number}` : `#${ticket.id.substring(0, 8)}`}
                </span>
                <span className="kanban-card-date">{fecha}</span>
            </div>
            <div className="kanban-card-body">
                <h4>
                    <i className="fa-solid fa-hospital"></i> {ticket.pharmacy_name}
                </h4>
                <p className="kanban-card-desc">{ticket.description}</p>
            </div>
            <div className="kanban-card-footer" onClick={(e) => e.stopPropagation()}>
                {isUnread && (
                    <span className="kanban-card-unread">
                        Nuevo mensaje
                    </span>
                )}
                <button 
                    className="kanban-card-chat-btn"
                    onClick={() => onOpenChat(ticket)}
                >
                    <i className="fa-regular fa-comments"></i> Chat
                </button>
            </div>
        </div>
    );
}

// Componente KanbanColumn (Columna)
function KanbanColumn({ status, title, tickets, onOpenChat, onOpenDetails, unreadTicketIds, columnClass }) {
    const columnRef = useRef(null);
    const [isDraggedOver, setIsDraggedOver] = useState(false);

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
        >
            <div className="kanban-column-header">
                <h3>{title}</h3>
                <span className="column-count-badge">{tickets.length}</span>
            </div>
            <div className="kanban-column-body">
                {tickets.map(ticket => (
                    <KanbanCard 
                        key={ticket.id} 
                        ticket={ticket} 
                        onOpenChat={onOpenChat}
                        onOpenDetails={onOpenDetails}
                        isUnread={unreadTicketIds.has(ticket.id)}
                    />
                ))}
            </div>
        </div>
    );
}

// Componente Principal KanbanBoard
export default function KanbanBoard({ tickets, onOpenChat, onOpenDetails, onStatusChange, unreadTicketIds }) {
    
    // Configurar monitor global para procesar cuando se suelta una tarjeta
    useEffect(() => {
        return monitorForElements({
            onDrop({ source, location }) {
                const destination = location.current.dropTargets[0];
                if (!destination) return;

                const ticketId = source.data.ticketId;
                const sourceStatus = source.data.currentStatus;
                const targetStatus = destination.data.status;

                if (ticketId && targetStatus && sourceStatus !== targetStatus) {
                    onStatusChange(ticketId, targetStatus);
                }
            }
        });
    }, [onStatusChange]);

    // Filtrar tickets por cada estado
    const aceptados = tickets.filter(t => t.status === 'Aceptado');
    const enRevision = tickets.filter(t => t.status === 'En revision');
    const resueltos = tickets.filter(t => t.status === 'Resuelto');

    return (
        <div className="kanban-board-container">
            <div className="kanban-board">
                <KanbanColumn 
                    status="Aceptado" 
                    title="Aceptados" 
                    tickets={aceptados} 
                    onOpenChat={onOpenChat}
                    onOpenDetails={onOpenDetails}
                    unreadTicketIds={unreadTicketIds}
                    columnClass="kanban-column-aceptado"
                />
                <KanbanColumn 
                    status="En revision" 
                    title="En revisión" 
                    tickets={enRevision} 
                    onOpenChat={onOpenChat}
                    onOpenDetails={onOpenDetails}
                    unreadTicketIds={unreadTicketIds}
                    columnClass="kanban-column-revision"
                />
                <KanbanColumn 
                    status="Resuelto" 
                    title="Resueltos" 
                    tickets={resueltos} 
                    onOpenChat={onOpenChat}
                    onOpenDetails={onOpenDetails}
                    unreadTicketIds={unreadTicketIds}
                    columnClass="kanban-column-resuelto"
                />
            </div>
        </div>
    );
}
