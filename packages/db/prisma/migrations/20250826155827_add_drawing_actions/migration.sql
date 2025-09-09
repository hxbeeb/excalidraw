-- CreateTable
CREATE TABLE "public"."DrawingAction" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "color" TEXT NOT NULL,
    "strokeWidth" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingAction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."DrawingAction" ADD CONSTRAINT "DrawingAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DrawingAction" ADD CONSTRAINT "DrawingAction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
