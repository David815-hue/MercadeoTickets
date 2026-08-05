import { useState, useEffect, useRef } from 'react';

const ASSIGNEE_COLORS = {
    'Yarleny':    { bg: '#a855f7', text: '#fff' },
    'Angelica':   { bg: '#0ea5e9', text: '#fff' },
    'Yoselyn':    { bg: '#ec4899', text: '#fff' },
    'Emma':       { bg: '#3b82f6', text: '#fff' },
    'Sin asignar':{ bg: '#64748b', text: '#fff' },
    'ALL':        { bg: 'var(--color-primary)', text: '#fff' },
};

function AssigneeAvatar({ name, size = 22 }) {
    if (name === 'ALL') {
        return (
            <span style={{
                width: size, height: size, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: size * 0.42 + 'px', fontWeight: 800, color: '#fff',
                flexShrink: 0, letterSpacing: '-0.5px'
            }}>
                <i className="fa-solid fa-users" style={{ fontSize: size * 0.38 + 'px' }}></i>
            </span>
        );
    }
    if (name === 'Sin asignar') {
        return (
            <span style={{
                width: size, height: size, borderRadius: '50%',
                background: 'rgba(100, 116, 139, 0.18)',
                border: '1.5px dashed #64748b',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: size * 0.42 + 'px', color: '#64748b',
                flexShrink: 0,
            }}>
                <i className="fa-solid fa-user-slash" style={{ fontSize: size * 0.38 + 'px' }}></i>
            </span>
        );
    }
    const colors = ASSIGNEE_COLORS[name] || { bg: '#6366f1', text: '#fff' };
    const initial = name.charAt(0).toUpperCase();
    return (
        <span style={{
            width: size, height: size, borderRadius: '50%',
            background: colors.bg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.44 + 'px', fontWeight: 800, color: colors.text,
            flexShrink: 0, letterSpacing: '0px',
            boxShadow: `0 0 0 2px ${colors.bg}33`,
        }}>
            {initial}
        </span>
    );
}

export default function CustomAssigneeFilterDropdown({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const options = [
        { value: 'ALL',          label: 'Todos los encargados' },
        { value: 'Yarleny',      label: 'Yarleny' },
        { value: 'Angelica',     label: 'Angelica' },
        { value: 'Yoselyn',      label: 'Yoselyn' },
        { value: 'Emma',         label: 'Emma' },
        { value: 'Sin asignar',  label: 'Sin asignar' },
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
        <div ref={dropdownRef} className="custom-select-container" style={{ minWidth: '190px' }}>
            <div
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    height: '40px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '0 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer',
                    gap: '8px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '0.84rem', minWidth: 0 }}>
                    <AssigneeAvatar name={selectedOption.value} size={22} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedOption.label}
                    </span>
                </div>
                <i className="fa-solid fa-chevron-down chevron" style={{ fontSize: '0.72rem', opacity: 0.55, flexShrink: 0 }}></i>
            </div>

            {isOpen && (
                <div className="custom-select-options" style={{ zIndex: 1000, minWidth: '200px' }}>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => { onChange(opt.value); setIsOpen(false); }}
                            style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', fontSize: '0.82rem', padding: '9px 12px',
                                cursor: 'pointer',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <AssigneeAvatar name={opt.value} size={26} />
                                <span style={{ fontWeight: opt.value === value ? 600 : 400 }}>
                                    {opt.label}
                                </span>
                            </div>
                            {opt.value === value && (
                                <i className="fa-solid fa-check check-icon"
                                   style={{ fontSize: '0.78rem', color: 'var(--color-primary)' }}>
                                </i>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
