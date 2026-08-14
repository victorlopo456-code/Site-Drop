import { useSyncExternalStore } from "react";

const KEY = "drop-orders-v1";

export const ORDER_STATUSES = [
  "Aguardando pagamento",
  "Pagamento aprovado",
  "Em separação",
  "Em transporte",
  "Entregue",
  "Cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  image: string;
};

export type Order = {
  id: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
  payment: string;
  shipping: string;
  tracking?: string;
  buyer: {
    nome: string;
    email: string;
    cpf: string;
    cep: string;
    endereco: string;
    numero: string;
    cidade: string;
  };
  items: OrderItem[];
};

const demo: Order[] = [
  {
    id: "#DRP10231",
    createdAt: "2026-07-24",
    status: "Entregue",
    total: 899.8,
    payment: "PIX",
    shipping: "Correios SEDEX",
    tracking: "BR889231045SP",
    buyer: {
      nome: "Skatista DROP",
      email: "cliente@dropskateshop.com.br",
      cpf: "123.456.789-00",
      cep: "04101000",
      endereco: "Rua do Skate",
      numero: "100",
      cidade: "São Paulo/SP",
    },
    items: [],
  },
  {
    id: "#DRP10298",
    createdAt: "2026-07-12",
    status: "Em transporte",
    total: 349.9,
    payment: "Cartão de crédito",
    shipping: "Jadlog Package",
    tracking: "JD9921004",
    buyer: {
      nome: "Skatista DROP",
      email: "cliente@dropskateshop.com.br",
      cpf: "123.456.789-00",
      cep: "04101000",
      endereco: "Rua do Skate",
      numero: "100",
      cidade: "São Paulo/SP",
    },
    items: [],
  },
];

let current: Order[] = demo;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function commit(next: Order[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  emit();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Order[];
      if (Array.isArray(parsed)) {
        current = parsed;
        emit();
      }
    }
  } catch {
    /* ignore */
  }
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOrders(): Order[] {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => demo,
  );
}

export function createOrder(order: Omit<Order, "id" | "createdAt" | "status">) {
  const id = `#DRP${10400 + current.length + 1}`;
  const full: Order = {
    ...order,
    id,
    createdAt: new Date().toISOString().slice(0, 10),
    status: "Aguardando pagamento",
  };
  commit([full, ...current]);
  return full;
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  commit(current.map((o) => (o.id === id ? { ...o, status } : o)));
}

export function setOrderTracking(id: string, tracking: string) {
  commit(current.map((o) => (o.id === id ? { ...o, tracking } : o)));
}
