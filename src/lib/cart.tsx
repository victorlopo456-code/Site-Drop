import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isOutOfStock, type Product, type Variant } from "@/lib/catalog";
import { couponDiscount, validateCoupon, type CouponApplication } from "@/lib/coupons";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { trackAnalyticsEvent } from "@/lib/analytics";

export type CartItem = {
  id: string;
  productId: string;
  variantId?: string;
  variantLabel?: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  qty: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  discount: number;
  coupon: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (product: Product, qty?: number, variant?: Variant) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  applyCoupon: (code: string) => Promise<boolean>;
  favorites: string[];
  toggleFavorite: (id: string) => void;
};

const CART_KEY = "drop-cart-v2";

const CartContext = createContext<CartContextValue | null>(null);

function readStringArray(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 200)
      : [];
  } catch {
    return [];
  }
}

function readCart(): CartItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((item): CartItem[] => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as Record<string, unknown>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.slug !== "string" ||
          typeof candidate.name !== "string" ||
          typeof candidate.brand !== "string" ||
          typeof candidate.image !== "string" ||
          typeof candidate.price !== "number" ||
          !Number.isFinite(candidate.price) ||
          candidate.price < 0 ||
          typeof candidate.qty !== "number" ||
          !Number.isFinite(candidate.qty)
        )
          return [];

        return [
          {
            id: candidate.id.slice(0, 180),
            productId:
              typeof candidate.productId === "string"
                ? candidate.productId.slice(0, 100)
                : candidate.id.slice(0, 100),
            variantId:
              typeof candidate.variantId === "string"
                ? candidate.variantId.slice(0, 100)
                : undefined,
            variantLabel:
              typeof candidate.variantLabel === "string"
                ? candidate.variantLabel.slice(0, 100)
                : undefined,
            slug: candidate.slug.slice(0, 200),
            name: candidate.name.slice(0, 200),
            brand: candidate.brand.slice(0, 100),
            image: candidate.image.slice(0, 2_000),
            price: Math.round(candidate.price * 100) / 100,
            qty: Math.min(99, Math.max(1, Math.floor(candidate.qty))),
          },
        ];
      })
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponRule, setCouponRule] = useState<CouponApplication | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setItems(readCart());
    setFavorites(readStringArray("drop-favorites"));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem("drop-favorites", JSON.stringify(favorites));
    } catch {
      /* storage unavailable */
    }
  }, [favorites]);

  const add = useCallback((product: Product, qty = 1, variant?: Variant) => {
    if (isOutOfStock(product)) return;
    if (product.variants?.length && (!variant || variant.stock <= 0)) return;
    const available = variant?.stock ?? product.stock;
    const safeQty = Math.min(99, available, Math.max(1, Math.floor(qty) || 1));
    const lineId = variant ? `${product.id}:${variant.id}` : product.id;
    setItems((prev) => {
      const found = prev.find((i) => i.id === lineId);
      if (found) {
        return prev.map((i) =>
          i.id === lineId ? { ...i, qty: Math.min(99, available, i.qty + safeQty) } : i,
        );
      }
      return [
        ...prev,
        {
          id: lineId,
          productId: product.id,
          variantId: variant?.id,
          variantLabel: variant
            ? [variant.size, variant.color].filter(Boolean).join(" · ")
            : undefined,
          slug: product.slug,
          name: product.name,
          brand: product.brand,
          price: product.price,
          image: product.images[0],
          qty: safeQty,
        },
      ];
    });
    setOpen(true);
    trackAnalyticsEvent("add_to_cart", { productId: product.id });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev.flatMap((i) =>
        i.id === id ? (qty <= 0 ? [] : [{ ...i, qty: Math.min(qty, 99) }]) : [i],
      ),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = useMemo(() => items.reduce((acc, i) => acc + i.price * i.qty, 0), [items]);

  const applyCoupon = useCallback(
    async (code: string) => {
      const supabase = getSupabaseBrowserClient();
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const result = await validateCoupon({
        data: { code, subtotal, accessToken: data.session?.access_token ?? null },
      });
      setCoupon(result.coupon.code);
      setCouponRule(result.coupon);
      return true;
    },
    [subtotal],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }, []);

  const discount = couponRule ? couponDiscount(couponRule, subtotal) : 0;
  const count = items.reduce((acc, i) => acc + i.qty, 0);

  const value: CartContextValue = {
    items,
    count,
    subtotal,
    discount,
    coupon,
    open,
    setOpen,
    add,
    remove,
    setQty,
    clear,
    applyCoupon,
    favorites,
    toggleFavorite,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de CartProvider");
  return ctx;
}
