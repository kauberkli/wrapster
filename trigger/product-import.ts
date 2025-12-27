import { task, logger } from "@trigger.dev/sdk/v3";
import { Client, Databases, Storage, ID, Query } from "node-appwrite";
import * as XLSX from "xlsx";

interface ImportPayload {
  jobId: string;
  fileId: string;
  userId: string;
}

interface ImportStats {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface ProductRow {
  Barcode: string;
  "SKU Code"?: string;
  "Product Name": string;
  Type: string;
  Cost?: number;
  "Stock Quantity"?: number;
  "Bundle Components"?: string;
}

interface CachedProduct {
  $id: string;
  name: string;
  sku_code: string | null;
  cost: number;
  stock_quantity: number;
  type: string;
}

const COLLECTIONS = {
  PRODUCTS: "products",
  PRODUCT_COMPONENTS: "product_components",
  IMPORT_JOBS: "import_jobs",
} as const;

const API_DELAY = 50; // 50ms between API calls

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createAppwriteClient() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

  return {
    databases: new Databases(client),
    storage: new Storage(client),
  };
}

async function updateJobStatus(
  databases: Databases,
  jobId: string,
  status: string,
  stats?: ImportStats,
  error?: string
) {
  const databaseId = process.env.APPWRITE_DATABASE_ID!;
  const updateData: Record<string, unknown> = { status };

  if (stats) {
    updateData.stats = JSON.stringify(stats);
  }
  if (error) {
    updateData.error = error;
  }
  if (status === "completed" || status === "failed") {
    updateData.completed_at = new Date().toISOString();
  }

  await databases.updateDocument(databaseId, COLLECTIONS.IMPORT_JOBS, jobId, updateData);
}

async function markJobFailed(jobId: string, errorMessage: string) {
  try {
    const { databases } = createAppwriteClient();
    await updateJobStatus(databases, jobId, "failed", undefined, errorMessage);
  } catch (e) {
    logger.error("Failed to update job status", { jobId, error: e });
  }
}

async function fetchAllProducts(databases: Databases): Promise<Map<string, CachedProduct>> {
  const databaseId = process.env.APPWRITE_DATABASE_ID!;
  const cache = new Map<string, CachedProduct>();
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await databases.listDocuments(databaseId, COLLECTIONS.PRODUCTS, [
      Query.limit(batchSize),
      Query.offset(offset),
    ]);

    for (const doc of result.documents) {
      cache.set(doc.barcode as string, {
        $id: doc.$id,
        name: doc.name as string,
        sku_code: doc.sku_code as string | null,
        cost: doc.cost as number,
        stock_quantity: (doc.stock_quantity as number) ?? 0,
        type: doc.type as string,
      });
    }

    offset += result.documents.length;
    hasMore = result.documents.length === batchSize;
    await delay(API_DELAY);
  }

  return cache;
}

export const productImportTask = task({
  id: "product-import",
  retry: { maxAttempts: 3 },
  queue: {
    concurrencyLimit: 5,
  },
  onFailure: async ({ payload, error }) => {
    logger.error("Product import task failed permanently", { jobId: payload.jobId, error });
    await markJobFailed(payload.jobId, error instanceof Error ? error.message : "Task failed after all retries");
  },
  run: async (payload: ImportPayload) => {
    const { jobId, fileId, userId } = payload;
    const { databases, storage } = createAppwriteClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID!;
    const bucketId = process.env.APPWRITE_BUCKET_ID!;

    logger.info("Starting product import", { jobId, fileId, userId });

    try {
      // Update job status to processing
      await updateJobStatus(databases, jobId, "processing");

      // Download file from Appwrite Storage
      logger.info("Downloading file from storage");
      const arrayBuffer = await storage.getFileDownload(bucketId, fileId);

      // Parse Excel file
      logger.info("Parsing Excel file");
      const workbook = XLSX.read(arrayBuffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<ProductRow>(worksheet);

      if (jsonData.length === 0) {
        await updateJobStatus(databases, jobId, "completed", {
          imported: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        });
        return { success: true, stats: { imported: 0, updated: 0, skipped: 0, failed: 0 } };
      }

      logger.info(`Processing ${jsonData.length} rows`);

      // Pre-fetch all existing products
      const productCache = await fetchAllProducts(databases);
      const productMap = new Map<string, string>();

      // Copy existing product IDs to map
      for (const [barcode, product] of productCache) {
        productMap.set(barcode, product.$id);
      }

      const stats: ImportStats = {
        imported: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
      };

      // Collect bundles for second pass
      const bundlesToProcess: Array<{
        barcode: string;
        sku_code?: string;
        name: string;
        cost: number;
        stock_quantity: number;
        components: string;
        existingId?: string;
      }> = [];

      // First pass: Import/update single products
      for (const row of jsonData) {
        if (!row.Barcode || !row["Product Name"]) {
          stats.skipped++;
          continue;
        }

        const barcode = String(row.Barcode).trim();
        const type = (row.Type || "Single").toLowerCase();
        const skuCode = row["SKU Code"] ? String(row["SKU Code"]).trim() : undefined;
        const name = String(row["Product Name"]).trim();
        const cost = Number(row.Cost) || 0;
        const stockQuantity = Number(row["Stock Quantity"]) || 0;
        const components = row["Bundle Components"] || "";

        const existing = productCache.get(barcode);

        if (type === "bundle") {
          bundlesToProcess.push({
            barcode,
            sku_code: skuCode,
            name,
            cost,
            stock_quantity: stockQuantity,
            components,
            existingId: existing?.$id,
          });
        } else {
          if (existing) {
            const hasChanges =
              existing.name !== name ||
              existing.sku_code !== (skuCode || null) ||
              existing.cost !== cost ||
              existing.stock_quantity !== stockQuantity;

            if (hasChanges) {
              try {
                await delay(API_DELAY);
                await databases.updateDocument(databaseId, COLLECTIONS.PRODUCTS, existing.$id, {
                  sku_code: skuCode || null,
                  name,
                  cost,
                  stock_quantity: stockQuantity,
                });
                productCache.set(barcode, { ...existing, name, sku_code: skuCode || null, cost, stock_quantity: stockQuantity });
                stats.updated++;
              } catch (err) {
                logger.error("Failed to update product", { barcode, error: err });
                stats.failed++;
              }
            } else {
              stats.skipped++;
            }
          } else {
            try {
              await delay(API_DELAY);
              const newProduct = await databases.createDocument(
                databaseId,
                COLLECTIONS.PRODUCTS,
                ID.unique(),
                {
                  barcode,
                  sku_code: skuCode || null,
                  name,
                  type: "single",
                  cost,
                  stock_quantity: stockQuantity,
                }
              );
              productMap.set(barcode, newProduct.$id);
              productCache.set(barcode, {
                $id: newProduct.$id,
                name,
                sku_code: skuCode || null,
                cost,
                stock_quantity: stockQuantity,
                type: "single",
              });
              stats.imported++;
            } catch (err) {
              logger.error("Failed to create product", { barcode, error: err });
              stats.failed++;
            }
          }
        }
      }

      // Second pass: Import/update bundles with components
      for (const bundle of bundlesToProcess) {
        try {
          let bundleId: string;

          if (bundle.existingId) {
            const existing = productCache.get(bundle.barcode);
            const hasChanges =
              existing &&
              (existing.name !== bundle.name ||
                existing.sku_code !== (bundle.sku_code || null) ||
                existing.cost !== bundle.cost ||
                existing.stock_quantity !== bundle.stock_quantity);

            if (hasChanges) {
              await delay(API_DELAY);
              await databases.updateDocument(databaseId, COLLECTIONS.PRODUCTS, bundle.existingId, {
                sku_code: bundle.sku_code || null,
                name: bundle.name,
                cost: bundle.cost,
                stock_quantity: bundle.stock_quantity,
              });
            }
            bundleId = bundle.existingId;

            // Remove existing components
            const existingComponents = await databases.listDocuments(
              databaseId,
              COLLECTIONS.PRODUCT_COMPONENTS,
              [Query.equal("parent_product_id", bundleId)]
            );

            for (const comp of existingComponents.documents) {
              await delay(API_DELAY);
              await databases.deleteDocument(databaseId, COLLECTIONS.PRODUCT_COMPONENTS, comp.$id);
            }

            stats.updated++;
          } else {
            await delay(API_DELAY);
            const newBundle = await databases.createDocument(
              databaseId,
              COLLECTIONS.PRODUCTS,
              ID.unique(),
              {
                barcode: bundle.barcode,
                sku_code: bundle.sku_code || null,
                name: bundle.name,
                type: "bundle",
                cost: bundle.cost,
                stock_quantity: bundle.stock_quantity,
              }
            );
            bundleId = newBundle.$id;
            productMap.set(bundle.barcode, bundleId);
            stats.imported++;
          }

          // Add components
          if (bundle.components) {
            const componentParts = bundle.components.split(",");
            for (const part of componentParts) {
              const [componentBarcode, qtyStr] = part.trim().split(":");
              if (componentBarcode) {
                const componentId = productMap.get(componentBarcode.trim());
                if (componentId) {
                  await delay(API_DELAY);
                  await databases.createDocument(
                    databaseId,
                    COLLECTIONS.PRODUCT_COMPONENTS,
                    ID.unique(),
                    {
                      parent_product_id: bundleId,
                      child_product_id: componentId,
                      quantity: parseInt(qtyStr) || 1,
                    }
                  );
                }
              }
            }
          }
        } catch (err) {
          logger.error("Failed to process bundle", { barcode: bundle.barcode, error: err });
          stats.failed++;
        }
      }

      // Update job status to completed
      await updateJobStatus(databases, jobId, "completed", stats);

      // Clean up uploaded file
      try {
        await storage.deleteFile(bucketId, fileId);
      } catch {
        logger.warn("Failed to delete import file", { fileId });
      }

      logger.info("Import completed", { stats });
      return { success: true, stats };
    } catch (error) {
      logger.error("Import failed", { error });
      await updateJobStatus(
        databases,
        jobId,
        "failed",
        undefined,
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  },
});
