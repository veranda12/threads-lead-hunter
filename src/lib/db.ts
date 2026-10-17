import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diatur");
  }
  // pg memperlakukan sslmode=require/prefer/verify-ca sebagai verify-full dan memberi peringatan
  // deprecation. Nyatakan verify-full secara eksplisit agar perilaku tetap sama di pg v9.
  const adapter = new PrismaPg({ connectionString: connectionString.replace(/sslmode=(require|prefer|verify-ca)\b/, "sslmode=verify-full") });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export type Db = PrismaClient;
