# T4.6 - Seguridad y tolerancia a fallos: P2P

Requisito: RQ14

## Objetivo
Comprobar validacion de entradas, puertos locales, TLS verificado y recuperacion tras interrupciones controladas.

## Alcance y limitaciones
- Pruebas locales de desarrollo en localhost. No son una auditoria de seguridad externa.
- Los procesos se detuvieron y reiniciaron manualmente; no se ha demostrado alta disponibilidad automatica.
- Una conexion TLS local no verificada no demuestra ausencia de HTTPS en un despliegue con proxy inverso.
- Los resultados HALLAZGO y OBSERVADO documentan limitaciones y no se ocultan.

## Seguridad
Evidencia: evidencias/seguridad-p2p-b944640c.json

| Prueba | Estado | Resultado observado |
|---|---|---|
| P2P nodo 1: servicio disponible | OK | 200 |
| P2P nodo 1: cabeceras HTTP | OBSERVADO | {"x-powered-by":"Express","x-content-type-options":null,"strict-transport-security":null} |
| P2P nodo 1: ID inexistente | OK | 404 |
| P2P nodo 1: POST sin titulo | OK | 400 |
| P2P nodo 1: POST titulo numerico | OK | 400 |
| P2P nodo 1: POST titulo vacio | OK | 400 |
| P2P nodo 1: JSON malformado | OK | 400 |
| P2P nodo 1: crear tarea temporal | OK | 201 |
| P2P nodo 1: PUT estado invalido | OK | 400 |
| P2P nodo 1: eliminar tarea temporal | OK | 204 |
| P2P nodo 1: titulo solo espacios | HALLAZGO | 201 |
| P2P nodo 1: limpiar titulo en blanco | OK | 204 |
| P2P nodo 2: servicio disponible | OK | 200 |
| P2P nodo 2: cabeceras HTTP | OBSERVADO | {"x-powered-by":"Express","x-content-type-options":null,"strict-transport-security":null} |
| P2P nodo 2: ID inexistente | OK | 404 |
| P2P nodo 2: POST sin titulo | OK | 400 |
| P2P nodo 2: POST titulo numerico | OK | 400 |
| P2P nodo 2: POST titulo vacio | OK | 400 |
| P2P nodo 2: JSON malformado | OK | 400 |
| P2P nodo 2: crear tarea temporal | OK | 201 |
| P2P nodo 2: PUT estado invalido | OK | 400 |
| P2P nodo 2: eliminar tarea temporal | OK | 204 |
| P2P nodo 2: titulo solo espacios | HALLAZGO | 201 |
| P2P nodo 2: limpiar titulo en blanco | OK | 204 |
| Puerto local 4001 | OK | ABIERTO |
| TLS verificado 4001 | OBSERVADO | ERR_SSL_PACKET_LENGTH_TOO_LONG |
| Puerto local 4002 | OK | ABIERTO |
| TLS verificado 4002 | OBSERVADO | ERR_SSL_PACKET_LENGTH_TOO_LONG |

## Tolerancia a fallos
Evidencia: evidencias/fallos-p2p-570fe5ea.json

| Prueba | Estado | Resultado observado |
|---|---|---|
| P2P nodo 4001 antes del fallo | OK | 200 |
| P2P nodo 4002 antes del fallo | OK | 200 |
| P2P nodo 4002 detenido | OK | sin conexion |
| Nodo 4001 continua operativo | OK | 200 |
| Crear tarea con nodo 4002 caido | OK | 201 |
| P2P nodo 4002 reiniciado | OK | 200 |
| Sincronizacion tras reconexion | OK | tarea recuperada |
| Limpieza tarea temporal | OK | 204 |
| Propagacion de limpieza | OK | 404 |

## Conclusion
Los resultados muestran el comportamiento observado en el entorno local. Las debilidades detectadas deben documentarse como mejoras pendientes y no como controles implementados.
