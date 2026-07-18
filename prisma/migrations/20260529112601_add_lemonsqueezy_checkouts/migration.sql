-- CreateTable
CREATE TABLE "checkouts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "lemonCheckoutId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "productId" TEXT,
    "variantId" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_lemonCheckoutId_key" ON "checkouts"("lemonCheckoutId");

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
