import React from 'react';

// ── Helpers para cálculo de SLA (duplicados de forma segura aquí para aislamiento) ──

function getStartCountingDate(createdAtString) {
    if (!createdAtString) return new Date();
    const createdDate = new Date(createdAtString);
    createdDate.setHours(0, 0, 0, 0);
    const dayOfWeek = createdDate.getDay();
    const daysToAdd = (4 - dayOfWeek + 7) % 7;
    const startDate = new Date(createdDate);
    startDate.setDate(createdDate.getDate() + daysToAdd);
    startDate.setHours(0, 0, 0, 0);
    return startDate;
}

function getElapsedDays(ticket) {
    if (!ticket || !ticket.created_at) return { days: 0, hasStarted: false, startDate: new Date() };
    const startDate = getStartCountingDate(ticket.created_at);
    const endDate = ticket.finalized_at ? new Date(ticket.finalized_at) : new Date();
    endDate.setHours(0, 0, 0, 0);
    
    if (endDate < startDate) {
        return { days: 0, hasStarted: false, startDate };
    }
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return { days: diffDays, hasStarted: true, startDate };
}

function getSLALimitDays(ticket) {
    if (!ticket || !ticket.request_type) return Infinity;
    const type = ticket.request_type;
    const t = type.toLowerCase();
    const formData = ticket.form_data || {};

    if (t.includes('artes digital') || t.includes('artes digitales')) return 5;
    if (t.includes('rotulación interna') || t.includes('rotulacion interna')) {
        const tipoRotulacion = formData.tipoRotulacion || '';
        return tipoRotulacion === 'Cubre Caja' ? 10 : 3;
    }
    if (t.includes('material para impresión') || t.includes('material para impresion')) return 10;
    if (t.includes('recetarios médicos') || t.includes('recetarios medicos') || t.includes('recetario')) return 20;
    if (
        t.includes('insumos / utilería') ||
        t.includes('insumos / utileria') ||
        t.includes('utilería') ||
        t.includes('utileria') ||
        t.includes('insumos')
    ) {
        return 3;
    }
    return Infinity;
}

export default function SlaProgressBar({ ticket, showDetails = false }) {
    if (!ticket) return null;

    const daysInfo = getElapsedDays(ticket);
    const slaLimit = getSLALimitDays(ticket);
    const isFinished = ['Finalizado', 'Aprobado', 'Rechazado'].includes(ticket.status);

    if (slaLimit === Infinity) {
        return (
            <div className="sla-progress-container no-limit">
                {showDetails && <span className="sla-label">Tiempo de entrega: Sin límite definido</span>}
            </div>
        );
    }

    const { days, hasStarted, startDate } = daysInfo;
    
    // Calcular porcentaje de SLA consumido
    const rawPercentage = (days / slaLimit) * 100;
    const percentage = Math.min(Math.max(rawPercentage, 0), 100);
    const isOverdue = hasStarted && days > slaLimit && !isFinished;

    // Determinar la clase de estado y color
    let statusClass = 'sla-ok'; // Verde (< 50%)
    if (isFinished) {
        statusClass = 'sla-completed'; // Completado (Azul/Gris)
    } else if (isOverdue) {
        statusClass = 'sla-danger'; // Vencido (Rojo)
    } else if (rawPercentage >= 50) {
        statusClass = 'sla-warning'; // Riesgo (Naranja/Amarillo)
    }

    const formattedStartDate = startDate.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit'
    });

    return (
        <div className={`sla-progress-container ${statusClass} ${showDetails ? 'detailed' : 'compact'}`}>
            <div className="sla-header-row">
                <span className="sla-title">
                    <i className={isFinished ? "fa-solid fa-calendar-check" : isOverdue ? "fa-solid fa-triangle-exclamation" : "fa-regular fa-clock"}></i>
                    {isFinished 
                        ? `Tiempo de entrega Finalizado` 
                        : !hasStarted 
                            ? `Tiempo de entrega Pendiente` 
                            : `Tiempo de entrega Activo`
                    }
                </span>
                <span className="sla-counter">
                    {!hasStarted 
                        ? `Inicia el ${formattedStartDate}`
                        : `${days}d de ${slaLimit}d (${Math.round(rawPercentage)}%)`
                    }
                </span>
            </div>

            {hasStarted && (
                <div className="sla-track">
                    <div 
                        className="sla-bar" 
                        style={{ width: `${percentage}%` }}
                    >
                        <span className="sla-bar-glow"></span>
                    </div>
                </div>
            )}
            
            {showDetails && isOverdue && (
                <div className="sla-alert-text">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>¡Atención! Este ticket supera el límite de resolución de {slaLimit} días por {days - slaLimit}d.</span>
                </div>
            )}
        </div>
    );
}
