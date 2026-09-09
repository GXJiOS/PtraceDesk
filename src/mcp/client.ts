import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from "@modelcontextprotocol/client";
import { PtraceOAuthProvider } from "./oauthProvider";

const MCP_URL = new URL("https://mcp-prod.ptrace.cfd/mcp");

interface CallbackWaiter {
  promise: Promise<string>;
  cancel: () => void;
}

function callbackWaiter(): CallbackWaiter {
  let unlisten: UnlistenFn | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectPromise: ((error: Error) => void) | undefined;

  const promise = new Promise<string>((resolve, reject) => {
    rejectPromise = reject;
    timer = setTimeout(() => reject(new Error("ptrace 授权等待超时，请重试。")), 5 * 60 * 1000);
    listen<string>("ptrace-oauth-callback", (event) => {
      if (timer) clearTimeout(timer);
      unlisten?.();
      resolve(event.payload);
    }).then((stop) => {
      unlisten = stop;
    }).catch(reject);
  });

  return {
    promise,
    cancel: () => {
      if (timer) clearTimeout(timer);
      unlisten?.();
      rejectPromise = undefined;
    },
  };
}

const nativeFetch: FetchLike = (url, init) =>
  tauriFetch(url, {
    ...init,
    connectTimeout: 20_000,
  });

function connection(provider: PtraceOAuthProvider) {
  const client = new Client({ name: "PtraceDesk", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    authProvider: provider,
    fetch: nativeFetch,
    requestInit: {
      headers: { "Accept-Language": "zh-CN" },
    },
  });
  return { client, transport };
}

export async function connectPtraceMcp(onAuthorizationStarted?: () => void) {
  const provider = new PtraceOAuthProvider(onAuthorizationStarted);
  const waiter = callbackWaiter();
  let current = connection(provider);

  try {
    await current.client.connect(current.transport);
    waiter.cancel();
    return current;
  } catch (error) {
    if (!provider.authorizationStarted) {
      waiter.cancel();
      throw error;
    }
  }

  const callbackUrl = new URL(await waiter.promise);
  const callbackState = callbackUrl.searchParams.get("state");
  if (!callbackState || callbackState !== provider.expectedState()) {
    throw new Error("ptrace 授权状态校验失败，请重新连接。");
  }
  if (callbackUrl.searchParams.get("error")) {
    throw new Error("ptrace 授权未完成，请重新连接。");
  }

  await current.transport.finishAuth(callbackUrl.searchParams);
  await current.client.close().catch(() => undefined);
  current = connection(provider);
  await current.client.connect(current.transport);
  return current;
}
