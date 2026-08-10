-- Migración: Lemon Squeezy → Paddle

-- 1. Renombrar lemonCheckoutId -> paddleTransactionId
ALTER TABLE "checkouts" RENAME COLUMN "lemonCheckoutId" TO "paddleTransactionId";

-- 2. Renombrar el índice único para que coincida con Prisma
ALTER INDEX "checkouts_lemonCheckoutId_key" RENAME TO "checkouts_paddleTransactionId_key";

-- 3. url pasa a ser opcional (el checkout de Paddle puede no traer URL)
ALTER TABLE "checkouts" ALTER COLUMN "url" DROP NOT NULL;

-- 4. Eliminar columnas de Lemon Squeezy
ALTER TABLE "checkouts" DROP COLUMN "productId";
ALTER TABLE "checkouts" DROP COLUMN "variantId";

-- 5. Agregar columnas de Paddle
ALTER TABLE "checkouts" ADD COLUMN "priceId" TEXT;
ALTER TABLE "checkouts" ADD COLUMN "subscriptionId" TEXT;

