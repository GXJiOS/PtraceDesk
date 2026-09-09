import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";

const CALLBACK_URL = "http://127.0.0.1:53682/callback/ptracedesk";
const CLIENT_KEY = "ptrace-oauth-client";
const TOKENS_KEY = "ptrace-oauth-tokens";

async function readSecureJson<T>(key: string): Promise<T | undefined> {
  const value = await invoke<string | null>("secure_get", { key });
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    await invoke("secure_delete", { key });
    return undefined;
  }
}

async function writeSecureJson(key: string, value: unknown) {
  await invoke("secure_set", { key, value: JSON.stringify(value) });
}

export class PtraceOAuthProvider implements OAuthClientProvider {
  private verifier = "";
  private readonly stateValue = crypto.randomUUID();
  authorizationStarted = false;

  constructor(private readonly onAuthorizationStarted?: () => void) {}

  get redirectUrl() {
    return CALLBACK_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "PtraceDesk",
      client_uri: "https://mcp-prod.ptrace.cfd",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
      scope: "read",
    };
  }

  state() {
    return this.stateValue;
  }

  expectedState() {
    return this.stateValue;
  }

  clientInformation(_context?: OAuthClientInformationContext) {
    return readSecureJson<StoredOAuthClientInformation>(CLIENT_KEY);
  }

  saveClientInformation(clientInformation: StoredOAuthClientInformation, _context?: OAuthClientInformationContext) {
    return writeSecureJson(CLIENT_KEY, clientInformation);
  }

  tokens(_context?: OAuthClientInformationContext) {
    return readSecureJson<StoredOAuthTokens>(TOKENS_KEY);
  }

  saveTokens(tokens: StoredOAuthTokens, _context?: OAuthClientInformationContext) {
    return writeSecureJson(TOKENS_KEY, tokens);
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationStarted = true;
    this.onAuthorizationStarted?.();
    await invoke("start_oauth_callback_listener");
    await openUrl(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string) {
    this.verifier = codeVerifier;
  }

  codeVerifier() {
    if (!this.verifier) throw new Error("OAuth 校验信息已丢失，请重新连接 ptrace。");
    return this.verifier;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens") await invoke("secure_delete", { key: TOKENS_KEY });
    if (scope === "all" || scope === "client") await invoke("secure_delete", { key: CLIENT_KEY });
    if (scope === "all" || scope === "verifier") this.verifier = "";
  }
}

export async function hasStoredPtraceSession() {
  return Boolean(await invoke<string | null>("secure_get", { key: TOKENS_KEY }));
}

export async function clearStoredPtraceSession() {
  await Promise.all([
    invoke("secure_delete", { key: TOKENS_KEY }),
    invoke("secure_delete", { key: CLIENT_KEY }),
  ]);
}
