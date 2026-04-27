import {
  buildCurlCommand,
  mustEnv,
  OKX_BASE_URL,
  OKX_CANDLES_PATH,
  signOkxRequest,
} from "./Utils.ts";
import type { OkxDexCandle, OkxDexCandleBar, OkxEnvelope } from "./Utils.ts";

/**
 * 获取 Token K 线（返回结构化 data 字段）
 */
export async function getCandles(params: {
  chainIndex: string;
  tokenContractAddress: string;
  after?: string;
  before?: string;
  bar?: OkxDexCandleBar;
  limit?: string;
  timeoutMs?: number;
}): Promise<OkxDexCandle[]> {
  const apiKey = mustEnv("OKX_API_KEY");
  const secretKey = mustEnv("OKX_SECRET_KEY");
  const passphrase = mustEnv("OKX_PASSPHRASE");

  const tokenContractAddress = params.tokenContractAddress.trim().toLowerCase();
  if (!tokenContractAddress) {
    throw new Error("tokenContractAddress is required");
  }

  const query = new URLSearchParams({
    chainIndex: String(params.chainIndex),
    tokenContractAddress,
  });
  if (params.after) query.set("after", params.after);
  if (params.before) query.set("before", params.before);
  if (params.bar) query.set("bar", params.bar);
  if (params.limit) {
    const limit = Number(params.limit);
    if (!Number.isFinite(limit) || limit <= 0 || limit > 1400) {
      throw new Error("limit must be a numeric string between 1 and 1400");
    }
    query.set("limit", params.limit);
  }

  const requestPath = `${OKX_CANDLES_PATH}?${query.toString()}`;
  const timestamp = new Date().toISOString();
  const sign = signOkxRequest({
    timestamp,
    method: "GET",
    requestPath,
    body: "",
    secretKey,
  });

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 10_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "Content-Type": "application/json",
  };

  if (process.env.OKX_LOG_CURL === "1") {
    const url = `${OKX_BASE_URL}${requestPath}`;
    console.log(
      buildCurlCommand({
        url,
        method: "GET",
        headers,
      }),
    );
  }

  try {
    const res = await fetch(`${OKX_BASE_URL}${requestPath}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const json = (await res.json()) as OkxEnvelope<string[][]>;
    if (json.code !== "0") {
      throw new Error(`OKX API error: code=${json.code} msg=${json.msg || ""}`);
    }

    return json.data.map((item) => {
      if (item.length < 8) {
        throw new Error("Unexpected candle payload shape");
      }
      return {
        ts: item[0],
        o: item[1],
        h: item[2],
        l: item[3],
        c: item[4],
        vol: item[5],
        volUsd: item[6],
        confirm: item[7] === "1" ? "1" : "0",
      };
    });
  } finally {
    clearTimeout(t);
  }
}