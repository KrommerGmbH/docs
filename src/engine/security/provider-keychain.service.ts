import { isUsableApiKey } from '../../shared/security/is-usable-api-key.js';

const KEYCHAIN_SERVICE_NAME = 'cmh-chatbot.llm-provider';
const KEYCHAIN_REF_PREFIX = 'keychain://cmh-llm-provider/';

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials?(service: string): Promise<Array<{ account: string; password: string }>>;
};

let _keytarPromise: Promise<KeytarModule | null> | null = null;

async function getKeytar(): Promise<KeytarModule | null> {
  if (_keytarPromise) return _keytarPromise;

  _keytarPromise = (async () => {
    try {
      const mod = await import('keytar');
      return mod as KeytarModule;
    } catch {
      return null;
    }
  })();

  return _keytarPromise;
}

export function makeProviderApiKeyRef(providerId: string): string {
  return `${KEYCHAIN_REF_PREFIX}${providerId}`;
}

export function isProviderApiKeyRef(value?: string | null): boolean {
  const v = (value ?? '').trim();
  return v.startsWith(KEYCHAIN_REF_PREFIX);
}

function getProviderIdFromRef(ref: string): string | null {
  if (!isProviderApiKeyRef(ref)) return null;
  const raw = ref.slice(KEYCHAIN_REF_PREFIX.length);
  const normalized = raw.split('?')[0];
  return normalized || null;
}

function buildRotationVersion(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function buildRotationAccount(providerId: string, version: string): string {
  return `${providerId}#${version}`;
}

function buildRotationMeta(providerId: string): string {
  return `${providerId}#meta`;
}

export interface StoreProviderApiKeyOptions {
  keepHistory?: boolean;
  rotationVersion?: string;
}

export interface ProviderApiKeyRotationResult {
  ref: string;
  versionRef: string;
  rotatedAt: string;
  version: string;
}

export async function resolveProviderApiKey(provider: { id: string; apiKey?: string | null }): Promise<string | null> {
  const raw = (provider.apiKey ?? '').trim();
  if (!raw) return null;

  if (!isProviderApiKeyRef(raw)) {
    return raw;
  }

  const account = getProviderIdFromRef(raw) ?? provider.id;
  const keytar = await getKeytar();
  if (!keytar) return null;
  try {
    return (await keytar.getPassword(KEYCHAIN_SERVICE_NAME, account)) ?? null;
  } catch {
    return null;
  }
}

export async function storeProviderApiKey(
  providerId: string,
  apiKey: string,
  options: StoreProviderApiKeyOptions = {},
): Promise<string> {
  const normalized = apiKey.trim();
  if (!normalized) return '';

  const keytar = await getKeytar();
  if (!keytar) {
    // keytar 미사용 환경(예: CI)에서는 기존 동작 유지
    return normalized;
  }

  try {
    await keytar.setPassword(KEYCHAIN_SERVICE_NAME, providerId, normalized);

    if (options.keepHistory) {
      const version = options.rotationVersion?.trim() || buildRotationVersion();
      const account = buildRotationAccount(providerId, version);
      await keytar.setPassword(KEYCHAIN_SERVICE_NAME, account, normalized);
      await keytar.setPassword(
        KEYCHAIN_SERVICE_NAME,
        buildRotationMeta(providerId),
        JSON.stringify({ latestVersion: version, rotatedAt: new Date().toISOString() }),
      );
    }

    return makeProviderApiKeyRef(providerId);
  } catch {
    // keychain 저장 실패 시 기능 가용성을 위해 평문 저장으로 폴백
    return normalized;
  }
}

export async function rotateProviderApiKey(providerId: string, apiKey: string): Promise<ProviderApiKeyRotationResult> {
  const version = buildRotationVersion();
  const ref = await storeProviderApiKey(providerId, apiKey, {
    keepHistory: true,
    rotationVersion: version,
  });

  return {
    ref,
    versionRef: `${makeProviderApiKeyRef(providerId)}?v=${encodeURIComponent(version)}`,
    rotatedAt: new Date().toISOString(),
    version,
  };
}

export async function getProviderApiKeyRotationMeta(providerId: string): Promise<{ latestVersion: string; rotatedAt: string } | null> {
  const keytar = await getKeytar();
  if (!keytar) return null;

  try {
    const raw = await keytar.getPassword(KEYCHAIN_SERVICE_NAME, buildRotationMeta(providerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latestVersion?: string; rotatedAt?: string };
    if (!parsed.latestVersion || !parsed.rotatedAt) return null;
    return {
      latestVersion: parsed.latestVersion,
      rotatedAt: parsed.rotatedAt,
    };
  } catch {
    return null;
  }
}

export async function deleteProviderApiKey(providerId: string, options: { includeHistory?: boolean } = {}): Promise<void> {
  const keytar = await getKeytar();
  if (!keytar) return;
  try {
    await keytar.deletePassword(KEYCHAIN_SERVICE_NAME, providerId);

    if (options.includeHistory && keytar.findCredentials) {
      const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE_NAME);
      const prefix = `${providerId}#`;
      for (const credential of credentials) {
        if (credential.account.startsWith(prefix)) {
          await keytar.deletePassword(KEYCHAIN_SERVICE_NAME, credential.account);
        }
      }
    }
  } catch {
    // noop
  }
}

/**
 * 평문 API 키를 keychain ref로 마이그레이션한다.
 * - 이미 ref이거나 usable key가 아니면 기존 값을 그대로 반환
 * - keytar 미사용 환경에서는 평문을 유지
 */
export async function migrateProviderApiKeyToKeychain(provider: { id: string; apiKey?: string | null }): Promise<string | null> {
  const current = (provider.apiKey ?? '').trim();
  if (!current) return null;
  if (isProviderApiKeyRef(current)) return current;
  if (!isUsableApiKey(current)) return current;

  const stored = await storeProviderApiKey(provider.id, current);
  return stored || current;
}
