# Prototipo P2P

Prototipo Peer-to-Peer del sistema colaborativo de gestión de tareas del proyecto de Servicios Telemáticos.

Cada nodo ejecuta su propio servicio y mantiene localmente sus tareas.

En el Sprint 1 se implementó el CRUD local de cada nodo. La propagación y sincronización entre nodos se incorporará en el Sprint 2.

## Requisitos

Para ejecutar el proyecto localmente se necesita:

- Git
- Node.js 26.x
- npm 12.x

Para ejecutar los nodos mediante contenedores:

- Docker
- Docker Compose

En Windows se recomienda utilizar Git, Node.js y Docker Desktop.

## Entorno probado

El proyecto fue probado con:

- Node.js 26.10.0
- npm 12.1.0
- TypeScript 5.9.x
- Express 5.2.1
- ESLint 10.12.x
- tsx 4.23.x
- Docker 29.9.0
- Docker Compose 5.6.0

El Dockerfile utiliza:

```text
node:26-alpine
```

## Instalación

Clonar:

```bash
git clone https://github.com/FabriCordovaCaceres/servicios-telematicos-p2p.git
```

Entrar al proyecto:

```bash
cd servicios-telematicos-p2p
```

Instalar dependencias:

```bash
npm ci
```

## Verificación

```bash
npm run lint
npm run build
```

## Ejecución de nodos en Linux

Nodo 1:

```bash
PORT=4001 NODE_ID=nodo-1 npm run dev
```

Nodo 2:

```bash
PORT=4002 NODE_ID=nodo-2 npm run dev
```

## Ejecución en Windows PowerShell

Nodo 1:

```powershell
$env:PORT="4001"
$env:NODE_ID="nodo-1"
npm run dev
```

En otra terminal PowerShell, nodo 2:

```powershell
$env:PORT="4002"
$env:NODE_ID="nodo-2"
npm run dev
```

## Puertos utilizados

```text
Nodo 1: 4001
Nodo 2: 4002
```

## Comprobar los nodos

```bash
curl http://localhost:4001/
curl http://localhost:4002/
```

Se espera una respuesta similar a:

```json
{
  "arquitectura": "P2P",
  "nodo": "nodo-1",
  "puerto": 4001,
  "estado": "activo"
}
```

## API REST local

Cada nodo dispone de los siguientes endpoints:

```text
GET    /tasks
GET    /tasks/:id
POST   /tasks
PUT    /tasks/:id
DELETE /tasks/:id
```

Estados permitidos:

```text
pendiente
en_progreso
finalizada
```

## Ejemplo

Crear una tarea en el nodo 1:

```bash
curl -X POST http://localhost:4001/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "titulo":"Tarea del nodo 1",
    "descripcion":"Prueba P2P"
  }'
```

Consultar tareas del nodo 1:

```bash
curl http://localhost:4001/tasks
```

Consultar tareas del nodo 2:

```bash
curl http://localhost:4002/tasks
```

En el Sprint 1 una tarea creada en el nodo 1 todavía no aparece automáticamente en el nodo 2.

La sincronización P2P se implementará posteriormente.

## Docker

Construir la imagen:

```bash
docker build -t tele-p2p .
```

Ejecutar nodo 1:

```bash
docker run --rm \
  -p 4001:4001 \
  -e PORT=4001 \
  -e NODE_ID=nodo-1 \
  --name tele-p2p-1 \
  tele-p2p
```

Ejecutar nodo 2:

```bash
docker run --rm \
  -p 4002:4002 \
  -e PORT=4002 \
  -e NODE_ID=nodo-2 \
  --name tele-p2p-2 \
  tele-p2p
```

Comprobar:

```bash
curl http://localhost:4001/
curl http://localhost:4002/
```

## Almacenamiento

Cada nodo mantiene las tareas en memoria.

Los datos se pierden cuando se detiene el nodo.

##Virtualización

 **Guía completa paso a paso:** [VIRTUALIZACION.md](https://github.com/FabriCordovaCaceres/servicios-telematicos-cliente-servidor/blob/main/docs/VIRTUALIZACION.md) (en el repositorio de Cliente-Servidor).

### Topología

| VM | IP | Servicios |
|---|---|---|
| VM1 `vm1-cs-p2p` | 192.168.56.11 | Cliente-Servidor :3000 + **P2P nodo-1 :4001** |
| VM2 `vm2-p2p-micro` | 192.168.56.12 | **P2P nodo-2 :4002** + Microservicio de tareas :5001 |

### Desplegar el nodo 1 en VM1

Dentro de VM1 (`ssh grupo10@192.168.56.11`):

```bash
mkdir -p ~/proyecto && cd ~/proyecto
git clone https://github.com/FabriCordovaCaceres/servicios-telematicos-p2p.git
cd ~/proyecto/servicios-telematicos-p2p
docker build -t tele-p2p .
docker run -d --name tele-p2p-1 --restart unless-stopped -p 4001:4001 -e PORT=4001 -e NODE_ID=nodo-1 tele-p2p
```

### Desplegar el nodo 2 en VM2

Dentro de VM2 (`ssh grupo10@192.168.56.12`):

```bash
mkdir -p ~/proyecto && cd ~/proyecto
git clone https://github.com/FabriCordovaCaceres/servicios-telematicos-p2p.git
cd ~/proyecto/servicios-telematicos-p2p
docker build -t tele-p2p .
docker run -d --name tele-p2p-2 --restart unless-stopped -p 4002:4002 -e PORT=4002 -e NODE_ID=nodo-2 tele-p2p
```

### Comprobar ambos nodos a través de la red

```bash
curl http://192.168.56.11:4001/   # nodo-1 (VM1)
curl http://192.168.56.12:4002/   # nodo-2 (VM2)
```

> **Estado en el Sprint 1:** una tarea creada en el nodo 1 todavía **no** aparece en el nodo 2. La sincronización entre pares (RQ6) se implementa en el Sprint 2, usando las IPs fijas de esta topología para que cada nodo conozca a su par.

### Actualizar tras un cambio en GitHub

En cada VM (ejemplo para el nodo 1; en VM2 usar `tele-p2p-2`, puerto `4002` y `NODE_ID=nodo-2`):

```bash
cd ~/proyecto/servicios-telematicos-p2p
git pull
docker build -t tele-p2p .
docker rm -f tele-p2p-1
docker run -d --name tele-p2p-1 --restart unless-stopped -p 4001:4001 -e PORT=4001 -e NODE_ID=nodo-1 tele-p2p
```
