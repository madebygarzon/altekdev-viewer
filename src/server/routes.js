// Comments in English inside code as requested.
import { z } from "zod";
import { Router } from "express";
import { pool } from "./db.js";
export const router = Router();
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
    schema: z.string().default("public"), // "public" | "prev"
    order_id: z.number().int().positive(), // idcotizacionweb (id de Woo)
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
        const existing = await client.query(`SELECT id FROM "${schema}"."cotizaciones" WHERE idcotizacionweb = $1 LIMIT 1`, [b.order_id]);
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
        const skusQuery = await client.query(`SELECT id, item FROM "${schema}"."inv_items" WHERE item IN (${placeholders})`, skuList);
        const skuMap = new Map();
        for (const r of skusQuery.rows)
            skuMap.set(String(r.item), Number(r.id));
        // Check missing SKUs
        const missing = skuList.filter(s => !skuMap.has(s));
        if (missing.length > 0) {
            throw new Error(`SKUs no encontrados en ${schema}.inv_items: ${missing.join(", ")}`);
        }
        // Insert header
        const header = await client.query(`INSERT INTO "${schema}"."cotizaciones" (
        fecha, referencia, tipoproceso, idusuario, tipocliente, idcliente,
        idciudadinstalacion, descuento, anticipo, estado, causalnegacion,
        especial, idoc, embalaje, version, idproyecto, iva, idsolicitud,
        vrservicios, nombrecliente, telefonos, email, idcotizacionweb
      ) VALUES (
        CURRENT_DATE, $1, 0, 1, 0, 0,
        0, 0, 0, 0, 0,
        FALSE, 0, 0, 1, 0, 19, 0,
        0, $2, $3, $4, $5
      ) RETURNING id`, [
            (b.reference || `COT. PARA ${b.customer.name}`).slice(0, 60),
            b.customer.name,
            b.customer.phone ?? "",
            b.customer.email,
            b.order_id
        ]);
        const idcotizacion = header.rows[0].id;
        // Insert items (one by one or batch)
        for (const it of b.items) {
            const iditem = skuMap.get(it.sku);
            await client.query(`INSERT INTO "${schema}"."itemsxcotizacion" (
          idcotizacion, detalle, iditem, nombre, cantidad, precioventa, iva,
          especial, espedido, porcentajedescuento
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 19,
          FALSE, FALSE, $7
        )`, [
                idcotizacion,
                "COLECCION WOO",
                iditem,
                it.name,
                it.qty,
                it.price,
                it.discount ?? 0
            ]);
        }
        await client.query("COMMIT");
        res.json({
            ok: true,
            idcotizacion,
            schema,
            items: b.items.length,
            message: "Cotización creada con éxito"
        });
    }
    catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ ok: false, error: err.message });
    }
    finally {
        client.release();
    }
});
