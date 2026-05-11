import {
  connectLoginAndSubscribe,
  okxDexWsCredentialsFromEnv,
} from "../src/OkxDexWebSocket.ts";
import type { OkxDexTokenPriceInfo } from "../src/Utils.ts";
import { getBricSwapTokenAddresses, getSymbolFromAddress } from "./utils.ts";

const tokenAddresses = getBricSwapTokenAddresses();

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
    onConnectionError: (e) => console.error("[ws err]", e),
    onNotice: (m) => console.log("[ws notice]\n", JSON.stringify(m, null, 2)),
    onMessage: (m) => {
      // console.log("[ws message]\n", JSON.stringify(m, null, 2));
      const arg = (m as any)?.arg;
      const channel = arg?.channel;
      if (channel == "price-info") {
        const symbol = getSymbolFromAddress(arg?.tokenContractAddress);

        const priceInfo = (m as any)?.data?.[0] as
          | OkxDexTokenPriceInfo
          | undefined;
        if (!priceInfo?.price) return; // e.g. subscribe ack / non-data events
        console.log(
          `${symbol ?? "unknown"}: ${priceInfo.price} ` +
            "24h change: " +
            priceInfo.priceChange24H,
        );
      }
    },
  },
});

// wait for 5 minutes
// await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
// client.close();

// node test/websocket.spec.ts
