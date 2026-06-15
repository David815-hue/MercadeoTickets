import { useState, useEffect, useRef } from 'react';

export default function CustomFilterDropdown({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'ALL', label: 'Todos los estados', dotClass: 'all' },
        { value: 'Aceptado', label: 'Aceptado', dotClass: 'aceptado' },
        { value: 'En revision', label: 'En revisión', dotClass: 'en_revision' },
        { value: 'Resuelto', label: 'Resuelto', dotClass: 'resuelto' }
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

    const selectedOption = options.find(o => o.value === value) || options[0];

    return (
        <div ref={dropdownRef} className="custom-select-container" style={{ minWidth: '180px' }}>
            <div 
                className={`custom-select-trigger ${isOpen ? 'open' : ''} status-trigger-${selectedOption.dotClass}`} 
                onClick={() => setIsOpen(!isOpen)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`status-dot ${selectedOption.dotClass}`}></span>
                    <span>{selectedOption.label}</span>
                </div>
                <i className="fa-solid fa-chevron-down chevron"></i>
            </div>
            {isOpen && (
                <div className="custom-select-options">
                    {options.map(opt => (
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
