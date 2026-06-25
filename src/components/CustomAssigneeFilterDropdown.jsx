import { useState, useEffect, useRef } from 'react';

export default function CustomAssigneeFilterDropdown({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'ALL', label: 'Todos los encargados' },
        { value: 'Yarleny', label: 'Yarleny' },
        { value: 'Angelica', label: 'Angelica' },
        { value: 'Yosselin', label: 'Yosselin' },
        { value: 'Yoselin', label: 'Yoselin' },
        { value: 'Emma', label: 'Emma' },
        { value: 'Sin asignar', label: 'Sin asignar' }
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
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`} 
                onClick={() => setIsOpen(!isOpen)}
                style={{ height: '40px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '10px' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <i className="fa-solid fa-user-gear" style={{ color: 'var(--color-primary)', opacity: 0.8 }}></i>
                    <span>{selectedOption.label}</span>
                </div>
                <i className="fa-solid fa-chevron-down chevron" style={{ fontSize: '0.75rem', opacity: 0.6 }}></i>
            </div>
            {isOpen && (
                <div className="custom-select-options" style={{ zIndex: 1000 }}>
                    {options.map(opt => (
                        <div 
                            key={opt.value}
                            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', padding: '10px 14px' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fa-solid fa-user" style={{ fontSize: '0.75rem', opacity: 0.5 }}></i>
                                <span>{opt.label}</span>
                            </div>
                            {opt.value === value && <i className="fa-solid fa-check check-icon" style={{ fontSize: '0.78rem', color: 'var(--color-primary)' }}></i>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
