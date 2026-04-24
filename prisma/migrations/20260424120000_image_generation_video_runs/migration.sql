CREATE TABLE "image_generation_video_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userPrompt" TEXT NOT NULL DEFAULT '',
    "assistantReply" TEXT NOT NULL DEFAULT '',
    "sourceKind" TEXT NOT NULL,
    "sourceImageRunId" TEXT,
    "sourceImageFileName" TEXT NOT NULL,
    "sourceImageMimeType" TEXT NOT NULL,
    "sourceImageByteSize" INTEGER NOT NULL,
    "sourceImageBytes" BLOB NOT NULL,
    "videoModel" TEXT NOT NULL DEFAULT '',
    "openrouterJobId" TEXT NOT NULL DEFAULT '',
    "openrouterGenerationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT '720p',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "videoFileName" TEXT,
    "videoMimeType" TEXT,
    "videoByteSize" INTEGER,
    "videoBytes" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "image_generation_video_runs_createdAt_idx" ON "image_generation_video_runs"("createdAt");
CREATE INDEX "image_generation_video_runs_status_idx" ON "image_generation_video_runs"("status");
CREATE INDEX "image_generation_video_runs_openrouterJobId_idx" ON "image_generation_video_runs"("openrouterJobId");
