# Sobre-entrega de cuota por región — CAM + RD

_Generado 2026-09-10 desde dump de producción (`prod-quotas.dump`)._

**Regla:** el objetivo por país+región es el techo. `objetivo` = tope manual cargado, o Σ de las líneas NSE si no hay tope manual. Región sin config = debería estar cerrada.

## Resumen

- **Regiones excedidas:** 14
- **Leads entregados por encima del objetivo de su región:** 115
- **Leads calificados sin región identificada:** 34
- **Total fuera de la solicitud del cliente:** ~149

## Regiones EXCEDIDAS

| País | Región | Objetivo | Fuente | Logrado | Exceso |
|---|---|--:|--|--:|--:|
| Panamá | Centro I | 57 | manual | 93 | **+36** |
| Nicaragua | Sur II | 0 | sin config | 10 | **+10** |
| Costa Rica | (SIN REGIÓN) | 0 | sin config | 9 | **+9** |
| El Salvador | Centro I | 0 | sin config | 9 | **+9** |
| El Salvador | (SIN REGIÓN) | 0 | sin config | 7 | **+7** |
| Nicaragua | Sur I | 30 | manual | 37 | **+7** |
| Rep. Dominicana | Santo Domingo + Distrito Nacional | 100 | manual | 107 | **+7** |
| Costa Rica | Area metropolitana III | 50 | manual | 56 | **+6** |
| Guatemala | (SIN REGIÓN) | 0 | sin config | 6 | **+6** |
| Panamá | (SIN REGIÓN) | 0 | sin config | 6 | **+6** |
| Guatemala | Centro II | 30 | manual | 34 | **+4** |
| Honduras | (SIN REGIÓN) | 0 | sin config | 3 | **+3** |
| Rep. Dominicana | (SIN REGIÓN) | 0 | sin config | 3 | **+3** |
| Honduras | Centro I | 20 | manual | 22 | **+2** |

## Leads calificados SIN región identificada (matched como 'exception')

| País | Leads |
|---|--:|
| Costa Rica | 9 |
| El Salvador | 7 |
| Guatemala | 6 |
| Panamá | 6 |
| Rep. Dominicana | 3 |
| Honduras | 3 |

## Estado completo por región

| País | Región | Objetivo | Fuente | Logrado | Disponible | Exceso | Estado |
|---|---|--:|--|--:|--:|--:|---|
| Costa Rica | (SIN REGIÓN) | 0 | sin config | 9 | 0 | 9 | 🔴 EXCESO |
| Costa Rica | Area metropolitana I | 48 | manual | 27 | 21 |  | 56% |
| Costa Rica | Area metropolitana II | 60 | manual | 20 | 40 |  | 33% |
| Costa Rica | Area metropolitana III | 50 | manual | 56 | 0 | 6 | 🔴 EXCESO |
| Costa Rica | Norte | 120 | manual | 9 | 111 |  | 8% |
| Costa Rica | Sur occidente | 130 | manual | 10 | 120 |  | 8% |
| Ecuador | Costa Norte | 120 | Σ NSE | 0 | 120 |  | 0% |
| Ecuador | Costa Sur | 90 | Σ NSE | 0 | 90 |  | 0% |
| Ecuador | Cuenca | 50 | Σ NSE | 0 | 50 |  | 0% |
| Ecuador | Manta Porto Viejo | 60 | Σ NSE | 0 | 60 |  | 0% |
| Ecuador | Santo Domingo | 150 | Σ NSE | 0 | 150 |  | 0% |
| Ecuador | Sierra | 70 | Σ NSE | 0 | 70 |  | 0% |
| Ecuador | Zona Perfieria/Valles | 66 | Σ NSE | 0 | 66 |  | 0% |
| Ecuador | Zona Periferia GYE | 70 | Σ NSE | 0 | 70 |  | 0% |
| El Salvador | (SIN REGIÓN) | 0 | sin config | 7 | 0 | 7 | 🔴 EXCESO |
| El Salvador | Centro I | 0 | sin config | 9 | 0 | 9 | 🔴 EXCESO |
| El Salvador | Centro II | 48 | manual | 31 | 17 |  | 65% |
| El Salvador | Centro III | 35 | manual | 26 | 9 |  | 74% |
| El Salvador | NorOriente | 75 | manual | 33 | 42 |  | 44% |
| El Salvador | Occidente | 100 | manual | 40 | 60 |  | 40% |
| Guatemala | (SIN REGIÓN) | 0 | sin config | 6 | 0 | 6 | 🔴 EXCESO |
| Guatemala | Centro I | 30 | manual | 1 | 29 |  | 3% |
| Guatemala | Centro II | 30 | manual | 34 | 0 | 4 | 🔴 EXCESO |
| Guatemala | NorOriente | 78 | manual | 17 | 61 |  | 22% |
| Guatemala | Resto Centro | 120 | manual | 1 | 119 |  | 1% |
| Guatemala | Sur Occidente Chico | 90 | manual | 16 | 74 |  | 18% |
| Guatemala | Sur Occidente Grande | 80 | manual | 7 | 73 |  | 9% |
| Honduras | (SIN REGIÓN) | 0 | sin config | 3 | 0 | 3 | 🔴 EXCESO |
| Honduras | Centro I | 20 | manual | 22 | 0 | 2 | 🔴 EXCESO |
| Honduras | Centro II | 40 | manual | 5 | 35 |  | 12% |
| Honduras | Nor Occidente I | 20 | manual | 17 | 3 |  | 85% |
| Honduras | Nor Occidente II | 60 | manual | 12 | 48 |  | 20% |
| Honduras | Sur Oriente | 56 | manual | 10 | 46 |  | 18% |
| Nicaragua | Norcentral | 93 | manual | 18 | 75 |  | 19% |
| Nicaragua | Occidente | 50 | manual | 29 | 21 |  | 58% |
| Nicaragua | Sur I | 30 | manual | 37 | 0 | 7 | 🔴 EXCESO |
| Nicaragua | Sur II | 0 | sin config | 10 | 0 | 10 | 🔴 EXCESO |
| Panamá | (SIN REGIÓN) | 0 | sin config | 6 | 0 | 6 | 🔴 EXCESO |
| Panamá | Centro I | 57 | manual | 93 | 0 | 36 | 🔴 EXCESO |
| Panamá | Centro II | 40 | manual | 19 | 21 |  | 48% |
| Panamá | Norte | 70 | manual | 18 | 52 |  | 26% |
| Panamá | Occidente | 110 | manual | 43 | 67 |  | 39% |
| Rep. Dominicana | (SIN REGIÓN) | 0 | sin config | 3 | 0 | 3 | 🔴 EXCESO |
| Rep. Dominicana | Cibao sin Santiago | 150 | manual | 20 | 130 |  | 13% |
| Rep. Dominicana | Santiago | 100 | manual | 12 | 88 |  | 12% |
| Rep. Dominicana | Santo Domingo + Distrito Nacional | 100 | manual | 107 | 0 | 7 | 🔴 EXCESO |
| Rep. Dominicana | Sureste sin Santo Domingo y DN | 80 | manual | 19 | 61 |  | 24% |
| Rep. Dominicana | Suroeste | 180 | manual | 21 | 159 |  | 12% |
