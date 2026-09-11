# Logrado por línea NSE — CAM + RD (dump de prod 2026-09-10)

**Conseguidos** = igual al cálculo que hoy usa `/admin/quotas` (leads cuyo `quota_matched_dimension = 'nse'` y `quota_matched_value` coinciden con esa línea — bajo la lógica VIEJA, antes del fix). Incluye leads imputados ahí por condicional.

**NSE real** = NSE real del lead según su encuesta (`quota_segment`), sin importar a qué se imputó — sirve para ver la demanda genuina de cada nivel y ajustar los objetivos.

| País | Región | NSE | Objetivo | Conseguidos | NSE real | Estado |
|---|---|---|--:|--:|--:|---|
| Costa Rica | (SIN REGIÓN) | Nivel 1 | sin cupo | 0 | 2 | ⚪ sin config |
| Costa Rica | (SIN REGIÓN) | Nivel 2 | sin cupo | 0 | 3 | ⚪ sin config |
| Costa Rica | (SIN REGIÓN) | Nivel 4 | sin cupo | 0 | 4 | ⚪ sin config |
| Costa Rica | Area metropolitana I | Nivel 1 | 5 | 5 | 10 | 🟡 completa |
| Costa Rica | Area metropolitana I | Nivel 2 | 7 | 2 | 3 |  |
| Costa Rica | Area metropolitana I | Nivel 3 | 0 | 0 | 7 | ⚪ sin config |
| Costa Rica | Area metropolitana I | Nivel 4 | 21 | 5 | 7 |  |
| Costa Rica | Area metropolitana II | Nivel 1 | 12 | 5 | 5 |  |
| Costa Rica | Area metropolitana II | Nivel 2 | 5 | 4 | 7 |  |
| Costa Rica | Area metropolitana II | Nivel 3 | 5 | 3 | 6 |  |
| Costa Rica | Area metropolitana II | Nivel 4 | 21 | 1 | 2 |  |
| Costa Rica | Area metropolitana III | Nivel 1 | 0 | 0 | 10 | ⚪ sin config |
| Costa Rica | Area metropolitana III | Nivel 2 | 1 | 1 | 15 | 🟡 completa |
| Costa Rica | Area metropolitana III | Nivel 3 | 9 | 9 | 16 | 🟡 completa |
| Costa Rica | Area metropolitana III | Nivel 4 | 25 | 11 | 15 |  |
| Costa Rica | Norte | Nivel 1 | 25 | 3 | 3 |  |
| Costa Rica | Norte | Nivel 2 | 17 | 2 | 2 |  |
| Costa Rica | Norte | Nivel 3 | 12 | 1 | 1 |  |
| Costa Rica | Norte | Nivel 4 | 29 | 2 | 3 |  |
| Costa Rica | Sur occidente | Nivel 1 | 12 | 1 | 2 |  |
| Costa Rica | Sur occidente | Nivel 2 | 12 | 3 | 3 |  |
| Costa Rica | Sur occidente | Nivel 3 | 20 | 3 | 3 |  |
| Costa Rica | Sur occidente | Nivel 4 | 47 | 2 | 2 |  |
| Ecuador | Costa Norte | A | 50 | 0 | 0 |  |
| Ecuador | Costa Norte | B | 50 | 0 | 0 |  |
| Ecuador | Costa Norte | C | 20 | 0 | 0 |  |
| Ecuador | Costa Sur | A | 44 | 0 | 0 |  |
| Ecuador | Costa Sur | B | 44 | 0 | 0 |  |
| Ecuador | Costa Sur | C | 2 | 0 | 0 |  |
| Ecuador | Cuenca | A | 25 | 0 | 0 |  |
| Ecuador | Cuenca | B | 25 | 0 | 0 |  |
| Ecuador | Manta Porto Viejo | A | 25 | 0 | 0 |  |
| Ecuador | Manta Porto Viejo | B | 25 | 0 | 0 |  |
| Ecuador | Manta Porto Viejo | C | 10 | 0 | 0 |  |
| Ecuador | Santo Domingo | A | 41 | 0 | 0 |  |
| Ecuador | Santo Domingo | B | 41 | 0 | 0 |  |
| Ecuador | Santo Domingo | C | 68 | 0 | 0 |  |
| Ecuador | Sierra | A | 35 | 0 | 0 |  |
| Ecuador | Sierra | B | 35 | 0 | 0 |  |
| Ecuador | Zona Perfieria/Valles | A | 33 | 0 | 0 |  |
| Ecuador | Zona Perfieria/Valles | B | 33 | 0 | 0 |  |
| Ecuador | Zona Periferia GYE | A | 35 | 0 | 0 |  |
| Ecuador | Zona Periferia GYE | B | 35 | 0 | 0 |  |
| El Salvador | (SIN REGIÓN) | Nivel 1 | sin cupo | 0 | 2 | ⚪ sin config |
| El Salvador | (SIN REGIÓN) | Nivel 2 | sin cupo | 0 | 1 | ⚪ sin config |
| El Salvador | (SIN REGIÓN) | Nivel 3 | sin cupo | 0 | 3 | ⚪ sin config |
| El Salvador | (SIN REGIÓN) | Nivel 4 | sin cupo | 0 | 1 | ⚪ sin config |
| El Salvador | Centro I | Nivel 1 | 0 | 9 | 2 | 🔴 EXCEDIDA +9 |
| El Salvador | Centro I | Nivel 2 | 0 | 0 | 0 | ⚪ sin config |
| El Salvador | Centro I | Nivel 3 | 0 | 0 | 3 | ⚪ sin config |
| El Salvador | Centro I | Nivel 4 | 0 | 0 | 4 | ⚪ sin config |
| El Salvador | Centro II | Nivel 1 | 0 | 0 | 5 | ⚪ sin config |
| El Salvador | Centro II | Nivel 2 | 3 | 3 | 9 | 🟡 completa |
| El Salvador | Centro II | Nivel 3 | 0 | 0 | 2 | ⚪ sin config |
| El Salvador | Centro II | Nivel 4 | 14 | 20 | 15 | 🔴 EXCEDIDA +6 |
| El Salvador | Centro III | Nivel 1 | 0 | 0 | 2 | ⚪ sin config |
| El Salvador | Centro III | Nivel 2 | 6 | 4 | 7 |  |
| El Salvador | Centro III | Nivel 3 | 0 | 0 | 5 | ⚪ sin config |
| El Salvador | Centro III | Nivel 4 | 7 | 7 | 12 | 🟡 completa |
| El Salvador | NorOriente | Nivel 1 | 9 | 3 | 5 |  |
| El Salvador | NorOriente | Nivel 2 | 5 | 2 | 6 |  |
| El Salvador | NorOriente | Nivel 3 | 0 | 0 | 12 | ⚪ sin config |
| El Salvador | NorOriente | Nivel 4 | 14 | 3 | 10 |  |
| El Salvador | Occidente | Nivel 1 | 5 | 3 | 4 |  |
| El Salvador | Occidente | Nivel 2 | 9 | 4 | 6 |  |
| El Salvador | Occidente | Nivel 3 | 1 | 1 | 14 | 🟡 completa |
| El Salvador | Occidente | Nivel 4 | 20 | 10 | 16 |  |
| Guatemala | (SIN REGIÓN) | Nivel 1 | sin cupo | 0 | 1 | ⚪ sin config |
| Guatemala | (SIN REGIÓN) | Nivel 3 | sin cupo | 0 | 1 | ⚪ sin config |
| Guatemala | (SIN REGIÓN) | Nivel 4 | sin cupo | 0 | 4 | ⚪ sin config |
| Guatemala | Centro I | Nivel 1 | 0 | 0 | 0 | ⚪ sin config |
| Guatemala | Centro I | Nivel 2 | 0 | 0 | 0 | ⚪ sin config |
| Guatemala | Centro I | Nivel 3 | 0 | 0 | 1 | ⚪ sin config |
| Guatemala | Centro I | Nivel 4 | 21 | 1 | 0 |  |
| Guatemala | Centro II | Nivel 1 | 0 | 0 | 11 | ⚪ sin config |
| Guatemala | Centro II | Nivel 2 | 0 | 0 | 10 | ⚪ sin config |
| Guatemala | Centro II | Nivel 3 | 0 | 0 | 3 | ⚪ sin config |
| Guatemala | Centro II | Nivel 4 | 21 | 24 | 10 | 🔴 EXCEDIDA +3 |
| Guatemala | NorOriente | Nivel 1 | 0 | 0 | 3 | ⚪ sin config |
| Guatemala | NorOriente | Nivel 2 | 2 | 2 | 6 | 🟡 completa |
| Guatemala | NorOriente | Nivel 3 | 10 | 2 | 3 |  |
| Guatemala | NorOriente | Nivel 4 | 42 | 11 | 5 |  |
| Guatemala | Resto Centro | Nivel 1 | 19 | 0 | 0 |  |
| Guatemala | Resto Centro | Nivel 2 | 39 | 0 | 0 |  |
| Guatemala | Resto Centro | Nivel 3 | 26 | 1 | 1 |  |
| Guatemala | Resto Centro | Nivel 4 | 0 | 0 | 0 | ⚪ sin config |
| Guatemala | Sur Occidente Chico | Nivel 1 | 1 | 0 | 0 |  |
| Guatemala | Sur Occidente Chico | Nivel 2 | 16 | 2 | 4 |  |
| Guatemala | Sur Occidente Chico | Nivel 3 | 11 | 2 | 9 |  |
| Guatemala | Sur Occidente Chico | Nivel 4 | 35 | 1 | 3 |  |
| Guatemala | Sur Occidente Grande | Nivel 1 | 0 | 0 | 0 | ⚪ sin config |
| Guatemala | Sur Occidente Grande | Nivel 2 | 0 | 0 | 1 | ⚪ sin config |
| Guatemala | Sur Occidente Grande | Nivel 3 | 0 | 0 | 1 | ⚪ sin config |
| Guatemala | Sur Occidente Grande | Nivel 4 | 56 | 7 | 5 |  |
| Honduras | (SIN REGIÓN) | Nivel 1 | sin cupo | 0 | 2 | ⚪ sin config |
| Honduras | (SIN REGIÓN) | Nivel 4 | sin cupo | 0 | 1 | ⚪ sin config |
| Honduras | Centro I | Nivel 1 | 0 | 0 | 5 | ⚪ sin config |
| Honduras | Centro I | Nivel 2 | 0 | 0 | 4 | ⚪ sin config |
| Honduras | Centro I | Nivel 3 | 2 | 2 | 6 | 🟡 completa |
| Honduras | Centro I | Nivel 4 | 7 | 4 | 7 |  |
| Honduras | Centro II | Nivel 1 | 1 | 0 | 2 |  |
| Honduras | Centro II | Nivel 2 | 6 | 0 | 1 |  |
| Honduras | Centro II | Nivel 3 | 3 | 1 | 1 |  |
| Honduras | Centro II | Nivel 4 | 10 | 1 | 1 |  |
| Honduras | Nor Occidente I | Nivel 1 | 0 | 0 | 1 | ⚪ sin config |
| Honduras | Nor Occidente I | Nivel 2 | 0 | 0 | 1 | ⚪ sin config |
| Honduras | Nor Occidente I | Nivel 3 | 0 | 0 | 5 | ⚪ sin config |
| Honduras | Nor Occidente I | Nivel 4 | 10 | 7 | 10 |  |
| Honduras | Nor Occidente II | Nivel 1 | 1 | 1 | 5 | 🟡 completa |
| Honduras | Nor Occidente II | Nivel 2 | 1 | 1 | 1 | 🟡 completa |
| Honduras | Nor Occidente II | Nivel 3 | 8 | 2 | 2 |  |
| Honduras | Nor Occidente II | Nivel 4 | 20 | 1 | 4 |  |
| Honduras | Sur Oriente | Nivel 1 | 8 | 1 | 1 |  |
| Honduras | Sur Oriente | Nivel 2 | 1 | 1 | 2 | 🟡 completa |
| Honduras | Sur Oriente | Nivel 3 | 3 | 1 | 3 |  |
| Honduras | Sur Oriente | Nivel 4 | 16 | 1 | 4 |  |
| Nicaragua | Norcentral | Nivel 1 | 6 | 6 | 8 | 🟡 completa |
| Nicaragua | Norcentral | Nivel 2 | 6 | 0 | 2 |  |
| Nicaragua | Norcentral | Nivel 3 | 11 | 0 | 1 |  |
| Nicaragua | Norcentral | Nivel 4 | 21 | 4 | 7 |  |
| Nicaragua | Occidente | Nivel 1 | 3 | 3 | 7 | 🟡 completa |
| Nicaragua | Occidente | Nivel 2 | 5 | 2 | 3 |  |
| Nicaragua | Occidente | Nivel 3 | 6 | 6 | 6 | 🟡 completa |
| Nicaragua | Occidente | Nivel 4 | 10 | 6 | 13 |  |
| Nicaragua | Sur I | Nivel 1 | 0 | 0 | 11 | ⚪ sin config |
| Nicaragua | Sur I | Nivel 2 | 0 | 0 | 8 | ⚪ sin config |
| Nicaragua | Sur I | Nivel 3 | 6 | 6 | 7 | 🟡 completa |
| Nicaragua | Sur I | Nivel 4 | 8 | 6 | 11 |  |
| Nicaragua | Sur II | Nivel 1 | 0 | 0 | 1 | ⚪ sin config |
| Nicaragua | Sur II | Nivel 2 | 0 | 0 | 2 | ⚪ sin config |
| Nicaragua | Sur II | Nivel 3 | 0 | 0 | 5 | ⚪ sin config |
| Nicaragua | Sur II | Nivel 4 | 0 | 0 | 2 | ⚪ sin config |
| Panamá | (SIN REGIÓN) | Nivel 1 | sin cupo | 0 | 1 | ⚪ sin config |
| Panamá | (SIN REGIÓN) | Nivel 2 | sin cupo | 0 | 2 | ⚪ sin config |
| Panamá | (SIN REGIÓN) | Nivel 3 | sin cupo | 0 | 2 | ⚪ sin config |
| Panamá | (SIN REGIÓN) | Nivel 4 | sin cupo | 0 | 1 | ⚪ sin config |
| Panamá | Centro I | Nivel 1 | 0 | 0 | 25 | ⚪ sin config |
| Panamá | Centro I | Nivel 2 | 8 | 8 | 26 | 🟡 completa |
| Panamá | Centro I | Nivel 3 | 6 | 6 | 17 | 🟡 completa |
| Panamá | Centro I | Nivel 4 | 23 | 4 | 25 |  |
| Panamá | Centro II | Nivel 1 | 0 | 0 | 5 | ⚪ sin config |
| Panamá | Centro II | Nivel 2 | 4 | 2 | 7 |  |
| Panamá | Centro II | Nivel 3 | 5 | 3 | 5 |  |
| Panamá | Centro II | Nivel 4 | 17 | 1 | 2 |  |
| Panamá | Norte | Nivel 1 | 7 | 3 | 6 |  |
| Panamá | Norte | Nivel 2 | 11 | 5 | 7 |  |
| Panamá | Norte | Nivel 3 | 13 | 1 | 2 |  |
| Panamá | Norte | Nivel 4 | 14 | 2 | 3 |  |
| Panamá | Occidente | Nivel 1 | 0 | 0 | 11 | ⚪ sin config |
| Panamá | Occidente | Nivel 2 | 0 | 0 | 9 | ⚪ sin config |
| Panamá | Occidente | Nivel 3 | 20 | 7 | 13 |  |
| Panamá | Occidente | Nivel 4 | 51 | 24 | 10 |  |
| Rep. Dominicana | (SIN REGIÓN) | Nivel 2 | sin cupo | 0 | 1 | ⚪ sin config |
| Rep. Dominicana | (SIN REGIÓN) | Nivel 3 | sin cupo | 0 | 2 | ⚪ sin config |
| Rep. Dominicana | Cibao sin Santiago | Nivel 1 | 0 | 0 | 6 | ⚪ sin config |
| Rep. Dominicana | Cibao sin Santiago | Nivel 2 | 30 | 7 | 11 |  |
| Rep. Dominicana | Cibao sin Santiago | Nivel 3 | 18 | 0 | 1 |  |
| Rep. Dominicana | Cibao sin Santiago | Nivel 4 | 0 | 0 | 2 | ⚪ sin config |
| Rep. Dominicana | Santiago | Nivel 1 | 0 | 0 | 3 | ⚪ sin config |
| Rep. Dominicana | Santiago | Nivel 2 | 24 | 3 | 4 |  |
| Rep. Dominicana | Santiago | Nivel 3 | 8 | 3 | 4 |  |
| Rep. Dominicana | Santiago | Nivel 4 | 0 | 0 | 1 | ⚪ sin config |
| Rep. Dominicana | Santo Domingo + Distrito Nacional | Nivel 1 | 0 | 0 | 34 | ⚪ sin config |
| Rep. Dominicana | Santo Domingo + Distrito Nacional | Nivel 2 | 7 | 7 | 39 | 🟡 completa |
| Rep. Dominicana | Santo Domingo + Distrito Nacional | Nivel 3 | 22 | 12 | 18 |  |
| Rep. Dominicana | Santo Domingo + Distrito Nacional | Nivel 4 | 3 | 3 | 16 | 🟡 completa |
| Rep. Dominicana | Sureste sin Santo Domingo y DN | Nivel 1 | 0 | 0 | 4 | ⚪ sin config |
| Rep. Dominicana | Sureste sin Santo Domingo y DN | Nivel 2 | 14 | 2 | 5 |  |
| Rep. Dominicana | Sureste sin Santo Domingo y DN | Nivel 3 | 10 | 3 | 5 |  |
| Rep. Dominicana | Sureste sin Santo Domingo y DN | Nivel 4 | 2 | 2 | 5 | 🟡 completa |
| Rep. Dominicana | Suroeste | Nivel 1 | 0 | 0 | 5 | ⚪ sin config |
| Rep. Dominicana | Suroeste | Nivel 2 | 22 | 4 | 7 |  |
| Rep. Dominicana | Suroeste | Nivel 3 | 25 | 2 | 3 |  |
| Rep. Dominicana | Suroeste | Nivel 4 | 11 | 4 | 6 |  |
