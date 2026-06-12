import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import SupabaseConfig from './components/SupabaseConfig';
import Login from './components/Login';
import PharmacyDashboard from './components/PharmacyDashboard';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [hasConfig, setHasConfig] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Verificar si Supabase está configurado
        const configured = isSupabaseConfigured();
        setHasConfig(configured);

        if (configured) {
            // 2. Comprobar sesión guardada localmente
            const savedSession = localStorage.getItem('ticket_system_session');
            if (savedSession) {
                try {
                    setCurrentUser(JSON.parse(savedSession));
                } catch (e) {
                    localStorage.removeItem('ticket_system_session');
                }
            }
        }
        setLoading(false);
    }, []);

    const handleLoginSuccess = (user) => {
        setCurrentUser(user);
    };

    const handleLogout = async () => {
        if (window.confirm('¿Deseas cerrar sesión?')) {
            await supabase.auth.signOut();
            localStorage.removeItem('ticket_system_session');
            setCurrentUser(null);
        }
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
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    // Router por Roles
    if (currentUser.role === 'admin') {
        return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />;
    } else {
        return <PharmacyDashboard currentUser={currentUser} onLogout={handleLogout} />;
    }
}
