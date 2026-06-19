import { useState, useEffect, useRef } from 'react';

export default function FormSelect({ id, options = [], value, onChange, className = '', placeholder = 'Seleccione una opción...', disabled = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Normalize options to [{ value, label }]
    const normalizedOptions = options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return { value: opt.value, label: opt.label || opt.value };
        }
        return { value: opt, label: opt };
    });

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = normalizedOptions.find(o => o.value === value);

    const handleOptionClick = (selectedValue) => {
        if (onChange) {
            onChange({
                target: {
                    id: id,
                    value: selectedValue
                }
            });
        }
        setIsOpen(false);
    };

    return (
        <div ref={dropdownRef} className="form-select-container">
            <div 
                className={`form-select-trigger ${isOpen ? 'open' : ''} ${disabled ? 'input-readonly' : ''} ${className}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span>{selectedOption ? selectedOption.label : placeholder}</span>
                <i className="fa-solid fa-chevron-down form-select-chevron"></i>
            </div>
            {isOpen && (
                <div className="form-select-dropdown">
                    {normalizedOptions.map(opt => (
                        <div 
                            key={opt.value}
                            className={`form-select-option ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => handleOptionClick(opt.value)}
                        >
                            <span>{opt.label}</span>
                            {opt.value === value && <i className="fa-solid fa-check check-icon"></i>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
