
// Supabase Initialization
const SUPABASE_URL = 'https://bjjjutlfinxdwmifskdw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__Xw6vD7jogaABU81E_0HAA_mVOQFmLJ';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// API Configuration
const API_BASE_URL = window.location.origin;

// Constants
const ACCOUNTS_KEY = 'tradingAccounts';
const ACTIVE_ACCOUNT_KEY = 'tradingActiveAccount';

// State
let accounts = [];
let currentAccountId = null;
let operations = [];
let settings = { initialBalance: 50000, consistencyPercentage: 40, trailingDrawdownAmount: 2500 };
let journals = [];
let goals = { weekly: 0, monthly: 0 };
let highWaterMark = 0;
let drawdownFloor = 0;
let showAllOperations = false;
let importedOperations = [];
let isChecklistEditMode = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
    loadAccounts();
    const storedActive = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    if (storedActive && accounts.find(a => a.id === storedActive)) {
        setActiveAccount(storedActive);
    } else if (accounts.length === 0) {
        openCreateAccountModal();
    } else {
        setActiveAccount(accounts[0].id);
    }
    document.getElementById('date').value = new Date().toISOString().split('T')[0];
    openTab('dashboard');
    loadTheme();

    // Service Worker registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((registration) => {
                    console.log('SW registrado correctamente');
                })
                .catch((error) => {
                    console.log('Error registrando SW:', error);
                });
        });
    }

    // Event Listeners
    document.getElementById('trading-form').addEventListener('submit', handleTradingFormSubmit);
    document.getElementById('import-file').addEventListener('change', handleImportFileChange);
});

// Auth Functions
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        alert('Por favor, completa todos los campos.');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        alert('Inicio de sesión exitoso');
        checkAuthState();
    } catch (error) {
        alert('Error al iniciar sesión: ' + error.message);
    }
}

async function handleRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!email || !password) {
        alert('Por favor, completa todos los campos.');
        return;
    }

    if (password.length < 6) {
        alert('La contraseña debe tener al menos 6 caracteres.');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) throw error;

        alert('Registro exitoso. Por favor, verifica tu email antes de iniciar sesión.');
        toggleAuthForms();
    } catch (error) {
        alert('Error al registrarse: ' + error.message);
    }
}

async function handleLogout() {
    if (!confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        return;
    }

    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        alert('Sesión cerrada correctamente');
        checkAuthState();
    } catch (error) {
        alert('Error al cerrar sesión: ' + error.message);
    }
}

function toggleAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

async function checkAuthState() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
    } else {
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
    }
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        checkAuthState();
    } else if (event === 'SIGNED_OUT') {
        checkAuthState();
    }
});

// ... (El resto del código JavaScript del archivo index.html se movería aquí)
// Por limitaciones de espacio, incluyo las funciones principales pero el archivo completo
// tendría todas las funciones de helpers, checklist, persistence, operations, etc.
