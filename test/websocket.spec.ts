import {
  connectLoginAndSubscribe,
  okxDexWsCredentialsFromEnv,
} from "../src/OkxDexWebSocket.ts";
import type { OkxDexTokenPriceInfo } from "../src/Utils.ts";
import {
  formatPushTime,
  getBricSwapTokenAddresses,
  getSymbolFromAddress,
} from "./utils.ts";

const tokenAddresses = getBricSwapTokenAddresses();

const expectedLower = new Set(tokenAddresses.map((a) => a.toLowerCase()));
const receivedPriceLower = new Set<string>();

type LatestRow = {
  price: string;
  priceChange24H: string;
  time: string;
};
const latestByAddress = new Map<string, LatestRow>();
let statusLine = "";

/** 终端 ANSI（常见 macOS / Cursor 终端均支持） */
const S = {
  r: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  cyan: "\x1B[36m",
  yellow: "\x1B[33m",
  green: "\x1B[32m",
  red: "\x1B[31m",
  gray: "\x1B[90m",
};

function color24hChange(raw: string): string {
  const core = String(raw).replace(/%$/, "").trim();
  const padded = `${core.padStart(8)}%`;
  const n = parseFloat(core);
  if (!Number.isFinite(n)) return `${S.dim}${padded}${S.r}`;
  if (n > 0) return `${S.green}${padded}${S.r}`;
  if (n < 0) return `${S.red}${padded}${S.r}`;
  return `${S.dim}${padded}${S.r}`;
}

/** 清屏并把光标移到左上角后重绘固定行数（不追加滚动 log） */
function redrawPriceBoard() {
  const missing = [...expectedLower].filter((a) => !receivedPriceLower.has(a));
  const missingLabels = missing
    .map((a) => getSymbolFromAddress(a) ?? `${a.slice(0, 8)}…`)
    .join(", ");

  const lines: string[] = [
    `${S.bold}${S.cyan}OKX DEX WebSocket  price-info  chainIndex=1  （原地刷新，Ctrl+C 退出）${S.r}`,
    statusLine
      ? `${S.yellow}状态:${S.r} ${S.dim}${statusLine}${S.r}`
      : "",
    `${S.cyan}推送覆盖:${S.r} ${receivedPriceLower.size}/${expectedLower.size}` +
      (missingLabels
        ? `  ${S.gray}|${S.r}  ${S.dim}待首条含 price 推送:${S.r} ${missingLabels}`
        : `  ${S.gray}|${S.r}  ${S.green}全部地址已收到推送${S.r}`),
    `${S.gray}${"─".repeat(72)}${S.r}`,
  ].filter(Boolean);

  for (const addr of tokenAddresses) {
    const key = addr.toLowerCase();
    const sym = getSymbolFromAddress(key) ?? key;
    const row = latestByAddress.get(key);
    if (row) {
      lines.push(
        `${S.yellow}${sym.padEnd(10)}${S.r}  ` +
          `${S.dim}price${S.r} ${S.bold}${Number(row.price).toFixed(2).padStart(12)}${S.r}  ` +
          `${S.dim}24h${S.r} ${color24hChange(row.priceChange24H)}  ` +
          `${S.dim}时间 ${formatPushTime(row.time)}${S.r}`,
      );
    } else {
      lines.push(
        `${S.yellow}${sym.padEnd(10)}${S.r}  ${S.dim}… 等待首条推送${S.r}`,
      );
    }
  }

  process.stdout.write("\x1B[2J\x1B[H" + lines.join("\n") + "\n");
}

const client = await connectLoginAndSubscribe({
  creds: okxDexWsCredentialsFromEnv(),
  args: tokenAddresses.map((tokenAddress) => ({
    channel: "price-info",
    chainIndex: "1",
    tokenContractAddress: tokenAddress.toLowerCase(),
  })),

  keepAlive: { intervalMs: 20_000, pongTimeoutMs: 5_000 }, // N < 30s
  autoReconnect: {
    enabled: true,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    jitterRatio: 0.2,
  },
  handlers: {
    onConnectionError: (e) => {
      statusLine = e.message;
      redrawPriceBoard();
    },
    onNotice: (m) => {
      statusLine = `notice: ${JSON.stringify(m)}`;
      redrawPriceBoard();
    },
    onMessage: (m) => {
      const root = m as Record<string, unknown>;

      if (root.event === "error") {
        statusLine = `error: ${JSON.stringify(m)}`;
        redrawPriceBoard();
      }

      const arg = (m as any)?.arg;
      const channel = arg?.channel;
      if (channel == "price-info") {
        const priceInfo = (m as any)?.data?.[0] as
          | OkxDexTokenPriceInfo
          | undefined;
        if (!priceInfo?.price) return; // e.g. subscribe ack / non-data events
        const addrLower = String(arg?.tokenContractAddress ?? "").toLowerCase();
        if (addrLower) {
          receivedPriceLower.add(addrLower);
          latestByAddress.set(addrLower, {
            price: priceInfo.price,
            priceChange24H: String(priceInfo.priceChange24H ?? ""),
            time: priceInfo.time,
          });
        }
        redrawPriceBoard();
      }
    },
  },
});

redrawPriceBoard();

// wait for 5 minutes
// await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
// client.close();

// node test/websocket.spec.ts
