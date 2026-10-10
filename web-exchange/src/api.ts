/** The simulated exchange's API (backend ExchangeEndpoints). Amounts are wei as decimal strings. */

export interface Asset {
  symbol: string;
  name: string;
  /** Token contract; null for native ETH. */
  address: string | null;
  decimals: number;
}

export interface Wallet {
  address: string;
  label: string;
  createdAt: string;
  /** Balance per asset symbol, read from the chain. */
  balances: Record<string, string>;
}

export interface Transfer {
  txHash: string;
  from: string;
  fromUsername?: string | null;
  to: string;
  toUsername?: string | null;
  asset: string;
  amount: string;
  kind: 'Funding' | 'Deposit' | 'Withdrawal' | 'Transfer';
  createdAt: string;
}

const MESSAGES: Record<string, string> = {
  InvalidAccountName: 'Use 2–32 characters: lowercase letters, digits, - or _.',
  InvalidLabel: 'Give the wallet a name of up to 40 characters.',
  TooManyWallets: 'This account has reached the maximum number of wallets.',
  UnknownAsset: 'That asset is not available.',
  AmountInvalid: 'Enter an amount greater than zero.',
  AmountTooLarge: 'That is more than can be added in one step.',
  InsufficientBalance: 'This wallet does not hold enough of that asset (ETH also needs a little left for gas).',
  RecipientNotFound: 'No ChainChat user with that username was found.',
  SameWallet: 'That is this wallet itself.',
  WalletNotFound: 'This wallet does not belong to this account.',
  TransferFailed: 'The transfer failed on the chain. Check the amount and try again.',
  TransactionReverted: 'The transaction was reverted.',
  FundingDisabled: 'The server has no funder key configured.',
};

export class ApiError extends Error {}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/exchange${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.ok) return (await response.json()) as T;

  let code = `Request failed (${response.status})`;
  try {
    const problem = (await response.json()) as { detail?: string; title?: string };
    code = problem.detail ?? problem.title ?? code;
  } catch {
    // not a JSON body
  }
  throw new ApiError(MESSAGES[code] ?? code);
}

const wallets = (account: string) => `/accounts/${encodeURIComponent(account)}/wallets`;

export const api = {
  assets: () => request<Asset[]>('/assets'),
  wallets: (account: string) => request<Wallet[]>(wallets(account)),
  createWallet: (account: string, label: string) => request<Wallet>(wallets(account), { label }),
  addBalance: (account: string, address: string, asset: string, amount: string) => request<Transfer>(`${wallets(account)}/${address}/balance`, { asset, amount }),
  deposit: (account: string, address: string, recipient: string, asset: string, amount: string) =>
    request<Transfer>(`${wallets(account)}/${address}/deposit`, { recipient, asset, amount }),
  history: (account: string, address: string) => request<Transfer[]>(`${wallets(account)}/${address}/history`),
};

/** Wei (decimal string) → "1,234.5" in whole units. All assets here have 18 decimals. */
export function formatAmount(wei: string | undefined, digits = 4): string {
  if (wei === undefined) return '—';
  const value = BigInt(wei);
  const unit = 10n ** 18n;
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

/** Whole units as a plain decimal string, for the "Max" button. */
export function toUnits(wei: string): string {
  const value = BigInt(wei);
  const unit = 10n ** 18n;
  const fraction = (value % unit).toString().padStart(18, '0').replace(/0+$/, '');
  return `${value / unit}${fraction ? `.${fraction}` : ''}`;
}

export const shorten = (value: string, head = 6, tail = 4) => `${value.slice(0, head)}…${value.slice(-tail)}`;
