const { Client, Databases, ID } = require("node-appwrite");

const COLLECTIONS = {
  IMPORT_JOBS: "import_jobs",
};

const VALID_ACTIONS = ["import", "export", "report-export"];

module.exports = async (context) => {
  const { req, res, log, error } = context;

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      return res.json({ error: "Invalid JSON body" }, 400);
    }

    const { action, fileId, userId, filters, startDate, endDate, format } = body;

    // Validate required fields
    if (!action || !userId) {
      return res.json({ error: "Missing required fields: action, userId" }, 400);
    }

    if (action === "import" && !fileId) {
      return res.json({ error: "Missing fileId for import action" }, 400);
    }

    if (action === "report-export" && (!startDate || !endDate)) {
      return res.json({ error: "Missing startDate or endDate for report-export action" }, 400);
    }

    if (!VALID_ACTIONS.includes(action)) {
      return res.json({ error: "Invalid action. Must be 'import', 'export', or 'report-export'" }, 400);
    }

    log(`Processing ${action} job for user ${userId}`);

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);
    const databaseId = process.env.APPWRITE_DATABASE_ID;

    // Build job metadata
    const jobData = {
      user_id: userId,
      action,
      status: "pending",
      file_id: fileId || null,
      filters: filters ? JSON.stringify(filters) : null,
      created_at: new Date().toISOString(),
    };

    // Add report-specific metadata
    if (action === "report-export") {
      jobData.filters = JSON.stringify({ startDate, endDate, format: format || "excel" });
    }

    // Create job record for tracking
    const job = await databases.createDocument(
      databaseId,
      COLLECTIONS.IMPORT_JOBS,
      ID.unique(),
      jobData
    );

    log(`Created job record: ${job.$id}`);

    // Dispatch to Trigger.dev
    try {
      const { tasks } = require("@trigger.dev/sdk/v3");

      if (action === "import") {
        await tasks.trigger("product-import", {
          jobId: job.$id,
          fileId: fileId,
          userId,
        });
        log(`Triggered product-import task for job ${job.$id}`);
      } else if (action === "export") {
        await tasks.trigger("product-export", {
          jobId: job.$id,
          userId,
          filters,
        });
        log(`Triggered product-export task for job ${job.$id}`);
      } else if (action === "report-export") {
        await tasks.trigger("report-export", {
          jobId: job.$id,
          userId,
          startDate,
          endDate,
          format: format || "excel",
        });
        log(`Triggered report-export task for job ${job.$id}`);
      }
    } catch (triggerError) {
      error(`Failed to trigger task: ${triggerError}`);

      // Update job status to failed
      await databases.updateDocument(databaseId, COLLECTIONS.IMPORT_JOBS, job.$id, {
        status: "failed",
        error: triggerError instanceof Error ? triggerError.message : "Failed to queue task",
        completed_at: new Date().toISOString(),
      });

      return res.json(
        {
          success: false,
          error: "Failed to queue task",
          jobId: job.$id,
        },
        500
      );
    }

    return res.json({
      success: true,
      jobId: job.$id,
      action,
      status: "queued",
    });
  } catch (err) {
    error(`Unhandled error: ${err}`);
    return res.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      500
    );
  }
};
