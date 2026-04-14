const managerAccountSuffixRegex = /(01|02|03)$/;

export const isValidManagerAccount = (account: string): boolean =>
  managerAccountSuffixRegex.test(account);

