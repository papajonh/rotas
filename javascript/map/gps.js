// ====== GPS: VEHICLE — recursive setTimeout loop ======
let currentLocationMarker = null;
let currentLocationCircle = null;
let lastDrawnPosition = null;

let gpsTimeoutId = null;           // ← setTimeout, não setInterval
let gpsLoopActive = false;
let singleShotActive = false;
let clickTimer = null;
const DOUBLE_CLICK_DELAY = 300;

// --- Vehicle parameters ---
const GPS_INTERVAL_MS = 2000;
const READ_TIMEOUT_MS = 2500;      // ← reduzido (não trava o ciclo)
const TARGET_ACCURACY_M = 15;
const MIN_MOVE_METERS = 5;
const MAX_CACHE_AGE_MS = 500;     // ← aceita leitura de até 1s atrás

const gpsBtn = document.getElementById('gps-btn');

function setGpsLoading(isLoading) {
    if (isLoading) gpsBtn.classList.add('loading');
    else gpsBtn.classList.remove('loading');
}

function setGpsVisualState(state) {
    gpsBtn.classList.remove('active', 'loop-active', 'single-active');
    if (state === 'loop') {
        gpsBtn.classList.add('active', 'loop-active');
        gpsBtn.textContent = '🔄';
        gpsBtn.title = 'Loop active — double-click to stop';
    } else if (state === 'single') {
        gpsBtn.classList.add('single-active');
        gpsBtn.textContent = '📍';
        gpsBtn.title = 'Single location';
    } else if (state === 'loading') {
        gpsBtn.classList.add('loading');
        gpsBtn.textContent = '⏳';
    } else {
        gpsBtn.textContent = '📍';
        gpsBtn.title = '1 click: single | 2 clicks: loop';
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

function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error('Geolocation not supported.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: READ_TIMEOUT_MS,
            maximumAge: MAX_CACHE_AGE_MS,   // ← aceita cache recente
            ...options
        });
    });
}

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

// ---------- ONE UPDATE (sem isFetching — setTimeout já serializa) ----------
async function updateOnce(showPopup = false) {
    try {
        const position = await getCurrentPosition();
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

        let status = '❌ Ruim';
        if (accuracy <= TARGET_ACCURACY_M) status = '✅ Boa (<15m)';
        else if (accuracy <= 30) status = '🟡 Regular (15-30m)';
        else if (accuracy <= 50) status = '🟠 Fraca (30-50m)';

        const speedKmh = speed != null && !isNaN(speed) ? (speed * 3.6).toFixed(1) + ' km/h' : '—';
        const mode = gpsLoopActive ? '🔄 LOOP' : '📍 ÚNICA';

        document.getElementById('info').innerHTML = `<b>${mode}</b> — ${status}<br>
            Lat: ${latitude.toFixed(6)}<br>
            Lng: ${longitude.toFixed(6)}<br>
            Precisão: ±${accuracy.toFixed(1)} m<br>
            Velocidade: ${speedKmh}`;
    } catch (err) {
        let msg = 'Erro ao obter localização.';
        switch (err.code) {
            case 1: msg = 'Permissão negada. Autorize o GPS.'; break;
            case 2: msg = 'Localização indisponível.'; break;
            case 3: msg = 'Timeout ao obter GPS.'; break;
            default: msg = err.message || msg;
        }
        document.getElementById('info').textContent = msg;
        if (err.code === 1 && gpsLoopActive) stopGpsLoop();
    } finally {
        setGpsLoading(false);
        if (!gpsLoopActive && !singleShotActive) setGpsVisualState('off');
        else if (gpsLoopActive) setGpsVisualState('loop');
    }
}

// ---------- SINGLE SHOT ----------
async function doSingleShot() {
    if (gpsLoopActive) return;
    singleShotActive = true;
    setGpsLoading(true);
    setGpsVisualState('loading');
    document.getElementById('info').textContent = 'Obtendo localização única...';
    await updateOnce(true);
    singleShotActive = false;
    if (!gpsLoopActive) setGpsVisualState('off');
}

// ---------- LOOP (setTimeout recursivo — sem sobreposição) ----------
async function runLoop() {
    await updateOnce(false);
    if (gpsLoopActive) {
        gpsTimeoutId = setTimeout(runLoop, GPS_INTERVAL_MS);
    }
}

function startGpsLoop() {
    if (gpsLoopActive) return;
    gpsLoopActive = true;
    lastDrawnPosition = null;
    setGpsVisualState('loop');
    document.getElementById('info').textContent = 'Loop GPS ativo...';
    runLoop();
}

function stopGpsLoop() {
    if (gpsTimeoutId !== null) {
        clearTimeout(gpsTimeoutId);
        gpsTimeoutId = null;
    }
    gpsLoopActive = false;
    setGpsVisualState('off');
    document.getElementById('info').textContent = 'Loop GPS parado.';
}

// ---------- CLICK DETECTION ----------
gpsBtn.addEventListener('click', () => {
    if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
        if (gpsLoopActive) stopGpsLoop();
        else startGpsLoop();
    } else {
        clickTimer = setTimeout(() => {
            clickTimer = null;
            doSingleShot();
        }, DOUBLE_CLICK_DELAY);
    }
});

setGpsVisualState('off');