import { task, logger } from "@trigger.dev/sdk/v3";
import { Client, Databases, Storage, ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import * as XLSX from "xlsx";

interface ReportExportPayload {
  jobId: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  format: "excel" | "pdf";
}

interface PackagingRecord {
  $id: string;
  packaging_date: string;
  waybill_number: string;
}

interface PackagingItem {
  $id: string;
  packaging_record_id: string;
  product_barcode: string;
  scanned_at: string;
}

interface Product {
  $id: string;
  barcode: string;
  name: string;
}

const COLLECTIONS = {
  PACKAGING_RECORDS: "packaging_records",
  PACKAGING_ITEMS: "packaging_items",
  PRODUCTS: "products",
  IMPORT_JOBS: "import_jobs",
} as const;

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
  stats?: object,
  error?: string
) {
  const databaseId = process.env.APPWRITE_DATABASE_ID!;
  const updateData: Record<string, unknown> = { status };

  if (resultFileId) {
    updateData.result_file_id = resultFileId;
  }
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
    await updateJobStatus(databases, jobId, "failed", undefined, undefined, errorMessage);
  } catch (e) {
    logger.error("Failed to update job status", { jobId, error: e });
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toISOString().replace("T", " ").substring(0, 19);
}

export const reportExportTask = task({
  id: "report-export",
  retry: { maxAttempts: 3 },
  queue: {
    concurrencyLimit: 5,
  },
  onFailure: async ({ payload, error }) => {
    logger.error("Report export task failed permanently", { jobId: payload.jobId, error });
    await markJobFailed(payload.jobId, error instanceof Error ? error.message : "Task failed after all retries");
  },
  run: async (payload: ReportExportPayload) => {
    const { jobId, userId, startDate, endDate, format } = payload;
    const { databases, storage } = createAppwriteClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID!;
    const bucketId = process.env.APPWRITE_BUCKET_ID!;

    logger.info("Starting report export", { jobId, userId, startDate, endDate, format });

    try {
      await updateJobStatus(databases, jobId, "processing");

      // Fetch all packaging records in the date range
      const allRecords: PackagingRecord[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const result = await databases.listDocuments(databaseId, COLLECTIONS.PACKAGING_RECORDS, [
          Query.greaterThanEqual("packaging_date", startDate),
          Query.lessThanEqual("packaging_date", endDate),
          Query.orderAsc("packaging_date"),
          Query.limit(limit),
          Query.offset(offset),
        ]);

        for (const doc of result.documents) {
          allRecords.push({
            $id: doc.$id,
            packaging_date: doc.packaging_date as string,
            waybill_number: doc.waybill_number as string,
          });
        }

        if (result.documents.length < limit) break;
        offset += limit;
        await delay(API_DELAY);
      }

      logger.info(`Fetched ${allRecords.length} packaging records`);

      if (allRecords.length === 0) {
        await updateJobStatus(databases, jobId, "completed", undefined, {
          records: 0,
          items: 0,
        });
        return { success: true, records: 0, items: 0 };
      }

      // Fetch all items for each record
      const allItems: Array<PackagingItem & { waybill_number: string; packaging_date: string }> = [];

      for (const record of allRecords) {
        const itemsResult = await databases.listDocuments(databaseId, COLLECTIONS.PACKAGING_ITEMS, [
          Query.equal("packaging_record_id", record.$id),
          Query.orderAsc("scanned_at"),
        ]);

        for (const item of itemsResult.documents) {
          allItems.push({
            $id: item.$id,
            packaging_record_id: item.packaging_record_id as string,
            product_barcode: item.product_barcode as string,
            scanned_at: item.scanned_at as string,
            waybill_number: record.waybill_number,
            packaging_date: record.packaging_date,
          });
        }
        await delay(API_DELAY);
      }

      logger.info(`Fetched ${allItems.length} packaging items`);

      // Build product map
      const uniqueBarcodes = [...new Set(allItems.map((item) => item.product_barcode))];
      const productMap = new Map<string, string>();

      for (const barcode of uniqueBarcodes) {
        const result = await databases.listDocuments(databaseId, COLLECTIONS.PRODUCTS, [
          Query.equal("barcode", barcode),
          Query.limit(1),
        ]);
        if (result.documents.length > 0) {
          productMap.set(barcode, result.documents[0].name as string);
        } else {
          productMap.set(barcode, "Unknown Product");
        }
        await delay(API_DELAY);
      }

      // Create daily summary
      const dailySummary = new Map<string, { records: number; items: number }>();
      for (const record of allRecords) {
        const existing = dailySummary.get(record.packaging_date) || { records: 0, items: 0 };
        existing.records += 1;
        dailySummary.set(record.packaging_date, existing);
      }
      for (const item of allItems) {
        const existing = dailySummary.get(item.packaging_date);
        if (existing) {
          existing.items += 1;
        }
      }

      // Calculate product quantities
      const quantityMap = new Map<string, { barcode: string; quantity: number }>();
      for (const item of allItems) {
        const productName = productMap.get(item.product_barcode) || "Unknown Product";
        const existing = quantityMap.get(productName);
        if (existing) {
          existing.quantity += 1;
        } else {
          quantityMap.set(productName, { barcode: item.product_barcode, quantity: 1 });
        }
      }

      const productQuantities = Array.from(quantityMap.entries())
        .map(([name, data]) => ({ name, barcode: data.barcode, quantity: data.quantity }))
        .sort((a, b) => b.quantity - a.quantity);

      // Generate Excel file
      logger.info("Generating Excel file");

      const exportData = allItems.map((item, index) => ({
        "No.": index + 1,
        Date: item.packaging_date,
        Waybill: item.waybill_number,
        "Product Barcode": item.product_barcode,
        "Product Name": productMap.get(item.product_barcode) || "Unknown",
        "Scanned At": formatDate(item.scanned_at),
      }));

      const summaryData = [
        { Metric: "Report Period", Value: `${startDate} to ${endDate}` },
        { Metric: "Total Records", Value: allRecords.length },
        { Metric: "Total Items Scanned", Value: allItems.length },
        { Metric: "Unique Products", Value: uniqueBarcodes.length },
        { Metric: "Generated At", Value: formatDate(new Date().toISOString()) },
      ];

      const dailySummaryData = Array.from(dailySummary.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          Date: date,
          Records: data.records,
          "Items Scanned": data.items,
        }));

      const productQuantitiesData = productQuantities.map((p, index) => ({
        "No.": index + 1,
        "Product Name": p.name,
        Barcode: p.barcode,
        "Total Quantity": p.quantity,
      }));

      // Create workbook
      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      summarySheet["!cols"] = [{ wch: 20 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      const dailySheet = XLSX.utils.json_to_sheet(dailySummaryData);
      dailySheet["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Summary");

      const productSheet = XLSX.utils.json_to_sheet(productQuantitiesData);
      productSheet["!cols"] = [{ wch: 6 }, { wch: 40 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, productSheet, "Product Quantities");

      const detailsSheet = XLSX.utils.json_to_sheet(exportData);
      detailsSheet["!cols"] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 25 },
        { wch: 15 },
        { wch: 40 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(workbook, detailsSheet, "Details");

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      const fileName = `packaging-report-${startDate}-to-${endDate}.xlsx`;

      // Upload to storage
      logger.info("Uploading report to storage");
      const file = await storage.createFile(bucketId, ID.unique(), InputFile.fromBuffer(buffer, fileName));

      // Update job status
      await updateJobStatus(databases, jobId, "completed", file.$id, {
        records: allRecords.length,
        items: allItems.length,
        products: uniqueBarcodes.length,
      });

      logger.info("Report export completed", { fileId: file.$id, records: allRecords.length, items: allItems.length });

      return {
        success: true,
        fileId: file.$id,
        fileName,
        records: allRecords.length,
        items: allItems.length,
      };
    } catch (error) {
      logger.error("Report export failed", { error });
      await updateJobStatus(
        databases,
        jobId,
        "failed",
        undefined,
        undefined,
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  },
});
