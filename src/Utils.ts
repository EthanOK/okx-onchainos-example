import crypto from "node:crypto";
import "dotenv/config";

export const OKX_BASE_URL = "https://web3.okx.com";
export const OKX_PRICE_INFO_PATH = "/api/v6/dex/market/price-info";
export const OKX_CANDLES_PATH = "/api/v6/dex/market/candles";

export type OkxDexTokenPriceInfo = {
  chainIndex: string;
  tokenContractAddress: string;
  time: string;
  price: string;
  marketCap?: string;
  liquidity?: string;
  circSupply?: string;
  holders?: string;
  maxPrice?: string;
  minPrice?: string;
  priceChange5M?: string;
  priceChange1H?: string;
  priceChange4H?: string;
  priceChange24H?: string;
  volume5M?: string;
  volume1H?: string;
  volume4H?: string;
  volume24H?: string;
  txs5M?: string;
  txs1H?: string;
  txs4H?: string;
  txs24H?: string;
  tradeNum?: string;
};

export type OkxEnvelope<T> = {
  code: string;
  msg: string;
  data: T;
};

export type OkxDexCandleBar =
  | "1s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1H"
  | "2H"
  | "4H"
  | "6H"
  | "12H"
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6Hutc"
  | "12Hutc"
  | "1Dutc"
  | "1Wutc"
  | "1Mutc"
  | "3Mutc";

export type OkxDexCandle = {
  ts: string;
  o: string;
  h: string;
  l: string;
  c: string;
  vol: string;
  volUsd: string;
  confirm: "0" | "1";
};

export function shellSingleQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function buildCurlCommand(args: {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}) {
  const { url, method, headers, body } = args;
  const headerLines = Object.entries(headers).map(
    ([k, v]) => `--header ${shellSingleQuote(`${k}: ${v}`)} \\`,
  );

  const lines = [
    `curl --location --request ${method} ${shellSingleQuote(url)} \\`,
    ...headerLines,
  ];
  if (typeof body === "string") {
    lines.push(`--data-raw ${shellSingleQuote(body)}`);
  }
  return lines.join("\n");
}

export function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function signOkxRequest(args: {
  timestamp: string;
  method: "GET" | "POST";
  requestPath: string;
  body: string;
  secretKey: string;
}) {
  const { timestamp, method, requestPath, body, secretKey } = args;
  return crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + method + requestPath + body)
    .digest("base64");
}