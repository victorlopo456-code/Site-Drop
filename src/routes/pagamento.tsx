import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { syncMercadoPagoPayment } from "@/lib/mercado-pago";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const searchSchema = z.object({
  resultado: z.enum(["sucesso", "pendente", "falha"]).catch("pendente"),
  pedido: z.string().uuid().optional(),
  payment_id: z.coerce.string().regex(/^\d+$/).optional(),
  collection_id: z.coerce.string().regex(/^\d+$/).optional(),
});

export const Route = createFileRoute("/pagamento")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Pagamento — DROP Skate Shop" }, { name: "robots", content: "noindex" }],
  }),
  component: PaymentReturn,
});

type State = "checking" | "approved" | "pending" | "failed";

function PaymentReturn() {
  const search = Route.useSearch();
  const { clear } = useCart();
  const [state, setState] = useState<State>(search.resultado === "falha" ? "failed" : "checking");

  useEffect(() => {
    const paymentId = search.payment_id ?? search.collection_id;
    if (!search.pedido || !paymentId || search.resultado === "falha") {
      setState(search.resultado === "falha" ? "failed" : "pending");
      return;
    }
    let active = true;
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      if (!data.session) {
        if (active) setState("pending");
        return;
      }
      try {
        const result = await syncMercadoPagoPayment({
          data: { accessToken: data.session.access_token, orderId: search.pedido!, paymentId },
        });
        if (!active) return;
        if (result.paymentStatus === "approved") {
          clear();
          setState("approved");
        } else if (["rejected", "cancelled"].includes(result.paymentStatus)) {
          setState("failed");
        } else {
          setState("pending");
        }
      } catch {
        if (active) setState("pending");
      }
    })();
    return () => {
      active = false;
    };
  }, [clear, search.collection_id, search.pedido, search.payment_id, search.resultado]);

  const content = {
    checking: {
      icon: Clock3,
      title: "Confirmando pagamento",
      message: "Estamos consultando o Mercado Pago.",
    },
    approved: {
      icon: CheckCircle2,
      title: "Pagamento aprovado",
      message: "Seu pedido foi recebido e o pagamento foi confirmado.",
    },
    pending: {
      icon: Clock3,
      title: "Pagamento em análise",
      message:
        "O Mercado Pago ainda está processando o pagamento. A confirmação será atualizada automaticamente.",
    },
    failed: {
      icon: XCircle,
      title: "Pagamento não concluído",
      message:
        "O pagamento foi cancelado ou recusado. Seus produtos continuam no carrinho para uma nova tentativa.",
    },
  }[state];
  const Icon = content.icon;

  return (
    <div className="container-drop flex min-h-[60vh] items-center justify-center py-16">
      <div className="max-w-xl rounded-xl border border-primary/40 bg-card p-8 text-center">
        <Icon className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-5 text-3xl uppercase">{content.title}</h1>
        <p className="mt-3 text-muted-foreground">{content.message}</p>
        {search.pedido && (
          <p className="mt-3 break-all text-xs text-muted-foreground">Pedido: {search.pedido}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {state !== "failed" && (
            <Button variant="hero" asChild>
              <Link to="/conta">Acompanhar pedido</Link>
            </Button>
          )}
          {state === "failed" && (
            <Button variant="hero" asChild>
              <Link to="/checkout">Tentar novamente</Link>
            </Button>
          )}
          <Button variant="surface" asChild>
            <Link to="/">Voltar para a loja</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
