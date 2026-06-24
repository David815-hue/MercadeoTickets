import { useState, useEffect, useRef } from 'react';

export default function CustomPriorityDropdown({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const allOptions = [
        { value: 'Sin prioridad', label: 'Sin prioridad', dotClass: 'finalizado' },
        { value: 'Normal', label: 'Normal', dotClass: 'aprobado' },
        { value: 'Alta', label: 'Alta', dotClass: 'en_revision' },
        { value: 'Urgente', label: 'Urgente', dotClass: 'rechazado' }
    ];

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = allOptions.find(o => o.value === value) || allOptions[0];

    return (
        <div ref={dropdownRef} className="custom-select-container">
            <div 
                className={`custom-select-trigger ${isOpen ? 'open' : ''} status-trigger-${selectedOption.dotClass}`} 
                onClick={() => setIsOpen(!isOpen)}
                style={{ minWidth: '110px' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`status-dot ${selectedOption.dotClass}`}></span>
                    <span>{selectedOption.label}</span>
                </div>
                <i className="fa-solid fa-chevron-down chevron"></i>
            </div>
            {isOpen && (
                <div className="custom-select-options">
                    {allOptions.map(opt => (
                        <div 
                            key={opt.value}
                            className={`custom-select-option opt-${opt.dotClass} ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={`status-dot ${opt.dotClass}`}></span>
                                <span>{opt.label}</span>
                            </div>
                            {opt.value === value && <i className="fa-solid fa-check check-icon"></i>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
