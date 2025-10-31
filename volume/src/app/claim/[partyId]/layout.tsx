'use client';

import { PrivyWalletProvider } from '@/components/wallet/privy-provider';

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivyWalletProvider>{children}</PrivyWalletProvider>;
}
