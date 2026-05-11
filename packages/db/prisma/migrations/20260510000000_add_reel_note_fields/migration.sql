-- AlterTable: add new fields to ReelNote and set defaults on existing columns
ALTER TABLE "ReelNote" ADD COLUMN "status"         TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "ReelNote" ADD COLUMN "assemblyJobId"  TEXT;
ALTER TABLE "ReelNote" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "ReelNote" ADD COLUMN "userNote"       TEXT;

ALTER TABLE "ReelNote" ALTER COLUMN "summary"       SET DEFAULT '';
ALTER TABLE "ReelNote" ALTER COLUMN "applicability" SET DEFAULT '';

-- CreateIndex: unique constraint on assemblyJobId
CREATE UNIQUE INDEX "ReelNote_assemblyJobId_key" ON "ReelNote"("assemblyJobId");
