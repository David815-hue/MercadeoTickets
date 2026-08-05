import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login({ onLoginSuccess, currentTheme, onToggleTheme }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg('');

        try {
            const cleanUser = username.trim().toLowerCase();
            let email = cleanUser.includes('@') 
                ? cleanUser 
                : `${cleanUser}@farmacia.com`;

            // Autenticar en Supabase
            let { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            // Si falló el login y el usuario no especificó un dominio (@), intentar con el dominio de sistema (@system.com) para administradores (ej: mercadeo, admin, etc.)
            if (error && !cleanUser.includes('@')) {
                const systemEmail = `${cleanUser}@system.com`;
                const resSystem = await supabase.auth.signInWithPassword({
                    email: systemEmail,
                    password: password
                });
                if (!resSystem.error) {
                    data = resSystem.data;
                    error = null;
                }
            }

            if (error) throw error;

            // Obtener el perfil público del usuario
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('username, role')
                .eq('id', data.user.id)
                .single();

            if (profileError) throw profileError;

            // Retornar sesión
            const userSession = {
                id: data.user.id,
                username: profile.username,
                role: profile.role
            };

            onLoginSuccess(userSession);

        } catch (error) {
            console.error('Error de Login:', error);
            setErrorMsg(error.message || 'Usuario o contraseña incorrectos.');
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <div id="login-screen" className="screen">
            {/* Blobs animados de fondo */}
            <div className="login-blob-bg">
                <div className="login-blob-1"></div>
                <div className="login-blob-2"></div>
            </div>

            {/* Toggle de tema - esquina superior derecha */}
            <div className="login-theme-toggle">
                <button
                    className="theme-toggle-track"
                    onClick={onToggleTheme}
                    title={currentTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    aria-label="Alternar tema"
                >
                    <span className="theme-toggle-thumb">
                        {currentTheme === 'dark'
                            ? <i className="fa-solid fa-moon"></i>
                            : <i className="fa-solid fa-sun"></i>
                        }
                    </span>
                </button>
            </div>

            <div className="glass-card login-card">
                <div className="logo-area">
                    <div className="logo-circle" style={{ overflow: 'hidden', padding: 0, background: 'none', borderRadius: '18px', boxShadow: '0 10px 20px -5px rgba(220, 38, 38, 0.4)' }}>
                        <img src="/PF.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <h1>Tickets Mercadeo</h1>
                    <p>Sistema de Tickets de Mercadeo</p>
                </div>
                
                <form id="login-form" onSubmit={handleLogin}>
                    <div className="input-group">
                        <label htmlFor="login-username"><i className="fa-solid fa-user"></i> Nombre de Usuario</label>
                        <input 
                            type="text" 
                            id="login-username" 
                            placeholder="" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required 
                            autoComplete="username"
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="login-password"><i className="fa-solid fa-lock"></i> Contraseña</label>
                        <input 
                            type="password" 
                            id="login-password" 
                            placeholder="••••••••" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required 
                            autoComplete="current-password"
                        />
                    </div>
                    {errorMsg && (
                        <div id="login-error" className="error-alert">
                            <i className="fa-solid fa-triangle-exclamation"></i> 
                            <span>{errorMsg}</span>
                        </div>
                    )}
                    <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
                        <span>{isLoading ? 'Verificando...' : 'Iniciar Sesión'}</span>
                        {!isLoading && <i className="fa-solid fa-right-to-bracket"></i>}
                    </button>
                </form>

                <div className="login-footer">
                    <p>¿Problemas para ingresar? Contacta al administrador del sistema.</p>

                </div>
            </div>
        </div>
    );
}
