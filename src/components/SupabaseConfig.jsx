import React, { useState } from 'react';
import { saveSupabaseConfig } from '../supabaseClient';

export default function SupabaseConfig() {
    const [url, setUrl] = useState('');
    const [anonKey, setAnonKey] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        saveSupabaseConfig(url, anonKey);
    };

    return (
        <div id="config-screen" className="screen">
            <div className="glass-card config-card">
                <div className="logo-area">
                    <i className="fa-solid fa-gears logo-icon"></i>
                    <h1>Configurar Supabase</h1>
                    <p>Ingresa tus credenciales de Supabase para enlazar la aplicación a tu base de datos.</p>
                </div>
                <form id="config-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="config-url">Supabase Project URL</label>
                        <input 
                            type="url" 
                            id="config-url" 
                            placeholder="https://xxxx.supabase.co" 
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required 
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="config-key">Supabase Anon Key</label>
                        <input 
                            type="password" 
                            id="config-key" 
                            placeholder="eyJhbGciOiJIUzI1NiIsIn..." 
                            value={anonKey}
                            onChange={(e) => setAnonKey(e.target.value)}
                            required 
                        />
                    </div>
                    <button type="submit" className="btn btn-primary btn-block">Conectar Proyecto</button>
                </form>
                <div className="config-instructions">
                    <h3><i className="fa-solid fa-circle-info"></i> ¿Cómo empezar?</h3>
                    <ol>
                        <li>Crea un proyecto en tu nueva cuenta de Supabase.</li>
                        <li>Ve a <strong>Project Settings &gt; API</strong> y copia la URL y la llave Anon.</li>
                        <li>Ejecuta el archivo <code>schema.sql</code> en el editor de SQL de Supabase para preparar las tablas.</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
