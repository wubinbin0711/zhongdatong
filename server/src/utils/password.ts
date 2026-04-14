import bcrypt from "bcryptjs";

export const hashPassword = async (plainText: string): Promise<string> => bcrypt.hash(plainText, 10);
export const verifyPassword = async (plainText: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plainText, hash);

