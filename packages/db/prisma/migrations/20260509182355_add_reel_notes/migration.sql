-- CreateTable
CREATE TABLE "ReelNote" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "applicability" TEXT NOT NULL,
    "archivoxUseCase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelNote_pkey" PRIMARY KEY ("id")
);
