export interface CryptoWallet {
  currency: string;
  network?: string;
  name: string;
  symbol: string;
  address: string;
  memo?: string;
  iconColor: string;
  badge?: string;
}

export const DONATION_WALLETS: CryptoWallet[] = [
  {
    currency: 'USDT',
    network: 'TRC-20 (Tron)',
    name: 'Tether USD',
    symbol: 'USDT',
    address: 'TMZ63AFLMUeir97AURFFZKZexMVMP1MPC7',
    iconColor: 'from-emerald-500 to-teal-700',
    badge: 'Рекомендовано (Низька комісія)'
  },
  {
    currency: 'USDT',
    network: 'BEP-20 (BNB Smart Chain)',
    name: 'Tether USD',
    symbol: 'USDT',
    address: '0xef0604c6416b307907abf20e9a90ea800878d1cf',
    iconColor: 'from-amber-500 to-yellow-600',
    badge: 'Швидка мережа'
  },
  {
    currency: 'TON',
    network: 'TON Network',
    name: 'Toncoin',
    symbol: 'TON',
    address: 'UQAg2HaykkgoM1YNycPIJFiBlzQ6tgCPkxzVIWHQ9uNiDu7w',
    iconColor: 'from-sky-500 to-blue-600',
    badge: 'Telegram Wallet'
  },
  {
    currency: 'BTC',
    network: 'Bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    address: '16UEHnixSV6Pk7tUG6tTVUuPZA8E8fKHrF',
    iconColor: 'from-orange-500 to-amber-600'
  },
  {
    currency: 'ETH',
    network: 'Ethereum (ERC-20)',
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0x6543c9CEd42eb21a08cD63F4a6cb8Ae7B283B9BB',
    iconColor: 'from-indigo-500 to-purple-600'
  },
  {
    currency: 'SOL',
    network: 'Solana',
    name: 'Solana',
    symbol: 'SOL',
    address: 'Eu32mBk24mvZ3zB6PwezgRh1nMQEUdbZxREDDBCTxyvo',
    iconColor: 'from-purple-500 to-fuchsia-600',
    badge: 'Миттєво'
  },
  {
    currency: 'DOGE',
    network: 'Dogecoin',
    name: 'Dogecoin',
    symbol: 'DOGE',
    address: 'DG4BvJjtHwrdtX8gaiD42Y6Dpbe4tBQnyU',
    iconColor: 'from-yellow-400 to-amber-600'
  },
  {
    currency: 'XRP',
    network: 'Ripple',
    name: 'Ripple',
    symbol: 'XRP',
    address: 'rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh',
    memo: '427632553',
    iconColor: 'from-slate-600 to-slate-800',
    badge: 'Обов\'язково вказувати MEMO'
  }
];
