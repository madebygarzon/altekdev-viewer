// Comments in English inside code as requested.
import { z } from "zod";
import { Router } from "express";
import { pool } from "./db.js";

export const router = Router();

/** Shared helpers */
const allowedSchemas = (process.env.ALLOWED_SCHEMAS ?? "public")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
if (allowedSchemas.length === 0) {
  allowedSchemas.push("public");
}
const defaultSchema = allowedSchemas[0];
const SchemaParam = z.enum(allowedSchemas as [string, ...string[]]);

const basePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  schema: SchemaParam.optional()
});

const skuQuerySchema = basePaginationSchema.extend({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform(value => (value && value.length > 0 ? value : undefined))
});

const skuDetailParamsSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_\-\.\/ ]+$/, "SKU inválido")
    .transform(value => value.toUpperCase())
});

const skuDetailQuerySchema = z.object({
  schema: SchemaParam.optional()
});

const cotizacionesQuerySchema = basePaginationSchema.extend({
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform(value => (value && value.length > 0 ? value : undefined))
});

const cotizacionDetailQuerySchema = z.object({
  schema: SchemaParam.optional()
});

const cotizacionDetailParamsSchema = z.object({
  id: z.string().trim().min(1)
});

/** GET /api/skus?search=&page=&pageSize= */
router.get("/skus", async (req, res) => {
  const parsed = skuQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }
  const { search, page, pageSize, schema } = parsed.data;
  const schemaName = schema ?? defaultSchema;

  try {
    const params: Array<string | number> = [];
    const conditions: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`item ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*)::bigint AS total FROM "${schemaName}"."inv_items" ${where}`;
    const countResult = await pool.query(countQuery, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const limitPlaceholder = params.length + 1;
    const offsetPlaceholder = params.length + 2;
    const dataQuery = `SELECT item FROM "${schemaName}"."inv_items" ${where} ORDER BY item ASC LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`;
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const listResult = await pool.query(dataQuery, listParams);

    res.json({
      data: listResult.rows.map(row => ({ item: row.item })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** GET /api/sku/:sku */
router.get("/sku/:sku", async (req, res) => {
  const paramsResult = skuDetailParamsSchema.safeParse(req.params);
  const queryResult = skuDetailQuerySchema.safeParse(req.query);
  if (!paramsResult.success || !queryResult.success) {
    const error = !paramsResult.success ? paramsResult.error : queryResult.error;
    return res.status(400).json({ ok: false, error: error.flatten() });
  }

  const sku = paramsResult.data.sku;
  const schemaName = queryResult.data.schema ?? defaultSchema;

  try {
    const detailQuery = `SELECT * FROM "${schemaName}"."inv_items" WHERE UPPER(item) = $1 LIMIT 1`;
    const result = await pool.query(detailQuery, [sku]);
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "SKU no encontrado" });
    }

    res.json({ data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** GET /api/cotizaciones */
router.get("/cotizaciones", async (req, res) => {
  const parsed = cotizacionesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }
  const { search, page, pageSize, schema } = parsed.data;
  const schemaName = schema ?? defaultSchema;

  try {
    const params: Array<string | number> = [];
    const addParam = (value: string | number) => {
      params.push(value);
      return `$${params.length}`;
    };
    const conditions: string[] = [];

    if (search) {
      const like = `%${search}%`;
      const clauseParts = [
        `c.referencia ILIKE ${addParam(like)}`,
        `c.nombrecliente ILIKE ${addParam(like)}`,
        `c.email ILIKE ${addParam(like)}`
      ];

      const numeric = Number(search);
      if (Number.isInteger(numeric)) {
        clauseParts.push(`c.id = ${addParam(numeric)}`);
      }

      clauseParts.push(`CAST(c.idcotizacionweb AS TEXT) ILIKE ${addParam(like)}`);
      conditions.push(`(${clauseParts.join(" OR ")})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*)::bigint AS total FROM "${schemaName}"."cotizaciones" c ${where}`;
    const countResult = await pool.query(countQuery, params);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const limitPlaceholder = params.length + 1;
    const offsetPlaceholder = params.length + 2;
    const dataQuery = `SELECT c.id, c.fecha, c.referencia, c.nombrecliente, c.email, c.idcotizacionweb
      FROM "${schemaName}"."cotizaciones" c
      ${where}
      ORDER BY c.fecha DESC, c.id DESC
      LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`;
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const listResult = await pool.query(dataQuery, listParams);

    res.json({
      data: listResult.rows.map(row => ({
        id: Number(row.id),
        fecha: row.fecha,
        referencia: row.referencia,
        nombrecliente: row.nombrecliente,
        email: row.email,
        idcotizacionweb: row.idcotizacionweb
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** GET /api/cotizaciones/:id */
router.get("/cotizaciones/:id", async (req, res) => {
  const paramsResult = cotizacionDetailParamsSchema.safeParse(req.params);
  const queryResult = cotizacionDetailQuerySchema.safeParse(req.query);
  if (!paramsResult.success || !queryResult.success) {
    const error = !paramsResult.success ? paramsResult.error : queryResult.error;
    return res.status(400).json({ ok: false, error: error.flatten() });
  }

  const rawId = paramsResult.data.id;
  const schemaName = queryResult.data.schema ?? defaultSchema;

  try {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    const addValue = (value: string | number) => {
      values.push(value);
      return `$${values.length}`;
    };

    const numericId = Number(rawId);
    if (Number.isInteger(numericId)) {
      conditions.push(`c.id = ${addValue(numericId)}`);
    }
    conditions.push(`CAST(c.idcotizacionweb AS TEXT) = ${addValue(rawId)}`);

    const whereClause = conditions.length > 0 ? conditions.join(" OR ") : "FALSE";
    const headerQuery = `SELECT c.id, c.fecha, c.referencia, c.nombrecliente, c.email, c.telefonos, c.idcotizacionweb
      FROM "${schemaName}"."cotizaciones" c
      WHERE ${whereClause}
      ORDER BY c.fecha DESC
      LIMIT 1`;
    const headerResult = await pool.query(headerQuery, values);
    if (headerResult.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Cotización no encontrada" });
    }

    const cotizacion = headerResult.rows[0];
    const itemsQuery = `SELECT ixc.id, ixc.iditem, ixc.nombre, ixc.cantidad, ixc.precioventa, ixc.porcentajedescuento, ixc.iva, ixc.detalle,
        ii.item AS sku, ii.nombre AS nombre_producto
      FROM "${schemaName}"."itemsxcotizacion" ixc
      LEFT JOIN "${schemaName}"."inv_items" ii ON ii.id = ixc.iditem
      WHERE ixc.idcotizacion = $1
      ORDER BY ixc.id ASC`;
    const itemsResult = await pool.query(itemsQuery, [Number(cotizacion.id)]);

    res.json({
      data: {
        cotizacion: {
          id: Number(cotizacion.id),
          fecha: cotizacion.fecha,
          referencia: cotizacion.referencia,
          nombrecliente: cotizacion.nombrecliente,
          email: cotizacion.email,
          telefonos: cotizacion.telefonos,
          idcotizacionweb: cotizacion.idcotizacionweb
        },
        items: itemsResult.rows.map(row => ({
          id: Number(row.id),
          iditem: row.iditem ? Number(row.iditem) : null,
          nombre: row.nombre,
          cantidad: Number(row.cantidad),
          precioventa: Number(row.precioventa),
          porcentajedescuento: Number(row.porcentajedescuento),
          iva: Number(row.iva),
          detalle: row.detalle,
          sku: row.sku ?? null,
          nombre_producto: row.nombre_producto ?? null
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** ...deja intactos tus endpoints existentes... */

/** Orders payload schema (WooCommerce-like) */
const OrderItem = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().positive(),
  price: z.number().nonnegative(),
  discount: z.number().min(0).max(100).default(0)
});

const OrderBody = z.object({
  schema: SchemaParam.default(defaultSchema),
  order_id: z.number().int().positive(),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(""),
    email: z.string().email()
  }),
  reference: z.string().optional().default("Pedido WooCommerce"),
  items: z.array(OrderItem).min(1)
});

/** POST /api/orders - Create quote (header + items) atomically */
router.post("/orders", async (req, res) => {
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }
  const b = parsed.data;
  const schema = b.schema;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency: reject if idcotizacionweb already exists
    const existing = await client.query(
      `SELECT id FROM "${schema}"."cotizaciones" WHERE idcotizacionweb = $1 LIMIT 1`,
      [b.order_id]
    );
    if (existing.rowCount > 0) {
      // Return existing id (idempotent behavior)
      await client.query("ROLLBACK");
      return res.json({
        ok: true,
        idcotizacion: existing.rows[0].id,
        schema,
        idempotent: true,
        message: `Cotización ya existía para idcotizacionweb=${b.order_id}`
      });
    }

    // Resolve all item IDs by SKU in one round-trip
    const skuList = [...new Set(b.items.map(i => i.sku.trim()))];
    const placeholders = skuList.map((_, i) => `$${i + 1}`).join(",");
    const skusQuery = await client.query(
      `SELECT id, item FROM "${schema}"."inv_items" WHERE item IN (${placeholders})`,
      skuList
    );
    const skuMap = new Map<string, number>();
    for (const r of skusQuery.rows) skuMap.set(String(r.item), Number(r.id));

    // Check missing SKUs
    const missing = skuList.filter(s => !skuMap.has(s));
    if (missing.length > 0) {
      throw new Error(`SKUs no encontrados en ${schema}.inv_items: ${missing.join(", ")}`);
    }

    // Insert header
    const header = await client.query(
      `INSERT INTO "${schema}"."cotizaciones" (
        fecha, referencia, tipoproceso, idusuario, tipocliente, idcliente,
        idciudadinstalacion, descuento, anticipo, estado, causalnegacion,
        especial, idoc, embalaje, version, idproyecto, iva, idsolicitud,
        vrservicios, nombrecliente, telefonos, email, idcotizacionweb
      ) VALUES (
        CURRENT_DATE, $1, 0, 1, 0, 0,
        0, 0, 0, 0, 0,
        FALSE, 0, 0, 1, 0, 19, 0,
        0, $2, $3, $4, $5
      ) RETURNING id`,
      [
        (b.reference || `COT. PARA ${b.customer.name}`).slice(0, 60),
        b.customer.name,
        b.customer.phone ?? "",
        b.customer.email,
        b.order_id
      ]
    );
    const idcotizacion = header.rows[0].id;

    // Insert items (one by one or batch)
    for (const it of b.items) {
      const iditem = skuMap.get(it.sku)!;
      await client.query(
        `INSERT INTO "${schema}"."itemsxcotizacion" (
          idcotizacion, detalle, iditem, nombre, cantidad, precioventa, iva,
          especial, espedido, porcentajedescuento
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 19,
          FALSE, FALSE, $7
        )`,
        [
          idcotizacion,
          "COLECCION WOO",
          iditem,
          it.name,
          it.qty,
          it.price,
          it.discount ?? 0
        ]
      );
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      idcotizacion,
      schema,
      items: b.items.length,
      message: "Cotización creada con éxito"
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});
