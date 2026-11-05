// ====== CONFIG ======
let key;
let count = 1;
let namePoints = [];
let coords = [];
let currentRouteLayer = null;
let currentMarkers = [];
let currentRouteToDownload;
const ORS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';

let startCoord = [];
let zoomIn = 6;

// ====== LOAD CONFIG ======
(async function () {
    try {
        const r = await fetch('storage/conf.jdata');
        if (!r.ok) throw new Error('Falha ao carregar conf');
        const texto = await r.text();
        const conf = JData.parse(texto);
        key = conf["Conf"].key;

        const prefCoord = [conf["Conf"].coordLat, conf["Conf"].coordLng];

        startCoord = typeof prefCoord[0] === "number" && typeof prefCoord[1] === "number" ? prefCoord : [-9.098991241978826, -51.62378934230813];
        zoomIn = typeof prefCoord[0] === "number" && typeof prefCoord[1] === "number" ? 12 : 6;
    } catch (erro) {
        document.getElementById('info').textContent = 'Erro ao carregar configuração.';
    } finally {
        initMap();
    }
})();

// ====== INIT MAP ======
function initMap() {

    // ====== BASE LAYERS ======
    const osmLayer = L.tileLayer.offline(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap contributors', subdomains: 'abc', crossOrigin: true, maxZoom: 19 }
    );
    const terrainLayer = L.tileLayer.offline(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19, crossOrigin: true, maxNativeZoom: 16 }
    );
    const satelliteLayer = L.tileLayer.offline(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19, crossOrigin: true, maxNativeZoom: 16 }
    );

    const layers = { osm: osmLayer, terrain: terrainLayer, satellite: satelliteLayer };

    // ====== RESTORE SAVED LAYER ======
    const savedLayer = localStorage.getItem('baseLayer') || 'osm';
    const initialLayer = layers[savedLayer] || osmLayer;

    // ====== INIT MAP ======
    const map = L.map('map', { center: startCoord, zoom: zoomIn, layers: [initialLayer] });
    document.getElementById('info').textContent = 'Insira a rota...';

    // ====== FULLSCREEN CONTROL ======
    L.control.fullscreen({
        position: 'topleft',
        title: 'Tela Cheia',
        titleCancel: 'Sair da Tela Cheia',
        forceSeparateButton: true,
        forcePseudoFullscreen: true // Garante compatibilidade no iPhone
    }).addTo(map);

    // ====== LAYER CONTROL ======
    L.control.layers(
        { 'Ruas (OSM)': osmLayer, 'Terreno (Esri Topo)': terrainLayer, 'Satélite (Esri)': satelliteLayer },
        null, { position: 'topright', collapsed: false }
    ).addTo(map);

    // ====== SAVE MAP OFFLINE ======
    const saveControl = L.control.savetiles(osmLayer, {
        zoomlevels: [16], position: 'topleft', saveText: '💾', rmText: '🗑️'
    });
    saveControl.addTo(map);

    // ====== CUSTOM CONTROL: SAVED ROUTES BUTTON ======
    L.Control.RoutesHistory = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar');
            const btn = L.DomUtil.create('a', 'history-btn', container);
            btn.innerHTML = '📋';
            btn.href = '#';
            btn.title = 'Rotas Salvas';

            const panel = L.DomUtil.create('div', 'history-panel');
            document.body.appendChild(panel);

            L.DomEvent.on(btn, 'click', function (e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                if (panel.classList.contains('active')) {
                    panel.classList.remove('active');
                } else {
                    panel.classList.add('active');
                    loadSavedRoutes(panel);
                }
            });
            return container;
        }
    });
    map.addControl(new L.Control.RoutesHistory());

    // ====== FUNCTION TO LIST SAVED ROUTES ======
    function loadSavedRoutes(panel) {
        panel.innerHTML = '<div class="history-header">Rotas Salvas <span style="cursor:pointer" onclick="this.parentElement.parentElement.classList.remove(\'active\')">✖</span></div>';

        let foundRoutes = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i);

            if (storageKey.startsWith('route_')) {
                foundRoutes++;

                const savedData = JSON.parse(localStorage.getItem(storageKey));
                const visualCoords = savedData.coords.map(c => `[${c[0].toFixed(4)}, ${c[1].toFixed(4)}]`).join(' ➔ ');

                const item = document.createElement('div');
                item.className = 'history-item';

                const itemContent = document.createElement('div');
                itemContent.className = 'history-item-content';
                itemContent.innerHTML = `
                            <b>Rota ${foundRoutes}</b><br>
                            <div class="history-item-route" title="${visualCoords}">${visualCoords}</div>
                        `;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-route-btn';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Excluir Rota';

                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm('Tem certeza que deseja apagar esta rota?')) {
                        localStorage.removeItem(storageKey);

                        if (currentRouteLayer) {
                            map.removeLayer(currentRouteLayer);
                            currentMarkers.forEach(m => map.removeLayer(m));
                            currentRouteLayer = null;
                            currentMarkers = [];
                            document.getElementById('info').textContent = 'Rota removida.';
                        }

                        loadSavedRoutes(panel);
                    }
                };

                itemContent.onclick = () => {
                    const routeData = JSON.parse(localStorage.getItem(storageKey));
                    if (routeData) {
                        namePoints = routeData.names || [];
                        drawRoute(routeData.data, routeData.coords);
                        panel.classList.remove('active');
                    }
                };

                item.appendChild(itemContent);
                item.appendChild(deleteBtn);
                panel.appendChild(item);
            }
        }

        if (foundRoutes === 0) {
            panel.innerHTML += '<div style="padding: 15px; text-align: center; color: #888;">Nenhuma rota salva ainda.</div>';
        }
    }

    // ====== SAVE LAYER ON CHANGE ======
    map.on('baselayerchange', function (e) {
        const name = Object.keys(layers).find(k => layers[k] === e.layer);
        if (name) {
            localStorage.setItem('baseLayer', name);
            saveControl.setLayer(e.layer);
        }
    });

    osmLayer.on('savestart', function (e) { document.getElementById('info').textContent = 'Baixando mapa offline...'; });
    osmLayer.on('saveend', function (e) { document.getElementById('info').textContent = 'Mapa salvo para uso offline!'; });
}