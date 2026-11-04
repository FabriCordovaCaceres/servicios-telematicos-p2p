# T4.5 - Pruebas de comunicacion: P2P

Requisito: RQ14

## Objetivo
Evaluar mensajes duplicados, interrupcion de un nodo y reconexion.

## Resultados
- Conexion inicial: OK. Nodos 4001 y 4002 conectados.
- Duplicacion: MITIGADO. Los mensajes con igual ID y version no generaron tareas duplicadas.
- Interrupcion: OBSERVADO. Se detuvo temporalmente el nodo 4002.
- Disponibilidad: OK. El nodo 4001 continuo aceptando tareas.
- Reconexion: RECUPERADO. El nodo 4002 sincronizo la tarea creada durante la interrupcion.
- Eliminaciones: propagadas correctamente al nodo 4002.

## Evidencia
- resultados/p2p-f66a54e3.json

## Conclusion
La arquitectura mantuvo operaciones durante la interrupcion y recupero la sincronizacion al reconectar.
