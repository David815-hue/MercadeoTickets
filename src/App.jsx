import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import SupabaseConfig from './components/SupabaseConfig';
import Login from './components/Login';
import PharmacyDashboard from './components/PharmacyDashboard';
import AdminDashboard from './components/AdminDashboard';
import { Toaster } from 'sonner';

export default function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [hasConfig, setHasConfig] = useState(false);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    useEffect(() => {
        // 1. Verificar si Supabase está configurado
        const configured = isSupabaseConfigured();
        setHasConfig(configured);

        if (configured) {
            const CURRENT_SESSION_VERSION = 'v2.1_rls_fix';
            const savedVersion = localStorage.getItem('ticket_system_version');

            // Si la versión de sesión guardada es obsoleta, purgar localStorage automáticamente
            if (savedVersion !== CURRENT_SESSION_VERSION) {
                localStorage.removeItem('ticket_system_session');
                localStorage.setItem('ticket_system_version', CURRENT_SESSION_VERSION);
                setCurrentUser(null);
            } else {
                const savedSession = localStorage.getItem('ticket_system_session');
                if (savedSession) {
                    try {
                        setCurrentUser(JSON.parse(savedSession));
                    } catch (e) {
                        localStorage.removeItem('ticket_system_session');
                    }
                }
            }

            // 3. Sincronizar y validar sesión activa de Supabase Auth
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    supabase
                        .from('profiles')
                        .select('username, role')
                        .eq('id', session.user.id)
                        .single()
                        .then(({ data: profile }) => {
                            if (profile) {
                                const userObj = {
                                    id: session.user.id,
                                    username: profile.username,
                                    role: profile.role
                                };
                                setCurrentUser(userObj);
                                localStorage.setItem('ticket_system_session', JSON.stringify(userObj));
                                localStorage.setItem('ticket_system_version', CURRENT_SESSION_VERSION);
                            }
                        });
                } else {
                    // Si no hay sesión válida activa en Supabase Auth, purgar automáticamente
                    localStorage.removeItem('ticket_system_session');
                    setCurrentUser(null);
                }
            });
        }
        setLoading(false);
    }, []);

    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const handleLoginSuccess = (user) => {
        localStorage.setItem('ticket_system_version', 'v2.1_rls_fix');
        localStorage.setItem('ticket_system_session', JSON.stringify(user));
        setCurrentUser(user);
    };

    const handleLogout = () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = async () => {
        setShowLogoutConfirm(false);
        await supabase.auth.signOut();
        localStorage.removeItem('ticket_system_session');
        setCurrentUser(null);
    };

    if (loading) {
        return (
            <div className="screen">
                <div className="empty-state">
                    <i className="fa-solid fa-circle-notch fa-spin fa-2x"></i>
                    <p>Iniciando sistema...</p>
                </div>
            </div>
        );
    }

    // Si no está configurado Supabase, forzar setup
    if (!hasConfig) {
        return <SupabaseConfig />;
    }

    // Si no hay sesión iniciada, mostrar Login
    if (!currentUser) {
        return (
            <>
                <Toaster position="top-right" richColors theme={theme} />
                <Login onLoginSuccess={handleLoginSuccess} currentTheme={theme} onToggleTheme={toggleTheme} />
            </>
        );
    }

    // Router por Roles
    return (
        <>
            <Toaster position="top-right" richColors theme={theme} />
            {currentUser.role === 'admin' ? (
                <AdminDashboard currentUser={currentUser} onLogout={handleLogout} currentTheme={theme} onToggleTheme={toggleTheme} />
            ) : (
                <PharmacyDashboard currentUser={currentUser} onLogout={handleLogout} currentTheme={theme} onToggleTheme={toggleTheme} />
            )}

            {showLogoutConfirm && (
                <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center', padding: '30px' }}>
                        <div style={{ fontSize: '2.5rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
                            <i className="fa-solid fa-right-from-bracket"></i>
                        </div>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                            ¿Cerrar Sesión?
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.4' }}>
                            ¿Estás seguro de que deseas cerrar tu sesión en el sistema de tickets?
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={() => setShowLogoutConfirm(false)}
                                style={{ flex: 1, padding: '10px 16px', fontSize: '0.85rem', borderRadius: '8px' }}
                            >
                                Cancelar
                            </button>
                            <button 
                                className="btn btn-danger" 
                                onClick={confirmLogout}
                                style={{ flex: 1, padding: '10px 16px', fontSize: '0.85rem', borderRadius: '8px' }}
                            >
                                Sí, salir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
