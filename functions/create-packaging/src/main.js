const { Client, Databases, ID, Query } = require("node-appwrite");

const COLLECTIONS = {
  PACKAGING_RECORDS: "packaging_records",
  PACKAGING_ITEMS: "packaging_items",
  PRODUCTS: "products",
  AUDIT_LOGS: "audit_logs",
};

// Batch size for parallel operations to avoid overwhelming Appwrite
const BATCH_SIZE = 20;

/**
 * Process array in batches with parallel execution within each batch
 */
async function processBatches(items, processor, batchSize = BATCH_SIZE) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Appwrite Function: create-packaging
 *
 * Creates a packaging record with all items and updates stock in a single operation.
 * Uses Server SDK (API Key) - NO RATE LIMITS.
 *
 * Expected body:
 * {
 *   packaging_date: string (YYYY-MM-DD),
 *   waybill_number: string,
 *   items: Array<{
 *     product_barcode: string,
 *     product_name?: string,
 *     scanned_at?: string
 *   }>,
 *   stock_updates: Array<{
 *     product_id: string,
 *     deduct_amount: number
 *   }>,
 *   user_id: string,
 *   user_email?: string,
 *   session_id?: string
 * }
 */
module.exports = async (context) => {
  const { req, res, log, error } = context;

  // Track context for error messages
  let traceContext = {
    waybill_number: null,
    packaging_date: null,
    record_id: null,
    current_operation: 'parsing request',
    items_barcodes: [],
    database_id: process.env.APPWRITE_DATABASE_ID || 'NOT_SET',
  };

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      return res.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const {
      packaging_date,
      waybill_number,
      items,
      stock_updates,
      user_id,
      user_email,
      session_id,
    } = body;

    // Update trace context
    traceContext.waybill_number = waybill_number;
    traceContext.packaging_date = packaging_date;
    traceContext.items_barcodes = items?.map(i => i.product_barcode) || [];

    // Validate required fields
    if (!packaging_date || !waybill_number || !items || !user_id) {
      return res.json(
        {
          success: false,
          error:
            "Missing required fields: packaging_date, waybill_number, items, user_id",
        },
        400
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.json(
        { success: false, error: "Items must be a non-empty array" },
        400
      );
    }

    log(
      `Creating packaging record: ${waybill_number} with ${items.length} items`
    );

    // Initialize Appwrite client with Server SDK (API Key)
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);
    const databaseId = process.env.APPWRITE_DATABASE_ID;

    // 1. Create packaging record
    traceContext.current_operation = `creating record in ${COLLECTIONS.PACKAGING_RECORDS}`;
    const record = await databases.createDocument(
      databaseId,
      COLLECTIONS.PACKAGING_RECORDS,
      ID.unique(),
      {
        packaging_date,
        waybill_number,
      }
    );
    traceContext.record_id = record.$id;

    log(`Created packaging record: ${record.$id}`);

    // 2. Create all packaging items in batches to avoid overwhelming Appwrite
    traceContext.current_operation = `creating items in ${COLLECTIONS.PACKAGING_ITEMS}`;
    log(`Creating ${items.length} packaging items in batches of ${BATCH_SIZE}...`);
    const createdItems = await processBatches(items, (item) =>
      databases.createDocument(
        databaseId,
        COLLECTIONS.PACKAGING_ITEMS,
        ID.unique(),
        {
          packaging_record_id: record.$id,
          product_barcode: item.product_barcode,
          scanned_at: item.scanned_at || new Date().toISOString(),
        }
      )
    );

    log(`Created ${createdItems.length} packaging items`);

    // 3. Update stock for products (if stock_updates provided)
    traceContext.current_operation = `updating stock in ${COLLECTIONS.PRODUCTS}`;
    let stockUpdateResults = { success: true, updated: 0, errors: [] };

    if (stock_updates && Array.isArray(stock_updates) && stock_updates.length > 0) {
      log(`Processing ${stock_updates.length} stock updates`);

      // Batch fetch all products to get current stock
      // Appwrite Query.equal() has a limit of 60 values, so we batch the queries
      const productIds = stock_updates.map((u) => u.product_id);
      const BATCH_SIZE = 60;
      const productMap = new Map();

      for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        const batchIds = productIds.slice(i, i + BATCH_SIZE);
        const productsResult = await databases.listDocuments(
          databaseId,
          COLLECTIONS.PRODUCTS,
          [Query.equal("$id", batchIds), Query.limit(batchIds.length)]
        );

        for (const product of productsResult.documents) {
          productMap.set(product.$id, product);
        }
      }

      // Update each product's stock in batches to avoid overwhelming Appwrite
      log(`Updating stock for ${stock_updates.length} products in batches of ${BATCH_SIZE}...`);
      const results = await processBatches(stock_updates, async (update) => {
        const product = productMap.get(update.product_id);
        if (!product) {
          return {
            success: false,
            error: `Product not found (ID: ${update.product_id}) for waybill ${waybill_number}`
          };
        }

        const newStock = Math.max(0, product.stock_quantity - update.deduct_amount);

        try {
          await databases.updateDocument(
            databaseId,
            COLLECTIONS.PRODUCTS,
            update.product_id,
            { stock_quantity: newStock }
          );
          return {
            success: true,
            product_id: update.product_id,
            barcode: product.barcode,
            previous: product.stock_quantity,
            new: newStock,
          };
        } catch (err) {
          // Include traceable info: barcode, product name, waybill
          const errorMsg = `Failed to update stock for product "${product.name}" (barcode: ${product.barcode}) ` +
            `in waybill ${waybill_number}: ${err.message}`;
          return {
            success: false,
            product_id: update.product_id,
            barcode: product.barcode,
            product_name: product.name,
            error: errorMsg,
          };
        }
      });
      stockUpdateResults.updated = results.filter((r) => r.success).length;
      stockUpdateResults.errors = results
        .filter((r) => !r.success)
        .map((r) => r.error);
      stockUpdateResults.success = stockUpdateResults.errors.length === 0;

      log(
        `Stock updates: ${stockUpdateResults.updated} succeeded, ${stockUpdateResults.errors.length} failed`
      );
    }

    // 4. Create a single audit log entry for the entire operation
    try {
      await databases.createDocument(
        databaseId,
        COLLECTIONS.AUDIT_LOGS,
        ID.unique(),
        {
          user_id,
          user_email: user_email || null,
          action_type: "packaging_record_create",
          resource_type: "packaging_record",
          resource_id: record.$id,
          action_details: JSON.stringify({
            packaging_date,
            waybill_number,
            item_count: items.length,
            items: items.map((i) => ({
              barcode: i.product_barcode,
              name: i.product_name,
            })),
            stock_updates_count: stock_updates?.length || 0,
            stock_update_success: stockUpdateResults.success,
          }),
          ip_address: null,
          user_agent: req.headers["user-agent"] || null,
          status: "success",
          error_message: null,
          timestamp: new Date().toISOString(),
          session_id: session_id || null,
        }
      );
      log("Created audit log entry");
    } catch (auditError) {
      // Audit log failure shouldn't fail the whole operation
      error(`Failed to create audit log: ${auditError.message}`);
    }

    // Return success response
    return res.json({
      success: true,
      record: {
        $id: record.$id,
        packaging_date: record.packaging_date,
        waybill_number: record.waybill_number,
        $createdAt: record.$createdAt,
      },
      items: createdItems.map((item) => ({
        $id: item.$id,
        packaging_record_id: item.packaging_record_id,
        product_barcode: item.product_barcode,
        scanned_at: item.scanned_at,
      })),
      stock_updates: stockUpdateResults,
    });
  } catch (err) {
    // Build traceable error message with context
    const contextInfo = [
      `db: ${traceContext.database_id}`,
      traceContext.waybill_number ? `waybill: ${traceContext.waybill_number}` : null,
      traceContext.packaging_date ? `date: ${traceContext.packaging_date}` : null,
      traceContext.items_barcodes.length > 0 ? `barcodes: ${traceContext.items_barcodes.slice(0, 5).join(', ')}${traceContext.items_barcodes.length > 5 ? '...' : ''}` : null,
    ].filter(Boolean).join(', ');

    const traceableError = `Error during "${traceContext.current_operation}" [${contextInfo}]: ${err.message || err}`;
    error(traceableError);

    return res.json(
      {
        success: false,
        error: traceableError,
        context: {
          database_id: traceContext.database_id,
          waybill_number: traceContext.waybill_number,
          packaging_date: traceContext.packaging_date,
          operation: traceContext.current_operation,
        },
      },
      500
    );
  }
};
