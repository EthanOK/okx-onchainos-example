import crypto from "node:crypto";

import { mustEnv } from "./Utils.ts";
import type { OkxDexTokenPriceInfo } from "./Utils.ts";

/**
 * OKX DEX 行情 WebSocket：登录后订阅 price-info（流通）频道。
 *
 * @see https://web3.okx.com/zh-hans/onchainos/dev-docs/market/websocket-login
 * @see https://web3.okx.com/zh-hans/onchainos/dev-docs/market/websocket-price-info-channel
 */
export const OKX_DEX_WS_URL = "wss://wsdex.okx.com/ws/v6/dex";

const WS_LOGIN_METHOD = "GET";
const WS_LOGIN_REQUEST_PATH = "/users/self/verify";

export type OkxDexWsLoginCredentials = {
  apiKey: string;
  secretKey: string;
  passphrase: string;
};

/** WebSocket 登录请求体中的单条 args（timestamp 为 Unix 秒数字符串） */
export type OkxDexWsLoginArgPayload = {
  apiKey: string;
  passphrase: string;
  timestamp: string;
  sign: string;
};

export type OkxDexWsOp = "login" | "subscribe" | "unsubscribe";

/**
 * 通用订阅参数（你说的通用形态）：
 * args 是数组，元素至少包含 { channel, chainIndex, tokenContractAddress }。
 *
 * 其它频道需要额外参数时，可以继续往上加字段（比如 bar 等）。
 */
export type OkxDexWsChannelArg = {
  channel: string;
  chainIndex: string;
  tokenContractAddress: string;
  [k: string]: unknown;
};

/**
 * WebSocket 登录签名：Base64(HMAC_SHA256(secretKey, timestamp + method + requestPath))
 * method 固定 GET，requestPath 固定 /users/self/verify
 */
export function signOkxDexWsLogin(
  secretKey: string,
  timestampSec: string,
): string {
  const prehash = `${timestampSec}${WS_LOGIN_METHOD}${WS_LOGIN_REQUEST_PATH}`;
  return crypto
    .createHmac("sha256", secretKey)
    .update(prehash)
    .digest("base64");
}

export function buildOkxDexWsLoginPayload(creds: OkxDexWsLoginCredentials): {
  op: "login";
  args: OkxDexWsLoginArgPayload[];
} {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = signOkxDexWsLogin(creds.secretKey, timestamp);
  return {
    op: "login",
    args: [
      {
        apiKey: creds.apiKey,
        passphrase: creds.passphrase,
        timestamp,
        sign,
      },
    ],
  };
}

export function buildOkxDexWsOpPayload<
  TOp extends Exclude<OkxDexWsOp, "login">,
  TArg extends unknown,
>(op: TOp, args: TArg[]): { op: TOp; args: TArg[] } {
  return { op, args };
}

export type OkxDexWsClientHandlers = {
  /** 任意解析成功的 JSON 消息（含 subscribe / error 及推送） */
  onMessage?: (msg: unknown) => void;
  /** WebSocket notice：服务升级等提示（event=notice） */
  onNotice?: (msg: unknown) => void;
  onConnectionError?: (err: Error) => void;
};

export type OkxDexWsClientOptions = OkxDexWsClientHandlers & {
  url?: string;
  loginTimeoutMs?: number;
  /**
   * 连接保活（建议 interval < 30s）。
   * - intervalMs：N 秒内无任何消息（含 pong / 推送 / ack）则发送字符串 "ping"
   * - pongTimeoutMs：发出 ping 后等待 pong 的超时时间
   */
  keepAlive?: {
    intervalMs: number;
    pongTimeoutMs: number;
  };
  /**
   * 自动重连（断线 / pong 超时等情况下）
   * - enabled：开启
   * - maxRetries：最大重试次数（默认无限）
   * - baseDelayMs：首次重连等待（指数退避起点）
   * - maxDelayMs：退避上限
   * - jitterRatio：抖动比例（0~1），用于避免雪崩
   */
  autoReconnect?: {
    enabled: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
  };
};

/**
 * 连接 wsdex、发送 login、并可订阅 price-info。
 * 需在 open 后依次调用 {@link OkxDexWebSocket.login} 与 {@link OkxDexWebSocket.subscribePriceInfo}，
 * 或使用 {@link connectLoginAndSubscribe}。
 */
export class OkxDexWebSocket {
  private ws: WebSocket | null = null;
  private loginResolve: (() => void) | null = null;
  private loginReject: ((err: Error) => void) | null = null;
  private loginTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingLogin = false;

  private readonly creds: OkxDexWsLoginCredentials;
  private readonly options: OkxDexWsClientOptions;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingPong = false;

  private manualClose = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // 记录所有订阅 args（用于自动重连后重放）
  private readonly subscriptions = new Map<string, OkxDexWsChannelArg>();

  constructor(
    creds: OkxDexWsLoginCredentials,
    options: OkxDexWsClientOptions = {},
  ) {
    this.creds = creds;
    this.options = options;
  }

  get url() {
    return this.options.url ?? OKX_DEX_WS_URL;
  }

  /** 建立 WebSocket 连接（尚未登录） */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.manualClose = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;

      const onOpen = () => {
        cleanupConnect();
        this.resetKeepAlive("open");
        resolve();
      };
      const onError = () => {
        cleanupConnect();
        reject(new Error("WebSocket connection error"));
      };

      function cleanupConnect() {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
      }

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("message", (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        this.resetKeepAlive("message");
        this.handleIncoming(raw);
      });
      // 连接建立后仍可能触发 error；这里尽量触发自动重连
      ws.addEventListener("error", () => {
        this.options.onConnectionError?.(new Error("WebSocket error"));
        this.maybeScheduleReconnect("ws error");
      });
      ws.addEventListener("close", () => {
        this.stopKeepAlive();
        this.clearLoginWait(
          new Error("WebSocket closed before login completed"),
        );
        this.maybeScheduleReconnect("ws close");
      });
    });
  }

  /** 发送 login 并等待 event=login 且 code=0 */
  login(): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new Error("WebSocket is not open; call connect() first"),
      );
    }

    if (this.awaitingLogin) {
      return Promise.reject(new Error("login() already in progress"));
    }

    this.awaitingLogin = true;
    const payload = buildOkxDexWsLoginPayload(this.creds);
    const loginTimeoutMs = this.options.loginTimeoutMs ?? 15_000;

    return new Promise((resolve, reject) => {
      this.loginResolve = () => {
        this.awaitingLogin = false;
        resolve();
      };
      this.loginReject = (err) => {
        this.awaitingLogin = false;
        reject(err);
      };

      this.loginTimer = setTimeout(() => {
        this.clearLoginWait(
          new Error(`login timed out after ${loginTimeoutMs}ms`),
        );
      }, loginTimeoutMs);

      ws.send(JSON.stringify(payload));
    });
  }

  /**
   * 通用订阅：一次可订阅多个频道/多参数（args 数组内每个元素必须包含 channel 字段）
   */
  subscribe(args: OkxDexWsChannelArg[]): void {
    const list = args;
    for (const a of list) {
      if (!a || typeof a !== "object" || typeof a.channel !== "string") {
        throw new Error(
          "subscribe args must be objects with a string 'channel' field",
        );
      }
      this.subscriptions.set(JSON.stringify(a), a);
    }
    this.sendJson(buildOkxDexWsOpPayload("subscribe", list));
  }

  /**
   * 通用取消订阅：args 与 subscribe 保持一致
   */
  unsubscribe(args: OkxDexWsChannelArg[]): void {
    const list = args;
    for (const a of list) {
      if (!a || typeof a !== "object" || typeof a.channel !== "string") {
        throw new Error(
          "unsubscribe args must be objects with a string 'channel' field",
        );
      }
      this.subscriptions.delete(JSON.stringify(a));
    }
    this.sendJson(buildOkxDexWsOpPayload("unsubscribe", list));
  }

  close(code?: number, reason?: string): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearLoginWait(new Error("login aborted: close() called"));
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close(code, reason);
      this.ws = null;
    }
  }

  /** 主动发送 ping（字符串） */
  ping(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    ws.send("ping");
  }

  private sendJson(obj: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    ws.send(JSON.stringify(obj));
  }

  private stopKeepAlive() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    this.awaitingPong = false;
  }

  private maybeScheduleReconnect(why: string) {
    const cfg = this.options.autoReconnect;
    if (!cfg?.enabled) return;
    if (this.manualClose) return;
    if (this.reconnecting) return;

    const maxRetries = cfg.maxRetries ?? Infinity;
    if (this.reconnectAttempts >= maxRetries) return;

    const base = cfg.baseDelayMs ?? 1_000;
    const max = cfg.maxDelayMs ?? 30_000;
    const jitterRatio = cfg.jitterRatio ?? 0.2;

    const exp = base * Math.pow(2, this.reconnectAttempts);
    const delay0 = Math.min(max, exp);
    const jitter = delay0 * jitterRatio * (Math.random() * 2 - 1);
    const delay = Math.max(0, Math.round(delay0 + jitter));

    this.reconnecting = true;
    this.reconnectAttempts += 1;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.performReconnect(why).catch((e) => {
        this.options.onConnectionError?.(
          e instanceof Error ? e : new Error("reconnect failed"),
        );
        this.reconnecting = false;
        // 继续下一轮
        this.maybeScheduleReconnect("reconnect failed");
      });
    }, delay);
  }

  private async performReconnect(_why: string) {
    // 先尽量关闭旧连接
    try {
      this.stopKeepAlive();
      if (this.ws) this.ws.close(4001, "reconnect");
    } catch {
      // ignore
    } finally {
      this.ws = null;
    }

    await this.connect();
    await this.login();
    // 重连成功，清空计数
    this.reconnectAttempts = 0;

    // 重新订阅已记录的订阅
    const args = Array.from(this.subscriptions.values());
    if (args.length > 0) {
      this.sendJson(buildOkxDexWsOpPayload("subscribe", args));
    }

    this.reconnecting = false;
  }

  private resetKeepAlive(_why: "open" | "message") {
    const cfg = this.options.keepAlive;
    if (!cfg) return;

    // 收到任意消息，认为连接活跃；清理等待 pong 的状态
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    this.awaitingPong = false;

    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.firePingAndExpectPong();
    }, cfg.intervalMs);
  }

  private firePingAndExpectPong() {
    const cfg = this.options.keepAlive;
    const ws = this.ws;
    if (!cfg || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.awaitingPong) return;

    this.awaitingPong = true;
    try {
      ws.send("ping");
    } catch (e) {
      this.awaitingPong = false;
      this.options.onConnectionError?.(
        e instanceof Error ? e : new Error("failed to send ping"),
      );
      return;
    }

    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      this.awaitingPong = false;
      const err = new Error("pong timeout: no message received after ping");
      this.options.onConnectionError?.(err);
      // 断开让上层决定是否重连
      try {
        // 注意：这里不把 manualClose 置为 true，允许自动重连
        if (this.ws) {
          this.ws.close(4000, "pong timeout");
        }
      } catch {
        // ignore
      }
    }, cfg.pongTimeoutMs);
  }

  private clearLoginWait(err?: Error) {
    if (this.loginTimer) {
      clearTimeout(this.loginTimer);
      this.loginTimer = null;
    }
    if (err && this.loginReject) {
      const r = this.loginReject;
      this.loginReject = null;
      this.loginResolve = null;
      this.awaitingLogin = false;
      r(err);
    } else {
      this.loginReject = null;
      this.loginResolve = null;
    }
  }

  private finishLoginOk() {
    if (this.loginTimer) {
      clearTimeout(this.loginTimer);
      this.loginTimer = null;
    }
    const ok = this.loginResolve;
    this.loginResolve = null;
    this.loginReject = null;
    this.awaitingLogin = false;
    ok?.();
  }

  private handleIncoming(raw: string) {
    // 文档约定：客户端发送 "ping"，期待服务端返回文字字符串 "pong"
    if (raw === "pong") {
      // resetKeepAlive 已在 message listener 里执行；这里只需结束等待状态
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      this.awaitingPong = false;
      return;
    }

    let msg: unknown;
    try {
      msg = JSON.parse(raw) as unknown;
    } catch {
      this.options.onConnectionError?.(
        new Error(`invalid JSON frame: ${raw.slice(0, 200)}`),
      );
      return;
    }

    if (this.awaitingLogin && msg && typeof msg === "object") {
      const o = msg as Record<string, unknown>;
      if (o.event === "login") {
        const code = String(o.code ?? "");
        if (code === "0") {
          this.finishLoginOk();
        } else {
          const detail = typeof o.msg === "string" ? o.msg : "";
          this.clearLoginWait(
            new Error(`login failed: code=${code} msg=${detail}`),
          );
        }
        this.options.onMessage?.(msg);
        return;
      }
      if (o.event === "error") {
        const code = String(o.code ?? "");
        const detail = typeof o.msg === "string" ? o.msg : "";
        this.clearLoginWait(
          new Error(`login error: code=${code} msg=${detail}`),
        );
        this.options.onMessage?.(msg);
        return;
      }
    }

    // 通知：event=notice（服务升级断线等）
    if (msg && typeof msg === "object") {
      const o = msg as Record<string, unknown>;
      if (o.event === "notice") {
        this.options.onNotice?.(msg);
      }
    }

    this.options.onMessage?.(msg);
  }
}

/** 从环境变量读取 OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE（与 REST 示例一致） */
export function okxDexWsCredentialsFromEnv(): OkxDexWsLoginCredentials {
  return {
    apiKey: mustEnv("OKX_API_KEY"),
    secretKey: mustEnv("OKX_SECRET_KEY"),
    passphrase: mustEnv("OKX_PASSPHRASE"),
  };
}

/**
 * 一键：连接 → 登录 → 通用订阅（args 可包含任意 channel）。
 */
export async function connectLoginAndSubscribe(params: {
  creds?: OkxDexWsLoginCredentials;
  args: OkxDexWsChannelArg[];
  handlers?: OkxDexWsClientHandlers;
  url?: string;
  loginTimeoutMs?: number;
  keepAlive?: OkxDexWsClientOptions["keepAlive"];
  autoReconnect?: OkxDexWsClientOptions["autoReconnect"];
}): Promise<OkxDexWebSocket> {
  const creds = params.creds ?? okxDexWsCredentialsFromEnv();
  const client = new OkxDexWebSocket(creds, {
    url: params.url,
    loginTimeoutMs: params.loginTimeoutMs,
    keepAlive: params.keepAlive,
    autoReconnect: params.autoReconnect,
    onMessage: params.handlers?.onMessage,
    onNotice: params.handlers?.onNotice,
    onConnectionError: params.handlers?.onConnectionError,
  });
  await client.connect();
  await client.login();
  client.subscribe(params.args);
  return client;
}
