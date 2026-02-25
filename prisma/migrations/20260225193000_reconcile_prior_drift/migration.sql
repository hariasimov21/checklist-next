-- Reconcile historical drift against remote database state.
-- This migration captures schema changes that exist in DB but were missing in local migration history.

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Card"
    ADD COLUMN "boardId" TEXT NOT NULL,
    ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Board_userId_createdAt_idx" ON "Board"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Board_userId_name_key" ON "Board"("userId", "name");

-- CreateIndex
CREATE INDEX "Card_userId_position_idx" ON "Card"("userId", "position");

-- CreateIndex
CREATE INDEX "Card_userId_boardId_position_idx" ON "Card"("userId", "boardId", "position");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
