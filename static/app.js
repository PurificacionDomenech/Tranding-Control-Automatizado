
// Supabase Initialization
const SUPABASE_URL = 'https://bjjjutlfinxdwmifskdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqamp1dGxmaW54ZHdtaWZza2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNDIzNDAsImV4cCI6MjA1MDcxODM0MH0.FgbXw6vD7jogaABU81E_0HAA_mVOQFmLJPqS0mH0uEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
let capitalGrowthChart = null;

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

    document.getElementById('trading-form').addEventListener('submit', handleTradingFormSubmit);
    document.getElementById('import-file').addEventListener('change', handleImportFileChange);
});

// ==================== AUTH FUNCTIONS ====================
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

// ==================== ACCOUNT MANAGEMENT ====================
function loadAccounts() {
    const stored = localStorage.getItem(ACCOUNTS_KEY);
    accounts = stored ? JSON.parse(stored) : [];
    updateAccountSelector();
}

function saveAccounts() {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    updateAccountSelector();
}

function updateAccountSelector() {
    const selector = document.getElementById('account-selector');
    selector.innerHTML = '';
    accounts.forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.id;
        option.textContent = acc.name;
        selector.appendChild(option);
    });
    if (currentAccountId) {
        selector.value = currentAccountId;
    }
}

function openCreateAccountModal() {
    const name = prompt('Nombre de la nueva cuenta:');
    if (name && name.trim()) {
        const newAccount = {
            id: Date.now().toString(),
            name: name.trim(),
            createdAt: new Date().toISOString()
        };
        accounts.push(newAccount);
        saveAccounts();
        setActiveAccount(newAccount.id);
    }
}

function confirmDeleteAccount() {
    if (accounts.length === 0) {
        alert('No hay cuentas para eliminar.');
        return;
    }
    if (!confirm('¿Estás seguro de que quieres eliminar esta cuenta? Esta acción no se puede deshacer.')) {
        return;
    }
    const accountIndex = accounts.findIndex(a => a.id === currentAccountId);
    if (accountIndex !== -1) {
        accounts.splice(accountIndex, 1);
        
        const keysToRemove = [
            `${currentAccountId}_operations`,
            `${currentAccountId}_settings`,
            `${currentAccountId}_journals`,
            `${currentAccountId}_goals`,
            `${currentAccountId}_hwm`,
            `${currentAccountId}_checklist`
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        saveAccounts();
        
        if (accounts.length > 0) {
            setActiveAccount(accounts[0].id);
        } else {
            currentAccountId = null;
            operations = [];
            settings = { initialBalance: 50000, consistencyPercentage: 40, trailingDrawdownAmount: 2500 };
            journals = [];
            goals = { weekly: 0, monthly: 0 };
            highWaterMark = 0;
            drawdownFloor = 0;
            updateUI();
            openCreateAccountModal();
        }
    }
}

async function setActiveAccount(id) {
    currentAccountId = id;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, currentAccountId);
    const settingsKey = getSettingsKey(currentAccountId);
    const storedSettings = localStorage.getItem(settingsKey);
    settings = storedSettings ? JSON.parse(storedSettings) : { initialBalance: 50000, consistencyPercentage: 40, trailingDrawdownAmount: 2500 };
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('No hay usuario autenticado, las operaciones se cargarán después del login');
            operations = [];
        } else {
            console.log('Cargando operaciones desde la API para user:', user.id, 'cuenta:', currentAccountId);
            
            const response = await fetch(`/api/operaciones?user_id=${encodeURIComponent(user.id)}&cuenta_id=${encodeURIComponent(currentAccountId)}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.operaciones) {
                operations = data.operaciones.map(op => ({
                    id: op.id,
                    fecha: op.fecha,
                    tipo: op.tipo,
                    activo: op.activo,
                    estrategia: op.estrategia,
                    contratos: op.contratos,
                    tipoEntrada: op.tipo_entrada,
                    tipoSalida: op.tipo_salida,
                    horaEntrada: op.hora_entrada,
                    horaSalida: op.hora_salida,
                    importe: parseFloat(op.importe) || 0,
                    mood: op.animo,
                    notas: op.notas,
                    mediaUrl: op.media_url,
                    newsRating: 0
                }));
                console.log('Operaciones cargadas:', operations.length);
            } else {
                operations = [];
            }
        }
    } catch (error) {
        console.error('Error cargando operaciones:', error);
        operations = [];
    }

    operations.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    const goalsKey = getGoalsKey(currentAccountId);
    const storedGoals = localStorage.getItem(goalsKey);
    goals = storedGoals ? JSON.parse(storedGoals) : { weekly: 0, monthly: 0 };
    
    const journalsKey = getJournalsKey(currentAccountId);
    const storedJournals = localStorage.getItem(journalsKey);
    journals = storedJournals ? JSON.parse(storedJournals) : [];
    
    const hwmKey = getHWMKey(currentAccountId);
    const storedHWM = localStorage.getItem(hwmKey);
    highWaterMark = storedHWM ? parseFloat(storedHWM) : settings.initialBalance;
    
    updateAccountSelector();
    updateUI();
    filterOperations();
    updateYearFilterOptions();
    loadChecklist();
}

function getSettingsKey(accountId) {
    return `${accountId}_settings`;
}

function getOperationsKey(accountId) {
    return `${accountId}_operations`;
}

function getJournalsKey(accountId) {
    return `${accountId}_journals`;
}

function getGoalsKey(accountId) {
    return `${accountId}_goals`;
}

function getHWMKey(accountId) {
    return `${accountId}_hwm`;
}

function getChecklistKey(accountId) {
    return `${accountId}_checklist`;
}

// ==================== PERSISTENCE ====================
async function saveData() {
    if (!currentAccountId) return;
    
    const settingsKey = getSettingsKey(currentAccountId);
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    
    const goalsKey = getGoalsKey(currentAccountId);
    localStorage.setItem(goalsKey, JSON.stringify(goals));
    
    const journalsKey = getJournalsKey(currentAccountId);
    localStorage.setItem(journalsKey, JSON.stringify(journals));
    
    const hwmKey = getHWMKey(currentAccountId);
    localStorage.setItem(hwmKey, highWaterMark.toString());
}

// ==================== TAB NAVIGATION ====================
function openTab(tabName, evt) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const tabButtons = document.querySelectorAll('.tab');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    if (evt && evt.target) {
        evt.target.classList.add('active');
    } else {
        tabButtons.forEach(btn => {
            if (btn.textContent.toLowerCase().includes(tabName.toLowerCase()) || 
                btn.getAttribute('onclick')?.includes(tabName)) {
                btn.classList.add('active');
            }
        });
    }
    
    if (tabName === 'historial') {
        filterOperations();
    } else if (tabName === 'objetivos') {
        displayJournalEntries();
        updateGoalsProgress();
    } else if (tabName === 'checklist') {
        loadChecklist();
    } else if (tabName === 'Retos') {
        initRetosSemanales();
    } else if (tabName === 'dashboard') {
        setTimeout(() => {
            updateCapitalGrowthChart();
        }, 100);
    }
}

// ==================== OPERATIONS ====================
async function handleTradingFormSubmit(e) {
    e.preventDefault();
    
    const fecha = document.getElementById('date').value;
    const tipo = document.getElementById('type').value;
    const activo = getCustomOrSelectedValue('activo', 'custom-activo-input');
    const estrategia = getCustomOrSelectedValue('estrategia', 'custom-estrategia-input');
    const contratos = parseInt(document.getElementById('contracts').value) || null;
    const tipoEntrada = getCustomOrSelectedValue('entry-type', 'custom-entry-type-input');
    const tipoSalida = getCustomOrSelectedValue('exit-type', 'custom-exit-type-input');
    const horaEntrada = document.getElementById('entry-time').value || null;
    const horaSalida = document.getElementById('exit-time').value || null;
    const importe = parseFloat(document.getElementById('amount').value);
    const mood = document.getElementById('journal-mood').value || null;
    const notas = document.getElementById('notes').value || null;
    
    if (!fecha || isNaN(importe)) {
        alert('Por favor, completa al menos la fecha y el importe.');
        return;
    }
    
    const mediaFile = document.getElementById('trade-media').files[0];
    let mediaUrl = null;
    
    if (mediaFile) {
        const reader = new FileReader();
        reader.onload = async function(event) {
            mediaUrl = event.target.result;
            await saveOperation();
        };
        reader.readAsDataURL(mediaFile);
    } else {
        await saveOperation();
    }
    
    async function saveOperation() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                throw new Error('Debes iniciar sesión para guardar operaciones');
            }

            const operationData = {
                user_id: user.id,
                cuenta_id: currentAccountId,
                fecha: fecha,
                tipo: tipo || null,
                activo: activo || null,
                estrategia: estrategia || null,
                contratos: contratos,
                tipo_entrada: tipoEntrada || null,
                tipo_salida: tipoSalida || null,
                hora_entrada: horaEntrada || null,
                hora_salida: horaSalida || null,
                importe: parseFloat(importe),
                animo: mood || null,
                notas: notas || null,
                media_url: mediaUrl || null
            };

            console.log('Guardando operación...', operationData);

            const response = await fetch('/api/operaciones', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(operationData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('Operación guardada exitosamente:', result);
            
            await setActiveAccount(currentAccountId);
            
            document.getElementById('trading-form').reset();
            document.getElementById('date').value = new Date().toISOString().split('T')[0];
            document.getElementById('journal-news').value = '0';
            updateNewsStars(0);
            
            alert('Operación guardada correctamente.');
            
        } catch (error) {
            console.error('ERROR al guardar operación:', error);
            alert('ERROR: No se pudo guardar la operación.\n\n' + error.message);
        }
    }
}

function getCustomOrSelectedValue(selectId, customInputId) {
    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    
    if (select.value === 'custom' && customInput) {
        return customInput.value.trim() || null;
    }
    return select.value || null;
}

function handleAssetSelection(selectElement) {
    const customInputId = selectElement.id.replace(/^(activo|estrategia|entry-type|exit-type)$/, 'custom-$1-input');
    const customInput = document.getElementById(customInputId);
    
    if (customInput) {
        if (selectElement.value === 'custom') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    }
}

async function deleteOperation(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta operación?')) {
        return;
    }
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('No hay usuario autenticado');
        }

        const response = await fetch(`/api/operaciones/${id}?user_id=${encodeURIComponent(user.id)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error HTTP ${response.status}`);
        }

        console.log('Operación eliminada correctamente');
        
        await setActiveAccount(currentAccountId);
        
    } catch (error) {
        console.error('ERROR eliminando operación:', error);
        alert('ERROR: No se pudo eliminar la operación. ' + error.message);
    }
}

function openEditModal(id) {
    const operation = operations.find(op => op.id === id);
    if (!operation) return;
    
    document.getElementById('edit-operation-id').value = id;
    document.getElementById('edit-date').value = operation.fecha;
    document.getElementById('edit-type').value = operation.tipo || '';
    document.getElementById('edit-activo').value = operation.activo || '';
    document.getElementById('edit-estrategia').value = operation.estrategia || '';
    document.getElementById('edit-contracts').value = operation.contratos || '';
    document.getElementById('edit-entry-type').value = operation.tipoEntrada || '';
    document.getElementById('edit-exit-type').value = operation.tipoSalida || '';
    document.getElementById('edit-entry-time').value = operation.horaEntrada || '';
    document.getElementById('edit-exit-time').value = operation.horaSalida || '';
    document.getElementById('edit-amount').value = operation.importe;
    document.getElementById('edit-mood').value = operation.mood || '';
    document.getElementById('edit-notes').value = operation.notas || '';
    
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveEditedOperation() {
    const id = document.getElementById('edit-operation-id').value;
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('No hay usuario autenticado');
        }

        const operationData = {
            user_id: user.id,
            fecha: document.getElementById('edit-date').value,
            tipo: document.getElementById('edit-type').value || null,
            activo: document.getElementById('edit-activo').value || null,
            estrategia: document.getElementById('edit-estrategia').value || null,
            contratos: parseInt(document.getElementById('edit-contracts').value) || null,
            tipo_entrada: document.getElementById('edit-entry-type').value || null,
            tipo_salida: document.getElementById('edit-exit-type').value || null,
            hora_entrada: document.getElementById('edit-entry-time').value || null,
            hora_salida: document.getElementById('edit-exit-time').value || null,
            importe: parseFloat(document.getElementById('edit-amount').value),
            animo: document.getElementById('edit-mood').value || null,
            notas: document.getElementById('edit-notes').value || null
        };

        const response = await fetch(`/api/operaciones/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(operationData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error HTTP ${response.status}`);
        }

        console.log('Operación actualizada correctamente');
        
        await setActiveAccount(currentAccountId);
        closeEditModal();
        
        alert('Operación actualizada correctamente.');
        
    } catch (error) {
        console.error('ERROR actualizando operación:', error);
        alert('ERROR: No se pudo actualizar la operación. ' + error.message);
    }
}

function openDetailsModal(id) {
    const operation = operations.find(op => op.id === id);
    if (!operation) return;
    
    let duration = 'N/A';
    if (operation.horaEntrada && operation.horaSalida) {
        const [eh, em, es] = operation.horaEntrada.split(':').map(Number);
        const [sh, sm, ss] = operation.horaSalida.split(':').map(Number);
        const entrySeconds = eh * 3600 + em * 60 + (es || 0);
        const exitSeconds = sh * 3600 + sm * 60 + (ss || 0);
        const diffSeconds = exitSeconds - entrySeconds;
        if (diffSeconds >= 0) {
            const hours = Math.floor(diffSeconds / 3600);
            const minutes = Math.floor((diffSeconds % 3600) / 60);
            const seconds = diffSeconds % 60;
            duration = `${hours}h ${minutes}m ${seconds}s`;
        }
    }
    
    const typeText = operation.tipo === 'bullish' ? 'Alcista' : operation.tipo === 'bearish' ? 'Bajista' : operation.tipo || 'N/A';
    const amountClass = operation.importe >= 0 ? 'positive' : 'negative';
    
    let mediaHTML = '';
    if (operation.mediaUrl) {
        if (operation.mediaUrl.startsWith('data:image')) {
            mediaHTML = `<img src="${operation.mediaUrl}" alt="Trade media" style="max-width: 100%; height: auto; border-radius: 5px; margin-top: 10px;">`;
        } else if (operation.mediaUrl.startsWith('data:video')) {
            mediaHTML = `<video src="${operation.mediaUrl}" controls style="max-width: 100%; border-radius: 5px; margin-top: 10px;"></video>`;
        }
    }
    
    const modalContent = `
        <div class="details-grid">
            <div class="detail-item"><strong>Fecha:</strong> ${operation.fecha}</div>
            <div class="detail-item"><strong>Tipo:</strong> ${typeText}</div>
            <div class="detail-item"><strong>Activo:</strong> ${operation.activo || 'N/A'}</div>
            <div class="detail-item"><strong>Estrategia:</strong> ${operation.estrategia || 'N/A'}</div>
            <div class="detail-item"><strong>Contratos:</strong> ${operation.contratos || 'N/A'}</div>
            <div class="detail-item"><strong>Tipo Entrada:</strong> ${operation.tipoEntrada || 'N/A'}</div>
            <div class="detail-item"><strong>Tipo Salida:</strong> ${operation.tipoSalida || 'N/A'}</div>
            <div class="detail-item"><strong>Hora Entrada:</strong> ${operation.horaEntrada || 'N/A'}</div>
            <div class="detail-item"><strong>Hora Salida:</strong> ${operation.horaSalida || 'N/A'}</div>
            <div class="detail-item"><strong>Duración:</strong> ${duration}</div>
            <div class="detail-item"><strong>Estado Ánimo:</strong> ${operation.mood || 'N/A'}</div>
            <div class="detail-item"><strong>Importe:</strong> <span class="${amountClass}">${operation.importe.toFixed(2)} €</span></div>
        </div>
        <div class="detail-notes"><strong>Notas:</strong> ${operation.notas || 'Sin notas'}</div>
        ${mediaHTML}
    `;
    
    document.getElementById('details-content').innerHTML = modalContent;
    document.getElementById('details-modal').style.display = 'flex';
}

function closeDetailsModal() {
    document.getElementById('details-modal').style.display = 'none';
}

// ==================== FILTERING & DISPLAY ====================
function filterOperations() {
    const yearFilter = document.getElementById('filter-year').value;
    const monthFilter = document.getElementById('filter-month').value;
    const typeFilter = document.getElementById('filter-type').value;
    const resultFilter = document.getElementById('filter-result').value;
    const displaySelect = document.getElementById('operations-display');
    const displayLimit = displaySelect ? parseInt(displaySelect.value) : 4;
    
    let filtered = [...operations];
    
    if (yearFilter) {
        filtered = filtered.filter(op => op.fecha && op.fecha.startsWith(yearFilter));
    }
    
    if (monthFilter) {
        filtered = filtered.filter(op => {
            if (!op.fecha) return false;
            const month = op.fecha.split('-')[1];
            return month === monthFilter;
        });
    }
    
    if (typeFilter) {
        if (typeFilter === 'none') {
            filtered = filtered.filter(op => !op.tipo);
        } else if (typeFilter === 'other') {
            filtered = filtered.filter(op => op.tipo && op.tipo !== 'bullish' && op.tipo !== 'bearish');
        } else {
            filtered = filtered.filter(op => op.tipo === typeFilter);
        }
    }
    
    if (resultFilter) {
        if (resultFilter === 'win') {
            filtered = filtered.filter(op => op.importe > 0);
        } else if (resultFilter === 'loss') {
            filtered = filtered.filter(op => op.importe < 0);
        } else if (resultFilter === 'neutral') {
            filtered = filtered.filter(op => op.importe === 0);
        }
    }
    
    filtered.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    const displayOps = displayLimit === -1 ? filtered : filtered.slice(0, displayLimit);
    
    renderOperationsTable(displayOps);
    updateWeeklyPerformance(filtered);
    displayCompletedJournals();
}

function changeOperationsDisplay() {
    filterOperations();
}

function renderOperationsTable(ops) {
    const tbody = document.getElementById('operations-list');
    
    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center;">No hay operaciones para mostrar</td></tr>';
        return;
    }
    
    let html = '';
    ops.forEach(op => {
        const typeText = op.tipo === 'bullish' ? 'Alcista' : op.tipo === 'bearish' ? 'Bajista' : op.tipo || '-';
        const amountClass = op.importe >= 0 ? 'positive' : 'negative';
        
        let duration = '-';
        if (op.horaEntrada && op.horaSalida) {
            const [eh, em, es] = op.horaEntrada.split(':').map(Number);
            const [sh, sm, ss] = op.horaSalida.split(':').map(Number);
            const entrySeconds = eh * 3600 + em * 60 + (es || 0);
            const exitSeconds = sh * 3600 + sm * 60 + (ss || 0);
            const diffSeconds = exitSeconds - entrySeconds;
            if (diffSeconds >= 0) {
                const hours = Math.floor(diffSeconds / 3600);
                const minutes = Math.floor((diffSeconds % 3600) / 60);
                duration = `${hours}h ${minutes}m`;
            }
        }
        
        const mediaIcon = op.mediaUrl ? '<span title="Tiene media adjunta">📎</span>' : '-';
        
        html += `
            <tr>
                <td>${op.fecha}</td>
                <td>${typeText}</td>
                <td>${op.activo || '-'}</td>
                <td>${op.estrategia || '-'}</td>
                <td>${op.contratos || '-'}</td>
                <td>${op.tipoEntrada || '-'}</td>
                <td>${op.tipoSalida || '-'}</td>
                <td>${duration}</td>
                <td>${op.mood || '-'}</td>
                <td class="${amountClass}">${op.importe.toFixed(2)} €</td>
                <td>${mediaIcon}</td>
                <td>
                    <button class="button-small" onclick="openDetailsModal(${op.id})" title="Ver detalles">👁</button>
                    <button class="button-small" onclick="openEditModal(${op.id})" title="Editar">✏️</button>
                    <button class="button-small button-danger" onclick="deleteOperation(${op.id})" title="Eliminar">🗑</button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function updateYearFilterOptions() {
    const yearSelect = document.getElementById('filter-year');
    const years = new Set();
    
    operations.forEach(op => {
        if (op.fecha) {
            years.add(op.fecha.split('-')[0]);
        }
    });
    
    const currentYear = new Date().getFullYear().toString();
    years.add(currentYear);
    
    const sortedYears = Array.from(years).sort().reverse();
    
    yearSelect.innerHTML = '<option value="">Todos</option>';
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
}

function updateWeeklyPerformance(ops) {
    const weeklyData = {
        'Lunes': { profit: 0, count: 0, wins: 0 },
        'Martes': { profit: 0, count: 0, wins: 0 },
        'Miércoles': { profit: 0, count: 0, wins: 0 },
        'Jueves': { profit: 0, count: 0, wins: 0 },
        'Viernes': { profit: 0, count: 0, wins: 0 },
        'Sábado': { profit: 0, count: 0, wins: 0 },
        'Domingo': { profit: 0, count: 0, wins: 0 }
    };
    
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    
    ops.forEach(op => {
        if (!op.fecha) return;
        const date = new Date(op.fecha);
        const dayName = dayNames[date.getDay()];
        weeklyData[dayName].profit += op.importe;
        weeklyData[dayName].count++;
        if (op.importe > 0) {
            weeklyData[dayName].wins++;
        }
    });
    
    const performanceContainer = document.getElementById('weekly-performance');
    const successRateContainer = document.getElementById('weekly-success-rate');
    
    let performanceHTML = '';
    let successRateHTML = '';
    
    ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].forEach(day => {
        const data = weeklyData[day];
        const profitClass = data.profit >= 0 ? 'positive' : 'negative';
        const successRate = data.count > 0 ? ((data.wins / data.count) * 100).toFixed(0) : 0;
        
        performanceHTML += `
            <div class="stat-box">
                <h4>${day}</h4>
                <p class="${profitClass}">${data.profit.toFixed(2)} €</p>
                <small>${data.count} ops</small>
            </div>
        `;
        
        successRateHTML += `
            <div class="stat-box">
                <h4>${day}</h4>
                <p>${successRate}%</p>
                <small>${data.wins}/${data.count} wins</small>
            </div>
        `;
    });
    
    performanceContainer.innerHTML = performanceHTML;
    successRateContainer.innerHTML = successRateHTML;
}

// ==================== UI UPDATE ====================
function updateUI() {
    const totalProfit = operations.reduce((sum, op) => sum + op.importe, 0);
    const currentBalance = settings.initialBalance + totalProfit;
    const roi = settings.initialBalance > 0 ? (totalProfit / settings.initialBalance) * 100 : 0;
    
    document.getElementById('initial-balance-display').textContent = settings.initialBalance.toFixed(2) + ' €';
    document.getElementById('current-balance').textContent = currentBalance.toFixed(2) + ' €';
    
    const profitLossEl = document.getElementById('profit-loss');
    profitLossEl.textContent = totalProfit.toFixed(2) + ' €';
    profitLossEl.className = totalProfit >= 0 ? 'positive' : 'negative';
    
    const roiEl = document.getElementById('roi');
    roiEl.textContent = roi.toFixed(2) + '%';
    roiEl.className = roi >= 0 ? 'positive' : 'negative';
    
    if (currentBalance > highWaterMark) {
        highWaterMark = currentBalance;
        const hwmKey = getHWMKey(currentAccountId);
        localStorage.setItem(hwmKey, highWaterMark.toString());
    }
    
    drawdownFloor = highWaterMark - settings.trailingDrawdownAmount;
    const marginToFloor = currentBalance - drawdownFloor;
    
    document.getElementById('high-water-mark').textContent = highWaterMark.toFixed(2) + ' €';
    document.getElementById('drawdown-floor').textContent = drawdownFloor.toFixed(2) + ' €';
    
    const marginEl = document.getElementById('margin-to-floor');
    marginEl.textContent = marginToFloor.toFixed(2) + ' €';
    marginEl.className = marginToFloor >= 0 ? 'positive' : 'negative';
    
    updateConsistencyRule();
    updateRecentOperations();
    updateGoalsProgress();
    updateCapitalGrowthChart();
}

function updateConsistencyRule() {
    const profitByDay = {};
    let totalProfit = 0;
    
    operations.forEach(op => {
        if (op.importe > 0) {
            if (!profitByDay[op.fecha]) {
                profitByDay[op.fecha] = 0;
            }
            profitByDay[op.fecha] += op.importe;
            totalProfit += op.importe;
        }
    });
    
    const dailyProfits = Object.values(profitByDay);
    const maxDayProfit = dailyProfits.length > 0 ? Math.max(...dailyProfits) : 0;
    
    let consistencyPercentage = 0;
    if (totalProfit > 0) {
        consistencyPercentage = (maxDayProfit / totalProfit) * 100;
    }
    
    const progressBar = document.getElementById('consistency-progress');
    const progressLabel = progressBar.parentElement.querySelector('.progress-label');
    
    progressBar.style.width = Math.min(consistencyPercentage, 100) + '%';
    progressLabel.textContent = consistencyPercentage.toFixed(1) + '%';
    
    const isCompliant = consistencyPercentage <= settings.consistencyPercentage;
    progressBar.style.backgroundColor = isCompliant ? '#10b0b9' : '#ef44bc';
    
    const detailsEl = document.getElementById('consistency-details');
    if (dailyProfits.length === 0) {
        detailsEl.textContent = 'No hay suficientes datos para calcular la consistencia.';
    } else {
        const maxDayDate = Object.keys(profitByDay).find(key => profitByDay[key] === maxDayProfit);
        detailsEl.textContent = `Día más rentable: ${maxDayDate} con ${maxDayProfit.toFixed(2)} €. ${isCompliant ? 'Cumples' : 'NO cumples'} la regla de consistencia.`;
    }
    
    document.getElementById('consistency-limit-display').textContent = settings.consistencyPercentage;
}

function updateRecentOperations() {
    const container = document.getElementById('recent-operations');
    const recent = operations.slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<p>No hay operaciones recientes para mostrar.</p>';
        return;
    }
    
    let html = '<div class="recent-ops-list">';
    recent.forEach(op => {
        const typeText = op.tipo === 'bullish' ? 'Alcista' : op.tipo === 'bearish' ? 'Bajista' : op.tipo || '-';
        const amountClass = op.importe >= 0 ? 'positive' : 'negative';
        html += `
            <div class="recent-op-item">
                <span>${op.fecha}</span>
                <span>${typeText}</span>
                <span>${op.activo || '-'}</span>
                <span class="${amountClass}">${op.importe.toFixed(2)} €</span>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ==================== CHART ====================
function updateCapitalGrowthChart() {
    const ctx = document.getElementById('capitalGrowthChart');
    if (!ctx) return;
    
    const sortedOps = [...operations].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    const labels = ['Inicio'];
    const balances = [settings.initialBalance];
    const hwmData = [settings.initialBalance];
    const floorData = [settings.initialBalance - settings.trailingDrawdownAmount];
    
    let runningBalance = settings.initialBalance;
    let runningHWM = settings.initialBalance;
    
    sortedOps.forEach(op => {
        labels.push(op.fecha);
        runningBalance += op.importe;
        balances.push(runningBalance);
        
        if (runningBalance > runningHWM) {
            runningHWM = runningBalance;
        }
        hwmData.push(runningHWM);
        floorData.push(runningHWM - settings.trailingDrawdownAmount);
    });
    
    if (capitalGrowthChart) {
        capitalGrowthChart.destroy();
    }
    
    capitalGrowthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Saldo',
                    data: balances,
                    borderColor: '#00f2ea',
                    backgroundColor: 'rgba(0, 242, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Pico de Saldo (HWM)',
                    data: hwmData,
                    borderColor: '#10b0b9',
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Suelo Drawdown',
                    data: floorData,
                    borderColor: '#ef44bc',
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b3b3b3'
                    },
                    grid: {
                        color: '#4b5563'
                    }
                },
                y: {
                    ticks: {
                        color: '#b3b3b3',
                        callback: function(value) {
                            return value.toFixed(0) + ' €';
                        }
                    },
                    grid: {
                        color: '#4b5563'
                    }
                }
            }
        }
    });
}

// ==================== SETTINGS ====================
function openSettingsModal() {
    document.getElementById('initial-balance').value = settings.initialBalance;
    document.getElementById('trailing-drawdown-amount').value = settings.trailingDrawdownAmount;
    document.getElementById('consistency-percentage').value = settings.consistencyPercentage;
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

async function saveSettings() {
    settings.initialBalance = parseFloat(document.getElementById('initial-balance').value);
    settings.trailingDrawdownAmount = parseFloat(document.getElementById('trailing-drawdown-amount').value);
    settings.consistencyPercentage = parseFloat(document.getElementById('consistency-percentage').value);
    
    await saveData();
    updateUI();
    closeSettingsModal();
    alert('Configuración guardada correctamente.');
}

async function resetAllData() {
    if (!confirm('¿Estás seguro de que quieres reiniciar todos los datos? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && currentAccountId) {
            const response = await fetch(`/api/operaciones?user_id=${encodeURIComponent(user.id)}&cuenta_id=${encodeURIComponent(currentAccountId)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.operaciones) {
                    for (const op of data.operaciones) {
                        await fetch(`/api/operaciones/${op.id}?user_id=${encodeURIComponent(user.id)}`, {
                            method: 'DELETE'
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error eliminando operaciones:', error);
    }
    
    operations = [];
    journals = [];
    goals = { weekly: 0, monthly: 0 };
    highWaterMark = settings.initialBalance;
    
    await saveData();
    updateUI();
    closeSettingsModal();
    alert('Datos reiniciados correctamente.');
}

// ==================== GOALS ====================
function saveJournalEntry() {
    const date = document.getElementById('journal-date').value;
    const title = document.getElementById('journal-title').value.trim();
    
    if (!date || !title) {
        alert('Por favor, completa todos los campos.');
        return;
    }
    
    const entry = {
        id: Date.now().toString(),
        date: date,
        title: title,
        completed: false
    };
    
    journals.push(entry);
    
    const journalsKey = getJournalsKey(currentAccountId);
    localStorage.setItem(journalsKey, JSON.stringify(journals));
    
    document.getElementById('journal-date').value = '';
    document.getElementById('journal-title').value = '';
    
    displayJournalEntries();
    alert('Meta guardada correctamente.');
}

function displayJournalEntries() {
    const container = document.getElementById('journal-entries');
    const activeEntries = journals.filter(j => !j.completed);
    
    if (activeEntries.length === 0) {
        container.innerHTML = '<p>No hay metas activas. ¡Crea una nueva meta!</p>';
        return;
    }
    
    let html = '<div class="objetivos-list">';
    activeEntries.forEach(entry => {
        html += `
            <div class="entry">
                <div class="entry-header">
                    <span><strong>${entry.date}</strong>: ${entry.title}</span>
                    <div>
                        <button class="button-small button-secondary" onclick="markJournalCompleted('${entry.id}')">Completar</button>
                        <button class="delete-entry" onclick="deleteJournalEntry('${entry.id}')">X</button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function markJournalCompleted(id) {
    const entry = journals.find(j => j.id === id);
    if (entry) {
        entry.completed = true;
        entry.completedDate = new Date().toISOString().split('T')[0];
        saveData();
        displayJournalEntries();
        displayCompletedJournals();
        alert('Meta completada.');
    }
}

function deleteJournalEntry(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta meta?')) {
        return;
    }
    const index = journals.findIndex(j => j.id === id);
    if (index !== -1) {
        journals.splice(index, 1);
        saveData();
        displayJournalEntries();
        displayCompletedJournals();
    }
}

function displayCompletedJournals() {
    const container = document.getElementById('historial-metas-conseguidas');
    const completedEntries = journals.filter(j => j.completed);
    
    if (completedEntries.length === 0) {
        container.innerHTML = '<p>No hay metas completadas aún.</p>';
        return;
    }
    
    let html = '<div class="objetivos-list">';
    completedEntries.forEach(entry => {
        html += `
            <div class="entry">
                <div class="entry-header">
                    <span><strong>${entry.date}</strong>: ${entry.title}</span>
                    <span style="color: #10b0b9;">Completada el ${entry.completedDate}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function saveGoals() {
    goals.weekly = parseFloat(document.getElementById('weekly-goal').value) || 0;
    goals.monthly = parseFloat(document.getElementById('monthly-goal').value) || 0;
    
    const goalsKey = getGoalsKey(currentAccountId);
    localStorage.setItem(goalsKey, JSON.stringify(goals));
    
    updateGoalsProgress();
    alert('Objetivos guardados correctamente.');
}

function updateGoalsProgress() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const weeklyProfit = operations
        .filter(op => new Date(op.fecha) >= startOfWeek)
        .reduce((sum, op) => sum + op.importe, 0);
    
    const monthlyProfit = operations
        .filter(op => new Date(op.fecha) >= startOfMonth)
        .reduce((sum, op) => sum + op.importe, 0);
    
    const weeklyProgress = goals.weekly > 0 ? (weeklyProfit / goals.weekly) * 100 : 0;
    const monthlyProgress = goals.monthly > 0 ? (monthlyProfit / goals.monthly) * 100 : 0;
    
    document.getElementById('weekly-goal-display').textContent = weeklyProfit.toFixed(2) + ' €';
    document.getElementById('weekly-progress-percentage').textContent = weeklyProgress.toFixed(1) + '%';
    
    document.getElementById('monthly-goal-display').textContent = monthlyProfit.toFixed(2) + ' €';
    document.getElementById('monthly-progress-percentage').textContent = monthlyProgress.toFixed(1) + '%';
    
    document.getElementById('weekly-progress-detailed').textContent = 
        `Progreso: ${weeklyProfit.toFixed(2)} € / ${goals.weekly.toFixed(2)} € (${weeklyProgress.toFixed(1)}%)`;
    
    document.getElementById('monthly-progress-detailed').textContent = 
        `Progreso: ${monthlyProfit.toFixed(2)} € / ${goals.monthly.toFixed(2)} € (${monthlyProgress.toFixed(1)}%)`;
}

// ==================== MOOD & NEWS ====================
function setMood(mood) {
    document.getElementById('journal-mood').value = mood;
}

function setNewsRating(rating) {
    document.getElementById('journal-news').value = rating;
    updateNewsStars(rating);
}

function updateNewsStars(rating) {
    const stars = document.querySelectorAll('.star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.textContent = '★';
            star.classList.add('selected');
        } else {
            star.textContent = '☆';
            star.classList.remove('selected');
        }
    });
}

// ==================== CHECKLIST ====================
function loadChecklist() {
    const checklistKey = getChecklistKey(currentAccountId);
    const storedChecklist = localStorage.getItem(checklistKey);
    
    let checklist = storedChecklist ? JSON.parse(storedChecklist) : getDefaultChecklist();
    
    const listaTareas = document.getElementById('listaTareas');
    listaTareas.innerHTML = '';
    
    checklist.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = item.completed ? 'completed' : '';
        
        if (isChecklistEditMode) {
            li.innerHTML = `
                <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleChecklistItem(${index})" disabled>
                <input type="text" value="${item.text}" onchange="updateChecklistItemText(${index}, this.value)" style="flex: 1; margin: 0 10px;">
                <button onclick="removeChecklistItem(${index})" class="button-small button-danger">Eliminar</button>
            `;
        } else {
            li.innerHTML = `
                <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleChecklistItem(${index})">
                <span>${item.text}</span>
                ${item.completed ? '<span class="ok">✓</span>' : ''}
            `;
        }
        
        listaTareas.appendChild(li);
    });
}

function getDefaultChecklist() {
    return [
        { text: "Revisar el calendario económico y las noticias del día", completed: false },
        { text: "Verificar niveles clave de soporte y resistencia", completed: false },
        { text: "Definir el plan de trading del día (setup, activos, horarios)", completed: false },
        { text: "Calcular el riesgo por operación (% del capital, stop loss)", completed: false },
        { text: "Preparar el entorno de trading (plataforma, gráficos, alertas)", completed: false },
        { text: "Comprobar el estado emocional antes de operar", completed: false },
        { text: "Revisar las operaciones abiertas y ajustar stops si es necesario", completed: false },
        { text: "Registrar todas las operaciones en el diario de trading", completed: false },
        { text: "Evaluar el rendimiento del día y ajustar la estrategia si es necesario", completed: false },
        { text: "Revisar el cumplimiento de las reglas de gestión de riesgo", completed: false }
    ];
}

function toggleChecklistItem(index) {
    const checklistKey = getChecklistKey(currentAccountId);
    const storedChecklist = localStorage.getItem(checklistKey);
    let checklist = storedChecklist ? JSON.parse(storedChecklist) : getDefaultChecklist();
    
    checklist[index].completed = !checklist[index].completed;
    localStorage.setItem(checklistKey, JSON.stringify(checklist));
    loadChecklist();
}

function resetChecklist() {
    if (!confirm('¿Estás seguro de que quieres resetear el checklist? Esto marcará todas las tareas como no completadas.')) {
        return;
    }
    const checklistKey = getChecklistKey(currentAccountId);
    const storedChecklist = localStorage.getItem(checklistKey);
    let checklist = storedChecklist ? JSON.parse(storedChecklist) : getDefaultChecklist();
    
    checklist.forEach(item => item.completed = false);
    localStorage.setItem(checklistKey, JSON.stringify(checklist));
    loadChecklist();
}

function toggleChecklistEditMode() {
    isChecklistEditMode = !isChecklistEditMode;
    
    if (isChecklistEditMode) {
        document.getElementById('edit-checklist-btn').style.display = 'none';
        document.getElementById('save-checklist-btn').style.display = 'inline-block';
        document.getElementById('add-task-container').style.display = 'block';
    } else {
        document.getElementById('edit-checklist-btn').style.display = 'inline-block';
        document.getElementById('save-checklist-btn').style.display = 'none';
        document.getElementById('add-task-container').style.display = 'none';
    }
    
    loadChecklist();
}

function saveChecklistChanges() {
    isChecklistEditMode = false;
    document.getElementById('edit-checklist-btn').style.display = 'inline-block';
    document.getElementById('save-checklist-btn').style.display = 'none';
    document.getElementById('add-task-container').style.display = 'none';
    loadChecklist();
    alert('Cambios guardados correctamente.');
}

function updateChecklistItemText(index, newText) {
    const checklistKey = getChecklistKey(currentAccountId);
    const storedChecklist = localStorage.getItem(checklistKey);
    let checklist = storedChecklist ? JSON.parse(storedChecklist) : getDefaultChecklist();
    
    checklist[index].text = newText;
    localStorage.setItem(checklistKey, JSON.stringify(checklist));
}

function removeChecklistItem(index) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
        return;
    }
    
    const checklistKey = getChecklistKey(currentAccountId);
    const storedChecklist = localStorage.getItem(checklistKey);
    let checklist = storedChecklist ? JSON.parse(storedChecklist) : getDefaultChecklist();
    
    checklist.splice(index, 1);
    localStorage.setItem(checklistKey, JSON.stringify(checklist));
    loadChecklist();
}

function addNewChecklistItem() {
    const newTaskInput = document.getElementById('new-task-input');
    const newText = newTaskInput.value.trim();
    
    if (!newText) {
        alert('Por favor, escribe el texto de la nueva tarea.');
        return;
    }
    
    const checklistKey = getChecklistKey(currentAccountId);
    const storedChecklist = localStorage.getItem(checklistKey);
    let checklist = storedChecklist ? JSON.parse(storedChecklist) : getDefaultChecklist();
    
    checklist.push({ text: newText, completed: false });
    localStorage.setItem(checklistKey, JSON.stringify(checklist));
    
    newTaskInput.value = '';
    loadChecklist();
}

// ==================== IMPORT CSV ====================
function openImportModal() {
    document.getElementById('import-modal').style.display = 'flex';
    document.getElementById('import-file').value = '';
    document.getElementById('import-status').style.display = 'none';
    document.getElementById('import-preview').style.display = 'none';
    importedOperations = [];
}

function closeImportModal() {
    document.getElementById('import-modal').style.display = 'none';
    document.getElementById('import-file').value = '';
}

async function handleImportFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!currentAccountId) {
        alert('Debes seleccionar una cuenta antes de importar');
        return;
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert('Debes iniciar sesión para importar operaciones');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cuenta_id', currentAccountId);
    formData.append('user_id', user.id);
    
    try {
        showImportStatus('Importando operaciones...', 'info');
        
        const response = await fetch('/api/importar-csv', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.operaciones) {
            showImportStatus('Guardando operaciones...', 'info');
            
            let guardadas = 0;
            let errores = 0;
            
            for (const op of data.operaciones) {
                const operationData = {
                    user_id: user.id,
                    cuenta_id: currentAccountId,
                    fecha: op.fecha,
                    tipo: op.tipo || null,
                    activo: op.activo || null,
                    estrategia: op.estrategia || null,
                    contratos: op.contratos || null,
                    tipo_entrada: op.tipoEntrada || null,
                    tipo_salida: op.tipoSalida || null,
                    hora_entrada: op.hora_entrada || null,
                    hora_salida: op.hora_salida || null,
                    importe: parseFloat(op.importe) || 0,
                    animo: null,
                    notas: null,
                    media_url: null
                };
                
                try {
                    const saveResponse = await fetch('/api/operaciones', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(operationData)
                    });
                    
                    if (saveResponse.ok) {
                        guardadas++;
                    } else {
                        errores++;
                    }
                } catch (e) {
                    console.error('Error guardando operación:', e);
                    errores++;
                }
            }
            
            showImportStatus(`Operaciones guardadas: ${guardadas}, Errores: ${errores}`, 'success');
            showImportPreview(data.operaciones);
            
            await setActiveAccount(currentAccountId);
            
            setTimeout(() => {
                closeImportModal();
                alert(`Importación completada: ${guardadas} operaciones guardadas.`);
            }, 2000);
        } else {
            showImportStatus('Error: ' + (data.error || 'Error procesando el archivo'), 'error');
        }
    } catch (error) {
        console.error('Error al importar:', error);
        showImportStatus('Error al importar: ' + error.message, 'error');
    }
}

function showImportStatus(message, type) {
    const statusDiv = document.getElementById('import-status');
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    if (type === 'error') {
        statusDiv.style.backgroundColor = '#ef44bc6c';
    } else if (type === 'success') {
        statusDiv.style.backgroundColor = '#10b0b94d';
    } else {
        statusDiv.style.backgroundColor = '#4b5563';
    }
    statusDiv.style.color = '#ffffff';
}

function showImportPreview(trades) {
    const previewDiv = document.getElementById('import-preview');
    const contentDiv = document.getElementById('import-preview-content');
    
    let html = `<p style="color: #10b0b9; font-weight: bold;">Se importaron ${trades.length} operaciones:</p>`;
    html += '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">';
    html += '<thead><tr><th style="padding: 5px; border-bottom: 1px solid #4b5563;">Fecha</th><th style="padding: 5px; border-bottom: 1px solid #4b5563;">Tipo</th><th style="padding: 5px; border-bottom: 1px solid #4b5563;">Activo</th><th style="padding: 5px; border-bottom: 1px solid #4b5563;">Contratos</th><th style="padding: 5px; border-bottom: 1px solid #4b5563;">Importe</th></tr></thead><tbody>';
    
    trades.slice(0, 10).forEach(trade => {
        const typeText = trade.tipo === 'bullish' ? 'Alcista' : 'Bajista';
        const amountClass = trade.importe >= 0 ? 'positive' : 'negative';
        html += `<tr>
            <td style="padding: 5px; border-bottom: 1px solid #4b5563;">${trade.fecha}</td>
            <td style="padding: 5px; border-bottom: 1px solid #4b5563;">${typeText}</td>
            <td style="padding: 5px; border-bottom: 1px solid #4b5563;">${trade.activo}</td>
            <td style="padding: 5px; border-bottom: 1px solid #4b5563;">${trade.contratos}</td>
            <td style="padding: 5px; border-bottom: 1px solid #4b5563;" class="${amountClass}">${trade.importe.toFixed(2)} €</td>
        </tr>`;
    });
    
    if (trades.length > 10) {
        html += `<tr><td colspan="5" style="padding: 5px; text-align: center; color: #b3b3b3;">... y ${trades.length - 10} operaciones más</td></tr>`;
    }
    
    html += '</tbody></table>';
    contentDiv.innerHTML = html;
    previewDiv.style.display = 'block';
}

// ==================== THEME ====================
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const theme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.textContent = theme === 'light' ? 'Sol' : 'Luna';
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-toggle').textContent = 'Sol';
    }
}

// ==================== RETOS SEMANALES ====================
function initRetosSemanales() {
    console.log('Retos Semanales initialized');
}
