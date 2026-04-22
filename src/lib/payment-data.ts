export type Coin = "USDT" | "USDC";
export type Network = "TRON" | "POLYGON" | "BSC (BEP20)" | "Ethereum";

export const COINS: { id: Coin; name: string; symbol: string; color: string }[] = [
  { id: "USDT", name: "Tether USD", symbol: "USDT", color: "#26A17B" },
  { id: "USDC", name: "USD Coin", symbol: "USDC", color: "#2775CA" },
];

export const NETWORKS: { id: Network; name: string; short: string; color: string }[] = [
  { id: "TRON", name: "Tron", short: "TRC20", color: "#EF0027" },
  { id: "POLYGON", name: "Polygon", short: "MATIC", color: "#8247E5" },
  { id: "BSC (BEP20)", name: "BNB Smart Chain", short: "BEP20", color: "#F0B90B" },
  { id: "Ethereum", name: "Ethereum", short: "ERC20", color: "#627EEA" },
];

export const DEMO_ADDRESS = "0x7F4e8B2c6A1d5E9F3B8c2D4a6E1f9B3c5D7e8A2b";

export type OrderStatus = "Pending" | "Process" | "Paid";

export type OrderInfo = {
  orderNumber: string;
  merchant: string;
  status: OrderStatus;
  subtotal: number;
  fee: number;
  amountDue: number;
};

export function generateOrder(): OrderInfo {
  const orderNumber =
    "ORD-" +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "-" +
    Math.floor(1000 + Math.random() * 9000);
  const subtotal = +(50 + Math.random() * 450).toFixed(2);
  const fee = +(subtotal * 0.015).toFixed(2);
  const amountDue = +(subtotal + fee).toFixed(2);
  return {
    orderNumber,
    merchant: "Lovable Crypto Store",
    status: "Pending",
    subtotal,
    fee,
    amountDue,
  };
}

