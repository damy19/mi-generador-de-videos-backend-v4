-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "klingTaskId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'fal';
