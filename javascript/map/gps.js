// ====== GPS: VEHICLE — watchPosition + Page Visibility ======
let currentLocationMarker = null;
let currentLocationCircle = null;
let lastDrawnPosition = null;

let watchId = null;                 // ID do watchPosition (null = inativo)
let gpsLoopActive = false;          // loop ativo (intenção do usuário)
let singleShotActive = false;
let clickTimer = null;
const DOUBLE_CLICK_DELAY = 300;

// --- Vehicle parameters ---
const TARGET_ACCURACY_M = 15;
const MIN_MOVE_METERS = 5;
const MAX_CACHE_AGE_MS = 1000;
const WATCH_TIMEOUT_MS = 10000;     // watchPosition: timeout maior (ele se auto-recupera)

const gpsBtn = document.getElementById('gps-btn');

// ---------- HELPERS ----------
function setGpsLoading(isLoading) {
    if (isLoading) gpsBtn.classList.add('loading');
    else gpsBtn.classList.remove('loading');
}

function setGpsVisualState(state) {
    gpsBtn.classList.remove('active', 'loop-active', 'single-active');
    if (state === 'loop') {
        gpsBtn.classList.add('active', 'loop-active');
        gpsBtn.textContent = '🔄';
        gpsBtn.title = 'Rastreamento ativo — 2 cliques para parar';
    } else if (state === 'single') {
        gpsBtn.classList.add('single-active');
        gpsBtn.textContent = '📍';
        gpsBtn.title = 'Localização única';
    } else if (state === 'loading') {
        gpsBtn.classList.add('loading');
        gpsBtn.textContent = '⏳';
    } else if (state === 'paused') {
        gpsBtn.classList.add('single-active');
        gpsBtn.textContent = '⏸️';
        gpsBtn.title = 'Rastreamento pausado (aba em segundo plano)';
    } else {
        gpsBtn.textContent = '📍';
        gpsBtn.title = '1 clique: única | 2 cliques: rastreamento';
    }
}

function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- SINGLE READING (1 clique) ----------
function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error('Geolocalização não suportada.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: MAX_CACHE_AGE_MS,
            ...options
        });
    });
}

// ---------- DRAWING ----------
function drawCurrentLocation(lat, lng, accuracy) {
    if (currentLocationMarker) map.removeLayer(currentLocationMarker);
    if (currentLocationCircle) map.removeLayer(currentLocationCircle);

    let color = '#e63946';
    if (accuracy <= TARGET_ACCURACY_M) color = '#2ecc71';
    else if (accuracy <= 30) color = '#f39c12';

    currentLocationCircle = L.circle([lat, lng], {
        radius: accuracy, color, fillColor: color,
        fillOpacity: 0.15, weight: 1
    }).addTo(map);

    const icon = L.divIcon({
        className: 'current-location-marker',
        html: `<div class="current-location-dot" style="background:${color}"></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10]
    });

    currentLocationMarker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`<b>Sua localização</b><br>
            Lat: ${lat.toFixed(6)}<br>
            Lng: ${lng.toFixed(6)}<br>
            Precisão: ±${Math.round(accuracy)} m`);
}

// ---------- PROCESS POSITION (compartilhado entre single e watch) ----------
function processPosition(position, showPopup = false) {
    const { latitude, longitude, accuracy, speed } = position.coords;

    // Filter: only redraw if moved enough
    let moved = true;
    if (lastDrawnPosition) {
        const d = distanceMeters(
            lastDrawnPosition.lat, lastDrawnPosition.lng,
            latitude, longitude
        );
        if (d < MIN_MOVE_METERS && accuracy >= lastDrawnPosition.accuracy) {
            moved = false;
        }
    }

    if (moved) {
        lastDrawnPosition = { lat: latitude, lng: longitude, accuracy };
        drawCurrentLocation(latitude, longitude, accuracy);
        if (showPopup && currentLocationMarker) currentLocationMarker.openPopup();

        // Suave em vez de brusco
        if (!map.getBounds().contains([latitude, longitude])) {
            map.panTo([latitude, longitude], { animate: true, duration: 0.5 });
        }

        const coordInput = document.getElementById('coord0');
        if (coordInput) coordInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

        const nameInput = document.getElementById('name0');
        if (nameInput && (!nameInput.value || nameInput.value.trim() === '')) {
            nameInput.value = 'MINHA LOCALIZAÇÃO';
        }
    }

    // Info panel
    let status = '❌ Ruim';
    if (accuracy <= TARGET_ACCURACY_M) status = '✅ Boa (<15m)';
    else if (accuracy <= 30) status = '🟡 Regular (15-30m)';
    else if (accuracy <= 50) status = '🟠 Fraca (30-50m)';

    const speedKmh = speed != null && !isNaN(speed) ? (speed * 3.6).toFixed(1) + ' km/h' : '—';
    const mode = gpsLoopActive ? '🔄 RASTREAMENTO' : '📍 ÚNICA';

    document.getElementById('info').innerHTML = `<b>${mode}</b> — ${status}<br>
        Lat: ${latitude.toFixed(6)}<br>
        Lng: ${longitude.toFixed(6)}<br>
        Precisão: ±${accuracy.toFixed(1)} m<br>
        Velocidade: ${speedKmh}`;
}

function handleGpsError(err) {
    let msg = 'Erro ao obter localização.';
    switch (err.code) {
        case 1: msg = 'Permissão negada. Autorize o GPS.'; break;
        case 2: msg = 'Localização indisponível.'; break;
        case 3: msg = 'Timeout ao obter GPS.'; break;
        default: msg = err.message || msg;
    }
    document.getElementById('info').textContent = msg;

    // Permissão negada → desliga o loop
    if (err.code === 1 && gpsLoopActive) stopGpsWatch();
}

// ---------- SINGLE SHOT (1 clique) ----------
async function doSingleShot() {
    if (gpsLoopActive) return;
    singleShotActive = true;
    setGpsLoading(true);
    setGpsVisualState('loading');
    document.getElementById('info').textContent = 'Obtendo localização única...';

    try {
        const position = await getCurrentPosition();
        processPosition(position, true);
    } catch (err) {
        handleGpsError(err);
    } finally {
        singleShotActive = false;
        setGpsLoading(false);
        if (!gpsLoopActive) setGpsVisualState('off');
    }
}

// ---------- WATCH POSITION (2 cliques ativa, 2 cliques desativa) ----------
function startGpsWatch() {
    if (watchId !== null) return;   // já está ativo

    gpsLoopActive = true;
    lastDrawnPosition = null;
    setGpsVisualState('loop');
    document.getElementById('info').textContent = 'Ativando rastreamento GPS...';

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            setGpsLoading(false);
            processPosition(position, false);
        },
        (err) => {
            setGpsLoading(false);
            // Timeout do watchPosition é "normal" em veículo (o watch se recupera sozinho).
            // Só mostra erro real; timeout silencioso para não piscar a tela.
            if (err.code !== 3) handleGpsError(err);
        },
        {
            enableHighAccuracy: true,
            maximumAge: MAX_CACHE_AGE_MS,
            timeout: WATCH_TIMEOUT_MS
        }
    );
}

function stopGpsWatch() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    gpsLoopActive = false;
    setGpsVisualState('off');
    document.getElementById('info').textContent = 'Rastreamento GPS parado.';
}

// ---------- PAGE VISIBILITY: verifica e reativa o watch ----------
function checkAndReactivateWatch() {
    if (!gpsLoopActive) return;         // usuário desativou → não mexer
    if (watchId !== null) return;       // já está ativo → nada a fazer

    // Loop está ativo logicamente, mas o watch foi suspenso → reativar
    console.log('[GPS] Reativando watchPosition após retorno à aba');
    startGpsWatch();
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Aba em segundo plano / tela apagada → o navegador pausa o watch.
        // Apenas atualiza o visual para indicar pausa (sem matar o estado lógico).
        if (gpsLoopActive) setGpsVisualState('paused');
    } else {
        // Voltou para a aba → verifica e reativa se necessário
        checkAndReactivateWatch();
        if (gpsLoopActive) setGpsVisualState('loop');
    }
});

// ---------- CLICK DETECTION ----------
gpsBtn.addEventListener('click', () => {
    if (clickTimer !== null) {
        // Segundo clique → DUPLO CLIQUE
        clearTimeout(clickTimer);
        clickTimer = null;

        if (gpsLoopActive) stopGpsWatch();
        else startGpsWatch();
    } else {
        // Primeiro clique → espera para ver se vem o segundo
        clickTimer = setTimeout(() => {
            clickTimer = null;
            doSingleShot();
        }, DOUBLE_CLICK_DELAY);
    }
});

// Estado inicial
setGpsVisualState('off');