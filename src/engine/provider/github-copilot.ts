export type CachedCopilotToken = {
  token: string;
  expiresAt: number;
  baseUrl: string;
};

let cachedToken: CachedCopilotToken | null = null;
let currentGithubTokenStr: string | null = null;

export async function getCopilotToken(githubToken: string): Promise<CachedCopilotToken> {
  const now = Date.now();
  
  if (currentGithubTokenStr !== githubToken) {
    cachedToken = null;
    currentGithubTokenStr = githubToken;
  }
  
  if (cachedToken && cachedToken.expiresAt - now > 5 * 60 * 1000) {
    return cachedToken;
  }

  const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${githubToken.trim()}`,
      'Editor-Version': 'vscode/1.96.2',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
    },
  });

  if (!res.ok) {
    throw new Error(`Copilot token exchange failed: HTTP ${res.status}`);
  }

  const json = await res.json() as any;
  const token = json.token;
  const expiresAt = json.expires_at * 1000;

  const match = token.match(/(?:^|;)\s*proxy-ep=([^;\s]+)/i);
  const proxyEp = match?.[1]?.trim() || "https://api.individual.githubcopilot.com";
  const rawBaseUrl = proxyEp.replace(/^https?:\/\//, "").replace(/^proxy\./i, "api.");

  cachedToken = {
    token,
    expiresAt,
    baseUrl: `https://${rawBaseUrl}`
  };

  return cachedToken;
}

export function createCopilotFetchInterceptor(originalToken: string, fallbackFetch: typeof fetch = fetch): typeof fetch {
  return async (input: URL | globalThis.RequestInfo, init?: globalThis.RequestInit) => {
    let urlStr = input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;

    // Allow testing any token to see if token exchange goes through.
    const isCopilotTarget = urlStr.includes('models.github.ai/inference') || urlStr.includes('githubcopilot.com');
    
    if (originalToken && isCopilotTarget) {
      try {
        const copilotSession = await getCopilotToken(originalToken);
        const headers = new Headers(init?.headers);
        
        headers.set('Authorization', `Bearer ${copilotSession.token}`);
        headers.set('Editor-Version', 'vscode/1.96.2');
        headers.set('Editor-Plugin-Version', 'copilot-chat/0.26.7');
        headers.set('User-Agent', 'GitHubCopilotChat/0.26.7');
        
        if (urlStr.includes('models.github.ai/inference')) {
          urlStr = urlStr.replace('https://models.github.ai/inference/v1', copilotSession.baseUrl);
          urlStr = urlStr.replace('https://models.github.ai/inference', copilotSession.baseUrl);
        }

        const res = await fallbackFetch(urlStr, { ...init, headers });
        return res;
      } catch (err) {
        console.warn('[Copilot API] Token exchange failed, falling back to public endpoint:', err);
      }
    }

    return fallbackFetch(input, init);
  };
}
