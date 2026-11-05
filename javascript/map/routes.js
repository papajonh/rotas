// ====== TRACE ROUTE ======
async function traceRoute(key, coords) {
    const infoDiv = document.getElementById('info');
    infoDiv.textContent = 'Calculando rota...';

    if (!key) {
        infoDiv.textContent = 'API Key não encontrada.';
        return;
    }

    const orsCoords = coords.map(c => [Number(c[1]), Number(c[0])]);
    const cacheKey = 'route_' + JSON.stringify(orsCoords);

    try {
        const cached = localStorage.getItem(cacheKey);
        let routeData;

        if (cached) {
            console.log('Rota carregada do cache');
            const parsedCache = JSON.parse(cached);
            routeData = parsedCache.data;
            namePoints = parsedCache.names || namePoints;
            drawRoute(routeData, coords);
        } else {
            const resp = await fetch(ORS_URL, {
                method: 'POST',
                headers: { 'Authorization': key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: orsCoords, instructions: false })
            });

            if (!resp.ok) {
                const err = await resp.text();
                console.error('Erro ORS:', resp.status, err);
                infoDiv.textContent = `Erro ao calcular rota (${resp.status}). Verifique as coordenadas.`;
                return;
            }

            routeData = await resp.json();

            const payloadToSave = {
                coords: coords,
                names: namePoints,
                data: routeData
            };

            try {
                localStorage.setItem(cacheKey, JSON.stringify(payloadToSave));
            } catch (e) {
                console.warn('Não foi possível salvar a rota no cache:', e);
            }

            drawRoute(routeData, coords);
        }

    } catch (e) {
        console.error('Erro na requisição:', e);
        infoDiv.textContent = 'Erro de conexão com o serviço de rotas.';
    }
}

// ====== DRAW ROUTE ======
function drawRoute(data, coordsOriginais) {
    const infoDiv = document.getElementById('info');

    const payloadToSave = {
        coords: coordsOriginais,
        names: namePoints,
        data: data
    };

    currentRouteToDownload = JSON.stringify(payloadToSave);

    if (currentRouteLayer) {
        map.removeLayer(currentRouteLayer);
    }

    currentMarkers.forEach(marker => map.removeLayer(marker));
    currentMarkers = [];

    currentRouteLayer = L.geoJSON(data, {
        style: { color: '#2c7be5', weight: 6, opacity: 0.85 }
    }).addTo(map);

    coordsOriginais.forEach((c, i) => {
        const name = namePoints[i] ? namePoints[i].toUpperCase() : "PONTO " + (i + 1);
        const marker = L.marker(c, { icon: customIcon })
            .addTo(map)
            .bindPopup(`<b>PONTO ${i + 1}</b><br><b>${name}</b><br>Lat: ${c[0]}<br>Lng: ${c[1]}`);
        currentMarkers.push(marker);
    });

    map.fitBounds(currentRouteLayer.getBounds(), { padding: [30, 30] });

    const summary = data.features[0].properties.summary;
    const distKm = (summary.distance / 1000).toFixed(2);
    const durMin = Math.round(summary.duration / 60);
    infoDiv.innerHTML = `<b>Rota calculada</b><br>Distância: ${distKm} km<br>Duração: ${durMin} min`;
}