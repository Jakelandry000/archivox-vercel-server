-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "renderedUrl" TEXT,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Render_pkey" PRIMARY KEY ("id")
);
