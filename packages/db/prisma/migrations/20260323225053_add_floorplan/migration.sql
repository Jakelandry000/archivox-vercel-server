-- CreateEnum
CREATE TYPE "FloorPlanStatus" AS ENUM ('new', 'processing', 'processed', 'failed');

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "status" "FloorPlanStatus" NOT NULL DEFAULT 'new',
    "filePath" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);
