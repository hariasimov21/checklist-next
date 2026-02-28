-- CreateTable
CREATE TABLE "NoteFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteFolder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "UserNote"
  ADD COLUMN "folderId" TEXT,
  ADD COLUMN "position" INTEGER;

-- Backfill note order by most recent update per user
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC
    ) - 1 AS pos
  FROM "UserNote"
)
UPDATE "UserNote" n
SET "position" = ranked.pos
FROM ranked
WHERE n."id" = ranked."id";

ALTER TABLE "UserNote"
  ALTER COLUMN "position" SET NOT NULL,
  ALTER COLUMN "position" SET DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "NoteFolder_userId_name_key" ON "NoteFolder"("userId", "name");

-- CreateIndex
CREATE INDEX "NoteFolder_userId_position_idx" ON "NoteFolder"("userId", "position");

-- CreateIndex
CREATE INDEX "UserNote_userId_folderId_position_idx" ON "UserNote"("userId", "folderId", "position");

-- AddForeignKey
ALTER TABLE "NoteFolder" ADD CONSTRAINT "NoteFolder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "NoteFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
