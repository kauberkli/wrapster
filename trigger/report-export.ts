import { task, logger } from "@trigger.dev/sdk/v3";
import { Client, Databases, Storage, ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import * as XLSX from "xlsx";
import PDFTable from "pdfkit-table";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

interface PDFData {
  startDate: string;
  endDate: string;
  summaryData: Array<{ Metric: string; Value: string | number }>;
  dailySummaryData: Array<{ Date: string; Records: number; "Items Scanned": number }>;
  productQuantitiesData: Array<{ "No.": number; "Product Name": string; Barcode: string; "Total Quantity": number }>;
  exportData: Array<{
    "No.": number;
    Date: string;
    Waybill: string;
    "Product Barcode": string;
    "Product Name": string;
    "Scanned At": string;
  }>;
}

// Cache for font file path
let cachedFontPath: string | null = null;

function getBundledFontPath(): string | null {
  // Try to find the bundled font file
  // In trigger.dev, additionalFiles are copied to the build directory
  const possiblePaths = [
    // Relative to current file in trigger directory
    path.join(__dirname, "fonts", "NotoSansSC-Regular.ttf"),
    // One level up from __dirname (if task file is in trigger/)
    path.join(__dirname, "..", "trigger", "fonts", "NotoSansSC-Regular.ttf"),
    path.join(__dirname, "..", "fonts", "NotoSansSC-Regular.ttf"),
    // Relative to process cwd
    path.join(process.cwd(), "trigger", "fonts", "NotoSansSC-Regular.ttf"),
    path.join(process.cwd(), "fonts", "NotoSansSC-Regular.ttf"),
    // Direct path in build output
    "./trigger/fonts/NotoSansSC-Regular.ttf",
    "./fonts/NotoSansSC-Regular.ttf",
    // Absolute path from root (trigger.dev build output structure)
    "/app/trigger/fonts/NotoSansSC-Regular.ttf",
    "/app/fonts/NotoSansSC-Regular.ttf",
  ];

  logger.info("Searching for bundled font", {
    __dirname,
    cwd: process.cwd(),
    pathsToCheck: possiblePaths,
  });

  for (const fontPath of possiblePaths) {
    try {
      const resolvedPath = path.resolve(fontPath);
      if (fs.existsSync(resolvedPath)) {
        logger.info(`Found bundled font at ${resolvedPath}`);
        return resolvedPath;
      }
    } catch (err) {
      logger.debug(`Error checking path ${fontPath}`, { error: err });
    }
  }

  // List directory contents for debugging
  try {
    logger.info("Directory listing for debugging", {
      __dirname_contents: fs.existsSync(__dirname) ? fs.readdirSync(__dirname) : "dir not found",
      cwd_contents: fs.readdirSync(process.cwd()),
    });
  } catch (err) {
    logger.warn("Failed to list directories for debugging", { error: err });
  }

  return null;
}

async function ensureFontFile(): Promise<string> {
  if (cachedFontPath && fs.existsSync(cachedFontPath)) {
    return cachedFontPath;
  }

  // First try bundled font
  const bundledPath = getBundledFontPath();
  if (bundledPath) {
    cachedFontPath = bundledPath;
    return bundledPath;
  }

  logger.info("Bundled font not found, trying CDN fallbacks");

  // Fetch Noto Sans SC font from CDN (supports Chinese characters)
  const fontUrls = [
    "https://cdn.jsdelivr.net/gh/AuYuHui/cdn@0.0.9/fonts/NotoSansSC-Regular.ttf",
    "https://cdn.jsdelivr.net/npm/@aspect-build/aspect-fonts@0.0.1/NotoSansSC-Regular.ttf",
  ];

  for (const url of fontUrls) {
    try {
      logger.info(`Fetching font from ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const fontBuffer = Buffer.from(arrayBuffer);
      logger.info(`Font loaded, size: ${fontBuffer.length} bytes`);

      // Write to temp file so pdfkit can use it
      const tempDir = os.tmpdir();
      const fontPath = path.join(tempDir, "NotoSansSC-Regular.ttf");
      fs.writeFileSync(fontPath, fontBuffer);
      cachedFontPath = fontPath;
      logger.info(`Font written to ${fontPath}`);
      return fontPath;
    } catch (error) {
      logger.warn(`Failed to fetch font from ${url}`, { error });
    }
  }

  throw new Error("Failed to fetch font from all sources");
}

async function generatePDF(data: PDFData): Promise<Buffer> {
  // Ensure font file exists before creating document
  const fontPath = await ensureFontFile();

  // Dark gray color for table headers
  const headerColor = "#424242";

  // Create document with custom font to avoid Helvetica AFM error
  const doc = new PDFTable({
    size: "A4",
    margin: 40,
    bufferPages: true,
    font: fontPath, // Use custom font from the start
  });

  // Register fonts for use throughout the document
  doc.registerFont("NotoSans", fontPath);
  doc.registerFont("NotoSans-Bold", fontPath); // Use same font for bold (no bold variant available)

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const endPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Consistent font sizes throughout the report
  const FONT_SIZE = {
    TITLE: 18,
    SUBTITLE: 12,
    SECTION: 14,
    TABLE_HEADER: 10,
    TABLE_ROW: 9,
  };

  // Border color for tables
  const borderColor = "#cccccc";

  // Common table options for grid-style tables with dark gray header
  const getTableOptions = (columnsSize: number[], tableWidth: number) => {
    let headerRectStored = false;
    let headerRect: { x: number; y: number; width: number; height: number } | null = null;

    return {
      padding: [5, 5, 5, 5],
      width: tableWidth,
      columnsSize,
      divider: {
        header: { disabled: false, width: 0.5, opacity: 1 },
        horizontal: { disabled: false, width: 0.5, opacity: 0.5 },
      },
      headerColor: headerColor,
      prepareHeader: () => {
        return doc.font("NotoSans-Bold").fontSize(FONT_SIZE.TABLE_HEADER).fillColor("#ffffff");
      },
      prepareRow: (row: unknown, indexColumn: number, indexRow: number, rectRow: { x: number; y: number; width: number; height: number }, rectCell: { x: number; y: number; width: number; height: number }) => {
        // Draw header borders on first row (indexRow === 0, indexColumn === 0)
        if (!headerRectStored && rectRow && indexRow === 0 && indexColumn === 0) {
          // Header is one row height above the first data row
          headerRect = {
            x: rectRow.x,
            y: rectRow.y - rectRow.height,
            width: tableWidth,
            height: rectRow.height,
          };
          headerRectStored = true;

          // Draw header vertical borders
          let xPos = headerRect.x;
          for (let i = 0; i <= columnsSize.length; i++) {
            doc
              .lineWidth(0.5)
              .strokeColor(borderColor)
              .moveTo(xPos, headerRect.y)
              .lineTo(xPos, headerRect.y + headerRect.height)
              .stroke();
            if (i < columnsSize.length) {
              xPos += columnsSize[i];
            }
          }

          // Draw header top border
          doc
            .moveTo(headerRect.x, headerRect.y)
            .lineTo(headerRect.x + tableWidth, headerRect.y)
            .stroke();
        }

        // Draw vertical lines for each cell
        if (rectCell) {
          doc
            .lineWidth(0.5)
            .strokeColor(borderColor)
            .moveTo(rectCell.x, rectCell.y)
            .lineTo(rectCell.x, rectCell.y + rectCell.height)
            .stroke();

          // Draw right border for last column
          if (indexColumn === columnsSize.length - 1) {
            doc
              .moveTo(rectCell.x + rectCell.width, rectCell.y)
              .lineTo(rectCell.x + rectCell.width, rectCell.y + rectCell.height)
              .stroke();
          }

          // Draw bottom border for last row
          if (rectRow) {
            doc
              .moveTo(rectCell.x, rectCell.y + rectCell.height)
              .lineTo(rectCell.x + rectCell.width, rectCell.y + rectCell.height)
              .stroke();
          }
        }

        return doc.font("NotoSans").fontSize(FONT_SIZE.TABLE_ROW).fillColor("#000000");
      },
    };
  };

  // Helper function for section title (used on pages 2-4)
  const addSectionTitle = (title: string) => {
    doc.fontSize(FONT_SIZE.SECTION).font("NotoSans-Bold").text(title);
    doc.moveDown(0.5);
  };

  // Page 1: Summary (with main report header)
  doc.fontSize(FONT_SIZE.TITLE).font("NotoSans-Bold").text("Packaging Report", { align: "center" });
  doc.moveDown(0.3);
  const dateDisplay = data.startDate === data.endDate ? data.startDate : `${data.startDate} to ${data.endDate}`;
  doc.fontSize(FONT_SIZE.SUBTITLE).font("NotoSans").text(dateDisplay, { align: "center" });
  doc.moveDown(1);
  addSectionTitle("Summary");

  await doc.table(
    {
      headers: [
        { label: "Metric", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Value", align: "left", headerColor: headerColor, headerOpacity: 1 },
      ],
      rows: data.summaryData.map((row) => [row.Metric, String(row.Value)]),
    },
    getTableOptions([200, 300], 500)
  );

  // Page 2: Daily Summary
  doc.addPage();
  addSectionTitle("Daily Summary");

  await doc.table(
    {
      headers: [
        { label: "Date", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Waybill Records", align: "right", headerColor: headerColor, headerOpacity: 1 },
        { label: "Items Scanned", align: "right", headerColor: headerColor, headerOpacity: 1 },
      ],
      rows: data.dailySummaryData.map((row) => [row.Date, String(row.Records), String(row["Items Scanned"])]),
    },
    getTableOptions([200, 150, 150], 500)
  );

  // Page 3: Product Quantities
  doc.addPage();
  addSectionTitle("Total Packed Product Quantities");

  await doc.table(
    {
      headers: [
        { label: "#", align: "center", headerColor: headerColor, headerOpacity: 1 },
        { label: "Product Name", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Barcode", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Total Qty", align: "right", headerColor: headerColor, headerOpacity: 1 },
      ],
      rows: data.productQuantitiesData.map((row) => [
        String(row["No."]),
        row["Product Name"],
        row.Barcode,
        String(row["Total Quantity"]),
      ]),
    },
    getTableOptions([30, 250, 120, 100], 500)
  );

  // Page 4: Details
  doc.addPage();
  addSectionTitle("Details");

  await doc.table(
    {
      headers: [
        { label: "#", align: "center", headerColor: headerColor, headerOpacity: 1 },
        { label: "Date", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Waybill", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Barcode", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Product Name", align: "left", headerColor: headerColor, headerOpacity: 1 },
        { label: "Time", align: "left", headerColor: headerColor, headerOpacity: 1 },
      ],
      rows: data.exportData.map((row) => [
        String(row["No."]),
        row.Date,
        row.Waybill,
        row["Product Barcode"],
        row["Product Name"],
        row["Scanned At"].split(" ")[1] || row["Scanned At"],
      ]),
    },
    getTableOptions([25, 65, 100, 85, 170, 75], 520)
  );

  doc.end();
  return endPromise;
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

      // Prepare common data structures
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
        { Metric: "Total Waybill Records", Value: allRecords.length },
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

      let buffer: Buffer;
      let fileName: string;

      if (format === "pdf") {
        // Generate PDF file
        logger.info("Generating PDF file");
        buffer = await generatePDF({
          startDate,
          endDate,
          summaryData,
          dailySummaryData,
          productQuantitiesData,
          exportData,
        });
        fileName = `packaging-report-${startDate}-to-${endDate}.pdf`;
      } else {
        // Generate Excel file
        logger.info("Generating Excel file");

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

        buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        fileName = `packaging-report-${startDate}-to-${endDate}.xlsx`;
      }

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
