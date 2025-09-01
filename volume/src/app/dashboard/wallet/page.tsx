"use client";
import { useEffect, useState } from 'react';

interface WalletResponse {
  public_key: string;
  balances: { sol: number; tokens: Array<{ mint: string; symbol: string; amount: number }> };
  history?: string[];
  exported_at?: string | null;
}

export default function WalletPage() {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [transferCode, setTransferCode] = useState('');
  const [exportCode, setExportCode] = useState('');
  const [exported, setExported] = useState<string | null>(null);
  const [transferStarted, setTransferStarted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/wallet/me');
        const json = await res.json();
        setData(json);
      } catch {
        setErr('Failed to load wallet');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startTransfer = async () => {
    setErr(null);
    const res = await fetch('/api/wallet/transfer/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toAddress, amount: parseFloat(amount) })
    });
    if (!res.ok) setErr('Failed to start transfer');
    else setTransferStarted(true);
  };

  const confirmTransfer = async () => {
    setErr(null);
    const res = await fetch('/api/wallet/transfer/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toAddress, amount: parseFloat(amount), code: transferCode })
    });
    if (!res.ok) setErr('Transfer failed');
  };

  const startExport = async () => {
    setErr(null);
    const res = await fetch('/api/wallet/export/start', { method: 'POST' });
    if (!res.ok) setErr('Failed to start export');
  };

  const confirmExport = async () => {
    setErr(null);
    const res = await fetch('/api/wallet/export/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: exportCode })
    });
    if (!res.ok) return setErr('Export failed');
    const json = await res.json();
    setExported(json.encrypted);
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-500">{err}</div>;
  if (!data) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4 text-foreground">Wallet</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-medium text-foreground mb-2">Balances</h2>
          <p className="text-sm">SOL: {data.balances.sol.toFixed(6)}</p>
          <div className="mt-2 space-y-1">
            {data.balances.tokens.map((t) => (
              <div key={t.mint} className="text-sm">{t.symbol}: {t.amount}</div>
            ))}
          </div>
        </div>
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-medium text-foreground mb-2">Transfer SOL</h2>
          <input className="w-full mb-2 px-2 py-1 rounded bg-background border" placeholder="To address" value={toAddress} onChange={(e)=>setToAddress(e.target.value)} />
          <input className="w-full mb-2 px-2 py-1 rounded bg-background border" placeholder="Amount" value={amount} onChange={(e)=>setAmount(e.target.value)} />
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={startTransfer}>Start</button>
            <input className="flex-1 px-2 py-1 rounded bg-background border" placeholder="Confirmation Code" value={transferCode} onChange={(e)=>setTransferCode(e.target.value)} disabled={!transferStarted} />
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50" onClick={confirmTransfer} disabled={!transferStarted}>Confirm</button>
          </div>
        </div>
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-medium text-foreground mb-2">Export Private Key</h2>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={startExport}>Start</button>
            <input className="flex-1 px-2 py-1 rounded bg-background border" placeholder="Confirmation Code" value={exportCode} onChange={(e)=>setExportCode(e.target.value)} />
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={confirmExport}>Confirm</button>
          </div>
          {exported && <pre className="mt-3 text-xs break-all p-2 bg-muted rounded">{exported}</pre>}
        </div>
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-medium text-foreground mb-2">Recent Signatures</h2>
          <div className="space-y-1">
            {data.history?.map((sig) => (<div key={sig} className="text-xs break-all">{sig}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
}
