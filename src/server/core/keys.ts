export const keys = {
  user: (id: string) => `user:${id}`,
  userConsejeros: (id: string) => `user:${id}:consejeros`,
  userContracts: (id: string) => `user:${id}:contracts`,
  userLoan: (id: string) => `user:${id}:loan`,
  userGenerals: (id: string) => `user:${id}:generals`,
  general: (gid: string) => `general:${gid}`,
  poolPower: () => 'pool:power',
  lbSeason: (n: number | string) => `lb:season:${n}`,
  battle: (bid: string) => `battle:${bid}`,
  idemp: (token: string) => `idemp:${token}`,
  // Per-(action, user) rate-limit counter. The window index is stored as a hash
  // field, so a single key holds the recent windows for an action.
  rateLimit: (action: string, id: string) => `rate:${action}:${id}`,
  firstPost: () => 'game:firstPost',
  // Daily events (capability daily-events). Date is the canonical UTC YYYY-MM-DD.
  dailyChallenge: (date: string) => `daily:challenge:${date}`,
  dailyPost: (date: string) => `daily:post:${date}`,
  dailyCompletion: (date: string, id: string) => `daily:done:${date}:${id}`,
  dailyClaimToken: (date: string, id: string) => `dailyclaim:${date}:${id}`,
};
