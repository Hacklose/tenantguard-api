/*
  Warnings:

  - You are about to alter the column `tokenHash` on the `Session` table. The data in that column could be lost. The data in that column will be cast from `Text` to `Char(64)`.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "tokenHash" SET DATA TYPE CHAR(64);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" VARCHAR(255) NOT NULL;
