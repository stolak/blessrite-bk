import prisma from "../utils/prisma";

export interface BankData {
  id: string;
  bankCode: string;
  bankName: string;
}

export class BankService {
  private prisma = prisma;

  /**
   * Get all banks from the database
   */
  async getAllBanks(): Promise<BankData[]> {
    try {
      const banks = await this.prisma.bank.findMany({
        orderBy: {
          bankName: "asc",
        },
      });

      return banks.map((bank) => ({
        id: bank.id,
        bankCode: bank.bankCode,
        bankName: bank.bankName,
      }));
    } catch (error) {
      console.error("Error fetching banks:", error);
      throw new Error("Failed to fetch banks from database");
    }
  }

  /**
   * Get a specific bank by ID
   */
  async getBankById(id: string): Promise<BankData | null> {
    try {
      const bank = await this.prisma.bank.findUnique({
        where: { id },
      });

      if (!bank) {
        return null;
      }

      return {
        id: bank.id,
        bankCode: bank.bankCode,
        bankName: bank.bankName,
      };
    } catch (error) {
      console.error(`Error fetching bank with ID ${id}:`, error);
      throw new Error("Failed to fetch bank from database");
    }
  }

  /**
   * Get a specific bank by bank code
   */
  async getBankByCode(bankCode: string): Promise<BankData | null> {
    try {
      const bank = await this.prisma.bank.findUnique({
        where: { bankCode },
      });

      if (!bank) {
        return null;
      }

      return {
        id: bank.id,
        bankCode: bank.bankCode,
        bankName: bank.bankName,
      };
    } catch (error) {
      console.error(`Error fetching bank with code ${bankCode}:`, error);
      throw new Error("Failed to fetch bank from database");
    }
  }

  /**
   * Search banks by name (case-insensitive)
   */
  async searchBanks(query: string): Promise<BankData[]> {
    try {
      const banks = await this.prisma.bank.findMany({
        where: {
          bankName: {
            contains: query,
          },
        },
        orderBy: {
          bankName: "asc",
        },
      });

      // Filter results to be case-insensitive since MySQL doesn't support mode: 'insensitive'
      const filteredBanks = banks.filter((bank) =>
        bank.bankName.toLowerCase().includes(query.toLowerCase())
      );

      return filteredBanks.map((bank) => ({
        id: bank.id,
        bankCode: bank.bankCode,
        bankName: bank.bankName,
      }));
    } catch (error) {
      console.error(`Error searching banks with query "${query}":`, error);
      throw new Error("Failed to search banks");
    }
  }

  /**
   * Get banks metadata with statistics
   */
  async getBanksMetadata(): Promise<{
    totalBanks: number;
    banks: BankData[];
  }> {
    try {
      const banks = await this.getAllBanks();

      return {
        totalBanks: banks.length,
        banks,
      };
    } catch (error) {
      console.error("Error generating banks metadata:", error);
      throw new Error("Failed to generate banks metadata");
    }
  }

  /**
   * Close the Prisma connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const bankService = new BankService();
