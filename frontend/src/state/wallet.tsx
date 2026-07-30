/**
 * Wallet connection through the injected provider only.
 *
 * No WalletConnect, no bundled RPC key, no custody of any kind. Reading is
 * deliberately possible with no wallet at all — a reviewer must be able to
 * audit a case without installing anything.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { CHAIN_ID_HEX, CHAIN_NAME } from '../config';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface WalletState {
  account: string | null;
  chainId: string | null;
  provider: Eip1193Provider | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  /** True when a wallet is connected but pointed at the wrong network. */
  wrongNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

function injected(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = injected();
  const available = !!provider;

  // Reflect wallet-side changes. A user switching account or network mid-session
  // must not leave the UI acting on the previous one.
  useEffect(() => {
    const p = injected();
    if (!p?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const list = args[0] as string[] | undefined;
      setAccount(list && list.length > 0 ? (list[0] as string) : null);
    };
    const onChain = (...args: unknown[]) => setChainId((args[0] as string) ?? null);
    p.on('accountsChanged', onAccounts);
    p.on('chainChanged', onChain);
    return () => {
      p.removeListener?.('accountsChanged', onAccounts);
      p.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = injected();
    if (!p) {
      setError('No injected wallet found. Install a GenLayer-compatible wallet to sign; reading '
        + 'works without one.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      setAccount(accounts[0] ?? null);
      const cid = (await p.request({ method: 'eth_chainId' })) as string;
      setChainId(cid ?? null);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001
        ? 'Connection rejected in the wallet.'
        : (err.message ?? 'Could not connect.'));
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const p = injected();
    if (!p) return;
    try {
      await p.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      });
      setChainId(CHAIN_ID_HEX);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? `Could not switch to ${CHAIN_NAME}.`);
    }
  }, []);

  const disconnect = useCallback(() => {
    // The injected provider has no revoke; forgetting locally is the honest
    // extent of what a dapp can do, and the UI says so.
    setAccount(null);
    setError(null);
  }, []);

  const wrongNetwork = !!account && !!chainId
    && chainId.toLowerCase() !== CHAIN_ID_HEX.toLowerCase();

  const value = useMemo<WalletState>(() => ({
    account, chainId, provider, available, connecting, error, wrongNetwork,
    connect, disconnect, switchNetwork,
  }), [account, chainId, provider, available, connecting, error, wrongNetwork,
    connect, disconnect, switchNetwork]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside a WalletProvider');
  return ctx;
}
