// ====== EVENT LISTENERS ======
document.getElementById("add-way-points").addEventListener("click", () => {
    count++;
    const wayPointDiv = document.createElement('div');
    wayPointDiv.className = 'way-points';
    wayPointDiv.innerHTML = `
                <div>
                    <label for="name${count}">Nome</label><br>
                    <input id="name${count}" type="text"/>
                </div>
                <div>
                    <label for="coord${count}">Coordenadas</label><br>
                    <input id="coord${count}" type="text"/>
                </div>
            `;
    document.getElementById("pref-coords").appendChild(wayPointDiv);
});

document.getElementById("trace-route").addEventListener("click", () => {
    coords = [];
    namePoints = [];

    for (let i = 0; i <= count; i++) {
        let inputVal = document.getElementById("coord" + i).value;
        const inputName = document.getElementById("name" + i).value;

        inputVal = inputVal.replace(/(\d),(\d)/g, "$1.$2").replace(/[{"lat":"lng":}[\]()]/g, "");

        if (inputVal.trim() !== "") {
            let arryCurrentCoords = inputVal.split(",").map(c => Number(c.trim()));
            if (arryCurrentCoords.length === 2 && !isNaN(arryCurrentCoords[0]) && !isNaN(arryCurrentCoords[1])) {
                coords.push([arryCurrentCoords[0], arryCurrentCoords[1]]);
                namePoints.push(inputName || "Sem nome");
            }
        }
    }

    if (coords.length >= 2) {
        traceRoute(key, coords);
    } else {
        document.getElementById('info').textContent = 'Insira pelo menos duas coordenadas válidas (Ex: -3.85, -40.92).';
    }
});

document.getElementById("download-route").addEventListener("click", () => {
    if (currentRouteToDownload != undefined && currentRouteToDownload != null && currentRouteToDownload != "") {
        const jsonData = JSON.parse(currentRouteToDownload);
        const dataToDownload = JData.stringify(jsonData);

        const blob = new Blob([dataToDownload], { type: 'application/jdata' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'rota.jdata';
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        document.getElementById('info').textContent = 'Sem rota traçada não pode ser baixada!.';
    }
});
document.getElementById("load-route").addEventListener("change", (event) => {
    const reader = new FileReader();
    const file = event.target.files[0];
    const extension = file.name.split('.').pop();

    if (!file) {
        return;
    }
    if (extension.toUpperCase() != "JDATA") {
        alert("Arquivo inválido, não é um tipo .jdata")
        return;
    } else {
        document.getElementById('info').textContent = 'Rota carregada com sucesso.';
    }

    reader.onload = (e) => {
        const dataJData = e.target.result;
        try {
            const dataObject = JData.parse(dataJData);

            if (!dataObject || !dataObject.data || !dataObject.coords) {
                document.getElementById('info').textContent = 'Arquivo não contém rota válida.';
                return;
            }

            let features = dataObject.data.features;
            if (features && !Array.isArray(features)) {
                features = Object.values(features)[0] || [];
            }

            const blocks = features;
            let featureFull = {};

            if (Array.isArray(blocks)) {
                for (const block of blocks) {
                    if (block && typeof block === 'object') {
                        Object.assign(featureFull, block);
                    }
                }
            } else if (blocks && typeof blocks === 'object') {
                featureFull = { ...blocks };
            }

            const geom = featureFull.geometry;
            if (geom) {
                if (!geom.coordinates || !Array.isArray(geom.coordinates)) {
                    const coordsExt = [];
                    const keys = Object.keys(geom).filter(k => !isNaN(parseInt(k))).sort((a, b) => a - b);

                    for (const key of keys) {
                        coordsExt.push(geom[key]);
                    }

                    if (coordsExt.length > 0) {
                        geom.coordinates = coordsExt;
                        keys.forEach(key => delete geom[key]);
                    }
                }
            }

            if (!geom || !Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
                document.getElementById('info').textContent = 'Arquivo não contém geometria de rota válida.';
                return;
            }

            dataObject.data.features = [featureFull];

            namePoints = dataObject.names || [];

            drawRoute(dataObject.data, dataObject.coords);

            const orsCoords = dataObject.coords.map(c => [Number(c[1]), Number(c[0])]);
            const cacheKey = 'route_' + JSON.stringify(orsCoords);
            const payloadToSave = {
                coords: dataObject.coords,
                names: namePoints,
                data: dataObject.data
            };

            try {
                const jsonString = JSON.stringify(payloadToSave);
                localStorage.setItem(cacheKey, jsonString);

            } catch (e) {
                alert("Erro ao salvar: " + e.message);
            }

        } catch (erro) {
            document.getElementById('info').textContent = 'Arquivo inválido: ' + erro.message;
            console.error("ERRO GERAL NO READER:", erro);
            alert("Erro geral: " + erro.message); // Para você ver na tela
        }
    };

    reader.onerror = () => {
        document.getElementById('info').textContent = 'Erro ao ler o arquivo.';
    };
    reader.readAsText(file);
});