/*
  Warnings:

  - Added the required column `amountTo` to the `transfers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `toCurrency` to the `transfers` table without a default value. This is not possible if the table is not empty.
  - Made the column `fxRate` on table `transfers` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "amountTo" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "toCurrency" VARCHAR(3) NOT NULL,
ALTER COLUMN "fxRate" SET NOT NULL,
ALTER COLUMN "fxRate" SET DEFAULT 1;
