# T4.6 - Seguridad y tolerancia a fallos: P2P

Requisito: RQ14

## Objetivo
Comprobar validacion de entradas, puertos, TLS verificado y recuperacion tras interrupciones controladas.

## Alcance y limitaciones
- Entorno virtualizado (direcciones por variables de entorno). No son una auditoria de seguridad externa.
- Los procesos se detuvieron y reiniciaron manualmente; no se ha demostrado alta disponibilidad automatica.
- Una conexion TLS local no verificada no demuestra ausencia de HTTPS en un despliegue con proxy inverso.
- Los resultados HALLAZGO y OBSERVADO documentan limitaciones y no se ocultan.

## Seguridad
Evidencia: evidencias/vm-seguridad-p2p-ff75358f.json

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
| P2P nodo 1: PUT titulo solo espacios | OK | 400 |
| P2P nodo 1: PUT estado invalido | OK | 400 |
| P2P nodo 1: eliminar tarea temporal | OK | 204 |
| P2P nodo 1: titulo solo espacios | OK | 400 |
| P2P nodo 2: servicio disponible | OK | 200 |
| P2P nodo 2: cabeceras HTTP | OBSERVADO | {"x-powered-by":"Express","x-content-type-options":null,"strict-transport-security":null} |
| P2P nodo 2: ID inexistente | OK | 404 |
| P2P nodo 2: POST sin titulo | OK | 400 |
| P2P nodo 2: POST titulo numerico | OK | 400 |
| P2P nodo 2: POST titulo vacio | OK | 400 |
| P2P nodo 2: JSON malformado | OK | 400 |
| P2P nodo 2: crear tarea temporal | OK | 201 |
| P2P nodo 2: PUT titulo solo espacios | OK | 400 |
| P2P nodo 2: PUT estado invalido | OK | 400 |
| P2P nodo 2: eliminar tarea temporal | OK | 204 |
| P2P nodo 2: titulo solo espacios | OK | 400 |
| Puerto 4001 en 192.168.56.11 | OK | ABIERTO |
| TLS verificado 4001 | OBSERVADO | ERR_SSL_WRONG_VERSION_NUMBER |
| Puerto 4002 en 192.168.56.12 | OK | ABIERTO |
| TLS verificado 4002 | OBSERVADO | ERR_SSL_WRONG_VERSION_NUMBER |

## Tolerancia a fallos
Evidencia: evidencias/vm-fallos-p2p-0d55d3db.json

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
Los resultados muestran el comportamiento observado en el entorno virtualizado (direcciones por variables de entorno). Las debilidades detectadas deben documentarse como mejoras pendientes y no como controles implementados.
