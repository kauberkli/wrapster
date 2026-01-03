const { Client, Databases, ID, Query } = require("node-appwrite");

const COLLECTIONS = {
  PACKAGING_RECORDS: "packaging_records",
  PACKAGING_ITEMS: "packaging_items",
  PRODUCTS: "products",
  PRODUCT_COMPONENTS: "product_components",
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
 * Appwrite Function: delete-packaging
 *
 * Deletes a packaging record with all items and restores stock.
 * Uses Server SDK (API Key) - NO RATE LIMITS.
 *
 * Expected body:
 * {
 *   record_id: string,
 *   restore_stock?: boolean,           // Whether to restore stock (default: true)
 *   user_id: string,
 *   user_email?: string,
 *   session_id?: string
 * }
 */
module.exports = async (context) => {
  const { req, res, log, error } = context;

  // Track context for error messages
  let traceContext = {
    record_id: null,
    waybill_number: null,
    packaging_date: null,
    current_operation: 'parsing request',
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
      record_id,
      restore_stock = true,
      user_id,
      user_email,
      session_id,
    } = body;

    traceContext.record_id = record_id;

    // Validate required fields
    if (!record_id || !user_id) {
      return res.json(
        {
          success: false,
          error: "Missing required fields: record_id, user_id",
        },
        400
      );
    }

    log(`Deleting packaging record: ${record_id}`);

    // Initialize Appwrite client with Server SDK (API Key)
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);
    const databaseId = process.env.APPWRITE_DATABASE_ID;

    // 1. Get record details for audit and tracing
    traceContext.current_operation = `fetching record from ${COLLECTIONS.PACKAGING_RECORDS}`;
    let recordDetails = {};
    let packagingDate = null;
    try {
      const record = await databases.getDocument(
        databaseId,
        COLLECTIONS.PACKAGING_RECORDS,
        record_id
      );
      recordDetails = {
        packaging_date: record.packaging_date,
        waybill_number: record.waybill_number,
      };
      packagingDate = record.packaging_date;
      // Update trace context with human-readable info
      traceContext.waybill_number = record.waybill_number;
      traceContext.packaging_date = record.packaging_date;
    } catch (fetchError) {
      // Record may not exist - include traceable info in log
      log(`Record not found (ID: ${record_id}), continuing with deletion. Error: ${fetchError.message}`);
    }

    // 2. Get all items for this record
    const itemsResult = await databases.listDocuments(
      databaseId,
      COLLECTIONS.PACKAGING_ITEMS,
      [
        Query.equal("packaging_record_id", record_id),
        Query.limit(1000),
      ]
    );
    const items = itemsResult.documents;
    log(`Found ${items.length} items to delete`);

    // 3. Restore stock if requested
    traceContext.current_operation = `restoring stock in ${COLLECTIONS.PRODUCTS}`;
    let stockRestoreResults = { success: true, updated: 0, errors: [] };

    if (restore_stock && items.length > 0) {
      log("Restoring stock for deleted items");

      // Get unique barcodes
      const barcodes = [...new Set(items.map((item) => item.product_barcode))];

      // Fetch all products by barcode
      const productsResult = await databases.listDocuments(
        databaseId,
        COLLECTIONS.PRODUCTS,
        [Query.equal("barcode", barcodes), Query.limit(barcodes.length)]
      );

      const productMap = new Map();
      for (const product of productsResult.documents) {
        productMap.set(product.barcode, product);
      }

      // Calculate stock requirements (barcode -> quantity to restore)
      const stockRequirements = new Map();

      // Count occurrences of each barcode
      const barcodeCounts = new Map();
      for (const item of items) {
        const count = barcodeCounts.get(item.product_barcode) || 0;
        barcodeCounts.set(item.product_barcode, count + 1);
      }

      // Process each unique barcode
      for (const [barcode, count] of barcodeCounts) {
        const product = productMap.get(barcode);
        if (!product) {
          stockRestoreResults.errors.push(`Product not found: ${barcode}`);
          continue;
        }

        if (product.type === "bundle") {
          // For bundles, restore component stock
          const componentsResult = await databases.listDocuments(
            databaseId,
            COLLECTIONS.PRODUCT_COMPONENTS,
            [
              Query.equal("parent_product_id", product.$id),
              Query.limit(100),
            ]
          );

          // Get component products
          const componentProductIds = componentsResult.documents.map(
            (c) => c.child_product_id
          );
          if (componentProductIds.length > 0) {
            const componentProductsResult = await databases.listDocuments(
              databaseId,
              COLLECTIONS.PRODUCTS,
              [
                Query.equal("$id", componentProductIds),
                Query.limit(componentProductIds.length),
              ]
            );

            const componentProductMap = new Map();
            for (const cp of componentProductsResult.documents) {
              componentProductMap.set(cp.$id, cp);
            }

            for (const comp of componentsResult.documents) {
              const componentProduct = componentProductMap.get(comp.child_product_id);
              if (componentProduct) {
                const current = stockRequirements.get(componentProduct.$id) || {
                  product: componentProduct,
                  quantity: 0,
                };
                current.quantity += comp.quantity * count;
                stockRequirements.set(componentProduct.$id, current);
              }
            }
          }
        } else {
          // For single products, restore 1 per item
          const current = stockRequirements.get(product.$id) || {
            product,
            quantity: 0,
          };
          current.quantity += count;
          stockRequirements.set(product.$id, current);
        }
      }

      // Update stock for all products in batches to avoid overwhelming Appwrite
      const stockUpdateEntries = Array.from(stockRequirements.entries());
      log(`Restoring stock for ${stockUpdateEntries.length} products in batches of ${BATCH_SIZE}...`);

      const results = await processBatches(stockUpdateEntries, async ([productId, { product, quantity }]) => {
        try {
          const newStock = product.stock_quantity + quantity;
          await databases.updateDocument(
            databaseId,
            COLLECTIONS.PRODUCTS,
            productId,
            { stock_quantity: newStock }
          );
          return {
            success: true,
            product_id: productId,
            barcode: product.barcode,
            previous: product.stock_quantity,
            new: newStock,
            restored: quantity,
          };
        } catch (err) {
          // Include traceable info: barcode, product name, waybill
          const errorMsg = `Failed to restore stock for product "${product.name}" (barcode: ${product.barcode}) ` +
            `in waybill ${traceContext.waybill_number || 'unknown'}: ${err.message}`;
          return {
            success: false,
            product_id: productId,
            barcode: product.barcode,
            product_name: product.name,
            error: errorMsg,
          };
        }
      });
      stockRestoreResults.updated = results.filter((r) => r.success).length;
      stockRestoreResults.errors.push(
        ...results.filter((r) => !r.success).map((r) => r.error)
      );
      stockRestoreResults.success = stockRestoreResults.errors.length === 0;

      log(
        `Stock restore: ${stockRestoreResults.updated} succeeded, ${stockRestoreResults.errors.length} failed`
      );
    }

    // 4. Delete all items in batches to avoid overwhelming Appwrite
    traceContext.current_operation = `deleting items from ${COLLECTIONS.PACKAGING_ITEMS}`;
    log(`Deleting ${items.length} items in batches of ${BATCH_SIZE}...`);
    await processBatches(items, (item) =>
      databases.deleteDocument(
        databaseId,
        COLLECTIONS.PACKAGING_ITEMS,
        item.$id
      )
    );
    log(`Deleted ${items.length} items`);

    // 5. Delete the record
    traceContext.current_operation = `deleting record from ${COLLECTIONS.PACKAGING_RECORDS}`;
    try {
      await databases.deleteDocument(
        databaseId,
        COLLECTIONS.PACKAGING_RECORDS,
        record_id
      );
      log("Deleted packaging record");
    } catch (deleteError) {
      // Record may already be deleted - include waybill for tracing
      log(`Record deletion note for waybill ${traceContext.waybill_number || record_id}: ${deleteError.message}`);
    }

    // 6. Create audit log entry
    try {
      await databases.createDocument(
        databaseId,
        COLLECTIONS.AUDIT_LOGS,
        ID.unique(),
        {
          user_id,
          user_email: user_email || null,
          action_type: "packaging_record_delete",
          resource_type: "packaging_record",
          resource_id: record_id,
          action_details: JSON.stringify({
            ...recordDetails,
            items_deleted: items.length,
            stock_restored: restore_stock,
            stock_restore_success: stockRestoreResults.success,
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
      error(`Failed to create audit log: ${auditError.message}`);
    }

    // Return success response
    return res.json({
      success: true,
      deleted: {
        record_id,
        items_count: items.length,
        packaging_date: packagingDate,
      },
      stock_restore: stockRestoreResults,
    });
  } catch (err) {
    // Build traceable error message with context
    const contextInfo = [
      `db: ${traceContext.database_id}`,
      traceContext.waybill_number ? `waybill: ${traceContext.waybill_number}` : null,
      traceContext.packaging_date ? `date: ${traceContext.packaging_date}` : null,
      traceContext.record_id ? `record_id: ${traceContext.record_id}` : null,
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
