// Appel réseau qui ne jette jamais (lot LI) : abandon au bout de `timeoutMs`, renvoie null sur tout
// souci (réseau, statut, parsing). Aux appelants (scan.ts, commentary.ts, tts-client.ts) de retomber
// sur le cache ou la banque de secours — jamais de promesse rejetée qui remonterait jusqu'au bus.
export async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface BinaryResult {
  bytes: ArrayBuffer;
  contentType: string;
}

export async function postForBytes(url: string, body: unknown, timeoutMs: number): Promise<BinaryResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return { bytes, contentType: res.headers.get('content-type') || 'application/octet-stream' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
