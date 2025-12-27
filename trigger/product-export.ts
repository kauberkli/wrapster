import { task, logger } from "@trigger.dev/sdk/v3";
import { Client, Databases, Storage, ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import * as XLSX from "xlsx";

interface ExportPayload {
  jobId: string;
  userId: string;
  filters?: {
    type?: "single" | "bundle";
  };
}

interface ExportResult {
  fileId: string;
  fileName: string;
  totalProducts: number;
}

const COLLECTIONS = {
  PRODUCTS: "products",
  IMPORT_JOBS: "import_jobs",
} as const;

const BATCH_SIZE = 100;
const API_DELAY = 50;

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
  resultFileId?: string,
  error?: string
) {
  const databaseId = process.env.APPWRITE_DATABASE_ID!;
  const updateData: Record<string, unknown> = { status };

  if (resultFileId) {
    updateData.result_file_id = resultFileId;
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

export const productExportTask = task({
  id: "product-export",
  retry: { maxAttempts: 3 },
  queue: {
    concurrencyLimit: 5,
  },
  onFailure: async ({ payload, error }) => {
    logger.error("Product export task failed permanently", { jobId: payload.jobId, error });
    await markJobFailed(payload.jobId, error instanceof Error ? error.message : "Task failed after all retries");
  },
  run: async (payload: ExportPayload): Promise<ExportResult> => {
    const { jobId, userId, filters } = payload;
    const { databases, storage } = createAppwriteClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID!;
    const bucketId = process.env.APPWRITE_BUCKET_ID!;

    logger.info("Starting product export", { jobId, userId, filters });

    try {
      // Update job status to processing
      await updateJobStatus(databases, jobId, "processing");

      // Build query
      const queries: string[] = [];
      if (filters?.type) {
        queries.push(Query.equal("type", filters.type));
      }

      // Fetch all products with pagination
      const allProducts: Array<{
        $id: string;
        barcode: string;
        sku_code: string | null;
        name: string;
        type: string;
        cost: number;
        $createdAt: string;
      }> = [];

      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await databases.listDocuments(databaseId, COLLECTIONS.PRODUCTS, [
          ...queries,
          Query.limit(BATCH_SIZE),
          Query.offset(offset),
        ]);

        for (const doc of result.documents) {
          allProducts.push({
            $id: doc.$id,
            barcode: doc.barcode as string,
            sku_code: doc.sku_code as string | null,
            name: doc.name as string,
            type: doc.type as string,
            cost: doc.cost as number,
            $createdAt: doc.$createdAt,
          });
        }

        offset += result.documents.length;
        hasMore = result.documents.length === BATCH_SIZE;

        if (hasMore) {
          await delay(API_DELAY);
        }
      }

      logger.info(`Fetched ${allProducts.length} products for export`);

      // Prepare data for Excel
      const exportData = allProducts.map((product, index) => ({
        "No.": index + 1,
        Barcode: product.barcode,
        "SKU Code": product.sku_code || "",
        "Product Name": product.name,
        Type: product.type === "bundle" ? "Bundle" : "Single",
        Cost: product.cost,
        "Created At": new Date(product.$createdAt).toLocaleString(),
      }));

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      worksheet["!cols"] = [
        { wch: 6 }, // No.
        { wch: 15 }, // Barcode
        { wch: 15 }, // SKU Code
        { wch: 30 }, // Product Name
        { wch: 10 }, // Type
        { wch: 12 }, // Cost
        { wch: 20 }, // Created At
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

      // Generate file buffer
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      // Generate filename with date
      const date = new Date().toISOString().split("T")[0];
      const fileName = `products_export_${date}_${Date.now()}.xlsx`;

      // Upload to Appwrite Storage
      logger.info("Uploading export file to storage");
      const file = await storage.createFile(
        bucketId,
        ID.unique(),
        InputFile.fromBuffer(buffer, fileName)
      );

      // Update job status to completed
      await updateJobStatus(databases, jobId, "completed", file.$id);

      logger.info("Export completed", { fileId: file.$id, fileName, totalProducts: allProducts.length });

      return {
        fileId: file.$id,
        fileName,
        totalProducts: allProducts.length,
      };
    } catch (error) {
      logger.error("Export failed", { error });
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
