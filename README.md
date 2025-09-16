# ALTEKDev Viewer

**Autor:** Ing. Carlos Garzón
**Versión:** 1.0.0
**Licencia:** GPLv2

---

## 📌 Descripción

ALTEKDev Viewer es una herramienta web full-stack que centraliza la consulta de SKUs e históricas de cotizaciones almacenadas en una base de datos PostgreSQL. El proyecto expone un API REST en Node.js/Express y sirve una interfaz React ligera (sin build tools) que permite buscar productos, revisar su ficha detallada y navegar cotizaciones con sus ítems. También ofrece un endpoint para registrar nuevas cotizaciones provenientes de WooCommerce (u otra fuente externa).

## Tabla de contenido
- [Arquitectura general](#arquitectura-general)
- [Características principales](#características-principales)
- [Requisitos previos](#requisitos-previos)
- [Configuración de variables de entorno](#configuración-de-variables-de-entorno)
- [Instalación](#instalación)
- [Ejecución en desarrollo](#ejecución-en-desarrollo)
- [Build y ejecución en producción](#build-y-ejecución-en-producción)
- [Uso con Docker Compose](#uso-con-docker-compose)
- [API REST](#api-rest)
  - [/api/skus](#get-apiskus)
  - [/api/sku/:sku](#get-apisku)
  - [/api/cotizaciones](#get-apicotizaciones)
  - [/api/cotizaciones/:id](#get-apicotizacionesid)
  - [/api/orders](#post-apiorders)
- [Interfaz web](#interfaz-web)
- [Personalización](#personalización)
- [Resolución de problemas](#resolución-de-problemas)

## Arquitectura general

```
┌────────────────────────┐        ┌────────────────────────────┐
│        Cliente         │  HTTP  │        Servidor API         │
│  (React + Bootstrap)   │◀──────▶│ Express + pg + Zod          │
└────────────────────────┘        │ - Sirve /api/*              │
                                 │ - Publica / (frontend)      │
                                 │ - Conecta a PostgreSQL      │
                                 └────────────────────────────┘
```

- **Backend**: Express escrito en TypeScript (`src/server`) con validación de entradas vía Zod y conexión a PostgreSQL mediante `pg`.
- **Frontend**: React 18 montado como módulo ESM en el navegador (`src/web/index.html`) con estilos de Bootstrap 5. El HTML se sirve como contenido estático desde Express.
- **Persistencia**: Base de datos PostgreSQL con al menos los esquemas/tables `inv_items`, `cotizaciones` e `itemsxcotizacion`.

## Características principales

- 🔍 Búsqueda paginada de SKUs con filtros por cadena parcial.
- 🧾 Ficha de detalle para cada SKU mostrando valores relevantes (existencias, costos, etc.).
- 📋 Listado de cotizaciones con paginación y filtros por referencia, cliente, email o identificadores.
- 🧮 Visualización del detalle de cada cotización incluyendo productos asociados y totales estimados.
- 🔄 Endpoint para crear cotizaciones a partir de pedidos de WooCommerce con comportamiento idempotente.
- 🔐 Soporte para múltiples esquemas de base de datos mediante la variable `ALLOWED_SCHEMAS`.
- 🌐 Control de CORS configurable vía `ALLOWED_ORIGIN`.

## Requisitos previos

1. **Node.js 20+ y npm 10+** (se recomienda usar la LTS vigente).
2. **PostgreSQL** accesible desde el servidor (local o remoto) con las tablas necesarias.
3. Opcional: **Docker** y **docker-compose** para levantar el entorno en un contenedor.

## Configuración de variables de entorno

Crea un archivo `.env` en la raíz del proyecto (o configura variables en tu host) con al menos la siguiente información:

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | ✅ | Cadena de conexión de PostgreSQL. Ej.: `postgres://usuario:clave@host:5432/base` |
| `ALLOWED_ORIGIN` | ❌ | Lista separada por comas de orígenes permitidos para CORS. Si se omite, se permite `*`. |
| `ALLOWED_SCHEMAS` | ❌ | Lista separada por comas de esquemas consultables. Por defecto solo `public`. El primero será el esquema por defecto. |
| `PORT` | ❌ | Puerto HTTP donde escuchará Express. Por defecto `8080`. |

> **Notas**
> - El pool de PostgreSQL admite TLS; si tu proveedor lo requiere, habilita la opción comentada `ssl` en `src/server/db.ts`.
> - En producción puedes definir `DATABASE_URL` como variable de entorno del sistema (sin `.env`).

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/tu-organizacion/altekdev-viewer.git
cd altekdev-viewer

# Instalar dependencias
npm install
```

## Ejecución en desarrollo

1. Verifica que `DATABASE_URL` apunte a una base accesible y con datos.
2. Inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   El comando ejecuta `tsx src/server/index.ts`, levanta el API en `http://localhost:8080` (o el puerto configurado) y sirve la interfaz web en la misma dirección.

3. Abre un navegador en `http://localhost:8080` para usar la interfaz.

Durante el desarrollo puedes editar los archivos TypeScript/HTML; `tsx` reinicia el servidor automáticamente tras cada cambio.

## Build y ejecución en producción

1. Compila los archivos TypeScript a JavaScript:

   ```bash
   npm run build
   ```

   Los artefactos se escriben en `dist/`.

2. Arranca el servidor con el código compilado:

   ```bash
   npm run start
   ```

   Asegúrate de que las variables de entorno estén configuradas antes de ejecutar el comando.

Puedes desplegar la carpeta en cualquier servicio que soporte Node.js 20+. Recuerda exponer el puerto configurado y mantener acceso a la base PostgreSQL.

## Uso con Docker Compose

El repositorio incluye `docker-compose.yml` para acelerar la puesta en marcha:

```bash
# Exporta las variables requeridas en tu shell
export DATABASE_URL="postgres://usuario:clave@host:5432/base"
export ALLOWED_ORIGIN="https://mi-dominio.com"

# Levanta el contenedor
docker compose up
```

El contenedor usa la imagen oficial `node:20`, instala dependencias y ejecuta `npm run dev`, exponiendo el puerto 8080. El código fuente se monta como volumen para facilitar el desarrollo.

## API REST

Todas las rutas están prefijadas por `/api`. Las respuestas exitosas incluyen claves `data` y, cuando aplica, `pagination`.

### GET /api/skus

Busca SKUs de forma paginada.

- **Query params**: `search` (texto opcional), `page` (1..n), `pageSize` (1..100), `schema` (opcional, debe pertenecer a `ALLOWED_SCHEMAS`).
- **Respuesta**:

```json
{
  "data": [
    { "item": "SKU-001" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

### GET /api/sku/:sku

Devuelve el registro completo de un SKU.

- **Parámetros**: `sku` en la URL (se normaliza a mayúsculas). Query opcional `schema`.
- **Respuesta**: `{ "data": { ...campos de inv_items... } }`. Si no existe, retorna `404` con mensaje `"SKU no encontrado"`.

### GET /api/cotizaciones

Listado paginado de cotizaciones.

- **Query params**: `search`, `page`, `pageSize`, `schema` (mismas reglas que `/api/skus`). El filtro busca coincidencias en referencia, nombre, email, IDs y `idcotizacionweb`.
- **Respuesta**:

```json
{
  "data": [
    {
      "id": 123,
      "fecha": "2024-01-15T00:00:00.000Z",
      "referencia": "REF-45",
      "nombrecliente": "Cliente Ejemplo",
      "email": "cliente@example.com",
      "idcotizacionweb": 789
    }
  ],
  "pagination": { ... }
}
```

### GET /api/cotizaciones/:id

Recupera una cotización por su `id` interno o por `idcotizacionweb` (WooCommerce).

- **Parámetros**: `id` en la URL; se intenta resolver como número y como cadena.
- **Query**: `schema` opcional.
- **Respuesta**:

```json
{
  "data": {
    "cotizacion": {
      "id": 123,
      "fecha": "2024-01-15T00:00:00.000Z",
      "referencia": "REF-45",
      "nombrecliente": "Cliente Ejemplo",
      "email": "cliente@example.com",
      "telefonos": "3100000000",
      "idcotizacionweb": 789
    },
    "items": [
      {
        "id": 1,
        "sku": "SKU-001",
        "nombre": "Producto demo",
        "cantidad": 2,
        "precioventa": 250000,
        "porcentajedescuento": 5,
        "iva": 19,
        "detalle": "COLECCION WOO"
      }
    ]
  }
}
```

Si no se encuentra la cotización se devuelve `404` con `"Cotización no encontrada"`.

### POST /api/orders

Crea una cotización (cabecera + ítems) a partir de un pedido estilo WooCommerce.

- **Body**:

```json
{
  "schema": "public",
  "order_id": 9999,
  "customer": {
    "name": "Nombre Cliente",
    "phone": "+57 300 000 00 00",
    "email": "cliente@example.com"
  },
  "reference": "Pedido WooCommerce #9999",
  "items": [
    { "sku": "SKU-001", "name": "Producto 1", "qty": 2, "price": 150000, "discount": 0 }
  ]
}
```

- **Respuesta exitosa**:

```json
{
  "ok": true,
  "idcotizacion": 321,
  "schema": "public",
  "items": 1,
  "message": "Cotización creada con éxito"
}
```

- Si ya existe una cotización para `order_id`, responde `200` con `idempotent: true` e incluye el `id` existente.
- Retorna `400` ante validaciones fallidas y `500` si hay SKUs faltantes u otro error durante la transacción.

## Interfaz web

La vista principal (`/`) presenta dos pestañas:

1. **Gestión de SKUs**: tabla paginada con buscador y panel de detalle dinámico. Permite resaltar el SKU seleccionado y visualizar campos adicionales del registro.
2. **Cotizaciones**: tabla de resultados con filtros, selección de cotización y detalle con productos, totales aproximados y datos del cliente.

La interfaz usa Bootstrap 5 y React 18 cargado desde CDN mediante módulos ES, por lo que no requiere herramientas de bundling para funcionar.

## Personalización

- Puedes sobrescribir `window.__ALTEK_API_BASE` antes de cargar `index.html` si necesitas consumir el API desde un host distinto al que sirve el frontend.
- Para añadir campos destacados en el detalle de SKU, edita los arreglos `highlightConfig` y `essentialHighlightKeys` en `src/web/index.html`.
- Si tu base de datos utiliza otro esquema, agrega su nombre a `ALLOWED_SCHEMAS` y selecciona el esquema adecuado vía query param (`?schema=mi_esquema`).

## Resolución de problemas

| Problema | Posible causa / solución |
|----------|-------------------------|
| Error `ECONNREFUSED` al iniciar | `DATABASE_URL` apunta a un host/puerto incorrecto o la base no acepta conexiones remotas. Verifica credenciales y reglas de red. |
| Respuesta `500` con mensaje `SKUs no encontrados...` al crear órdenes | Alguno de los SKUs enviados en `items` no existe en `inv_items`. Revisa la ortografía o sincroniza el catálogo de productos. |
| La interfaz no carga datos y consola muestra error de CORS | Configura `ALLOWED_ORIGIN` con el dominio desde el que se sirve el frontend o verifica que el navegador acceda mediante la misma URL del backend. |
| Se reciben `404` al abrir `/ruta` directamente | El servidor redirige cualquier ruta no-API al `index.html`. Asegúrate de que la petición llegue al backend y no a otro proxy intermedio. |

---

¿Necesitas ampliar la funcionalidad? Revisa `src/server/routes.ts` para extender el API y `src/web/index.html` para adaptar la interfaz.
