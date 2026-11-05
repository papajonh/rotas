# rotas
Projeto de calcaular rotas com lib opensource ou gratuitas.

versão 1.2

Modo de operação:
* Traçar rota
* Baixar rota
* Carregar rota .jdata
* Salvar mapa offline
* Historico de rotas
* Posição atual
* Rastreamento em tempo real

# 🗺️ Rota com OpenRouteService

Aplicação web de mapa interativo para **traçar rotas**, **salvar/carregar rotas offline** e **rastrear localização GPS em tempo real** (ideal para uso veicular).

Construída com **Leaflet + OpenRouteService + Leaflet.offline**, funciona como PWA leve — sem backend, tudo no navegador.

---

## ✨ Funcionalidades

### 🗺️ Mapa interativo
- 3 camadas base: **Ruas (OSM)**, **Terreno (Esri Topo)** e **Satélite (Esri)**
- Camada escolhida é **salva no `localStorage`** e restaurada ao reabrir
- **Tela cheia** (compatível com iPhone via pseudo-fullscreen)
- **Download de tiles offline** para uso sem internet (`leaflet.offline` + IndexedDB)

### 🛣️ Rotas
- Traçar rotas com **múltiplos waypoints** (adicionar quantos pontos quiser)
- Cálculo via **OpenRouteService API** (perfil `driving-car`)
- Exibe **distância** e **duração** da rota calculada
- Marcadores numerados com **nome customizável** por ponto
- **Cache automático** de rotas no `localStorage` (mesmas coordenadas não gastam API)

### 💾 Salvar / carregar rotas
- Baixar rota como arquivo **`.jdata`** (formato compacto próprio)
- Carregar arquivo `.jdata` de volta no mapa
- **Painel de rotas salvas** (📋) com:
  - Lista de todas as rotas no `localStorage`
  - Visualização das coordenadas de cada rota
  - Clique para **recarregar** rota no mapa
  - Botão 🗑️ para **excluir** rota individual

### 📍 GPS com rastreamento veicular
- **1 clique** → leitura única da localização atual
- **2 cliques** → ativa/desativa **rastreamento contínuo** via `watchPosition`
- **Alta precisão** (`enableHighAccuracy: true`)
- **Filtro de movimento** (`MIN_MOVE_METERS = 5`) — evita "tremida" parado no semáforo
- **Círculo de precisão colorido**:
  - 🟢 Verde: ≤15m (boa)
  - 🟡 Amarelo: 15–30m (regular)
  - 🟠 Laranja: 30–50m (fraca)
  - 🔴 Vermelho: >50m (ruim)
- **Painel de info em tempo real**: lat, lng, precisão, **velocidade (km/h)**
- **Preenche automaticamente** o campo de coordenada inicial (`coord0`)
- **Reativação automática** ao voltar para a aba (Page Visibility API)
- **Pausa visual** (⏸️) quando a aba vai para segundo plano

---

## 🚀 Como usar

### Pré-requisitos
- Navegador moderno (Chrome, Edge, Firefox, Safari)
- **HTTPS** ou `localhost` (obrigatório para GPS e offline)
- Chave da API **OpenRouteService** (gratuita em [openrouteservice.org](https://openrouteservice.org/dev/#/signup))

### Configuração
1. Crie o arquivo `storage/conf.jdata` com sua chave:

> Formato JData. A chave é lida automaticamente no carregamento da página.

2. Abra o `index.html` via servidor HTTPS (ou `localhost`).

### Traçar uma rota
1. Preencha **Coordenada inicial** (ex.: `-3.8575446, -40.9250892`)
2. Clique em **"Adicionar Ponto"** para mais waypoints
3. Preencha os demais pontos
4. Clique em **"Traçar Rota"**
5. A rota é desenhada no mapa + distância/duração exibidas

### Usar o GPS
| Ação | Resultado |
|---|---|
| **1 clique** no botão 📍 | Leitura única — mostra posição e preenche `coord0` |
| **2 cliques** no botão 📍 | Ativa rastreamento contínuo (botão fica 🔄 pulsando vermelho) |
| **2 cliques** de novo | Para o rastreamento |

### Salvar / carregar
- **"Baixar Rota"** → gera `rota.jdata`
- **"Carregar rota"** (input file) → restaura rota no mapa
- **📋** (canto superior esquerdo) → abre painel de rotas salvas

---

## 🧩 Arquitetura técnica

### Bibliotecas
| Lib | Versão | Função |
|---|---|---|
| Leaflet | 1.9.4 | Mapa interativo |
| Leaflet.offline | 3.2.1 | Tiles offline (IndexedDB) |
| Leaflet.fullscreen | 3.0.0 | Tela cheia |
| idb | 7.x | Wrapper IndexedDB |
| OpenRouteService API | v2 | Cálculo de rotas |
| JData (próprio) | — | Serialização compacta |

### Armazenamento (`localStorage`)
| Chave | Conteúdo |
|---|---|
| `baseLayer` | Camada base escolhida (`osm`/`terrain`/`satellite`) |
| `route_<coords>` | Rota cacheada: `{ coords, names, data }` |



