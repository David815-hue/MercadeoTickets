import { useState, useEffect, useRef } from 'react';

const ASSIGNEE_COLORS = {
    'Yarleny':    { bg: '#a855f7' },
    'Angelica':   { bg: '#0ea5e9' },
    'Yosselin':   { bg: '#ec4899' },
    'Emma':       { bg: '#3b82f6' },
    'Sin asignar':{ bg: '#64748b' },
};

function AssigneeAvatar({ name, size = 20 }) {
    if (name === 'Sin asignar') {
        return (
            <span style={{
                width: size, height: size, borderRadius: '50%',
                background: 'rgba(100, 116, 139, 0.15)',
                border: '1.5px dashed #64748b',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#64748b', flexShrink: 0,
            }}>
                <i className="fa-solid fa-user-slash" style={{ fontSize: size * 0.4 + 'px' }}></i>
            </span>
        );
    }
    const colors = ASSIGNEE_COLORS[name] || { bg: '#6366f1' };
    const initial = (name || '?').charAt(0).toUpperCase();
    return (
        <span style={{
            width: size, height: size, borderRadius: '50%',
            background: colors.bg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.46 + 'px', fontWeight: 800, color: '#fff',
            flexShrink: 0,
            boxShadow: `0 0 0 2px ${colors.bg}33`,
        }}>
            {initial}
        </span>
    );
}

export default function CustomAssigneeDropdown({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'Yarleny',     label: 'Yarleny' },
        { value: 'Angelica',    label: 'Angelica' },
        { value: 'Yosselin',    label: 'Yosselin' },
        { value: 'Emma',        label: 'Emma' },
        { value: 'Sin asignar', label: 'Sin asignar' },
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

    const selectedOption = options.find(o => o.value === value) || options[options.length - 1];

    return (
        <div ref={dropdownRef} className="custom-select-container" style={{ minWidth: '150px' }}>
            <div
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    height: '34px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '0 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', gap: '8px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem' }}>
                    <AssigneeAvatar name={selectedOption.value} size={20} />
                    <span>{selectedOption.label}</span>
                </div>
                <i className="fa-solid fa-chevron-down chevron" style={{ fontSize: '0.7rem', opacity: 0.6 }}></i>
            </div>

            {isOpen && (
                <div className="custom-select-options" style={{ zIndex: 1000, top: 'calc(100% + 4px)', width: '100%' }}>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => { onChange(opt.value); setIsOpen(false); }}
                            style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', fontSize: '0.8rem', padding: '8px 12px',
                                cursor: 'pointer',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                <AssigneeAvatar name={opt.value} size={24} />
                                <span>{opt.label}</span>
                            </div>
                            {opt.value === value && (
                                <i className="fa-solid fa-check check-icon"
                                   style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}>
                                </i>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
