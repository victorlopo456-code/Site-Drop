import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCoupon, loadCoupons, saveCoupon, type Coupon } from "@/lib/coupons";

const emptyCoupon = (): Coupon => ({
  id: crypto.randomUUID(),
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: 10,
  minimum_order: 0,
  maximum_discount: null,
  starts_at: null,
  ends_at: null,
  usage_limit: null,
  per_customer_limit: null,
  first_order_only: false,
  enabled: true,
});

const dateInput = (value: string | null) => (value ? value.slice(0, 16) : "");
const nullableNumber = (value: string) => (value === "" ? null : Number(value));

export function CouponAdmin({ accessToken }: { accessToken: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setCoupons(await loadCoupons({ data: { accessToken } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os cupons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // O token só muda quando a sessão administrativa muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const patch = <K extends keyof Coupon>(key: K, value: Coupon[K]) =>
    setEditing((current) => (current ? { ...current, [key]: value } : current));

  const submit = async () => {
    if (!editing) return;
    const code = editing.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code))
      return toast.error("Use de 3 a 30 letras, números, _ ou - no código.");
    setSaving(true);
    try {
      await saveCoupon({ data: { accessToken, coupon: { ...editing, code } } });
      toast.success("Cupom salvo.");
      setEditing(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o cupom.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl uppercase">Cupons de desconto</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie descontos com período, compra mínima e limites de utilização.
          </p>
        </div>
        <Button variant="hero" onClick={() => setEditing(emptyCoupon())}>
          <Plus className="h-4 w-4" /> Novo cupom
        </Button>
      </div>

      {editing && (
        <section className="rounded-lg border border-primary/50 bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display uppercase">
              {coupons.some((item) => item.id === editing.id) ? "Editar cupom" : "Novo cupom"}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(null)}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Código</Label>
              <Input
                id="coupon-code"
                value={editing.code}
                maxLength={30}
                onChange={(event) =>
                  patch("code", event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
                }
                placeholder="DROP10"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="coupon-description">Descrição interna</Label>
              <Input
                id="coupon-description"
                value={editing.description}
                maxLength={160}
                onChange={(event) => patch("description", event.target.value)}
                placeholder="Campanha de boas-vindas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-type">Tipo</Label>
              <select
                id="coupon-type"
                value={editing.discount_type}
                onChange={(event) =>
                  patch("discount_type", event.target.value as Coupon["discount_type"])
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="percentage">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-value">Valor do desconto</Label>
              <Input
                id="coupon-value"
                type="number"
                min="0.01"
                step="0.01"
                value={editing.discount_value}
                onChange={(event) => patch("discount_value", Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-minimum">Compra mínima (R$)</Label>
              <Input
                id="coupon-minimum"
                type="number"
                min="0"
                step="0.01"
                value={editing.minimum_order}
                onChange={(event) => patch("minimum_order", Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-maximum">Desconto máximo (R$)</Label>
              <Input
                id="coupon-maximum"
                type="number"
                min="0.01"
                step="0.01"
                value={editing.maximum_discount ?? ""}
                placeholder="Sem limite"
                onChange={(event) => patch("maximum_discount", nullableNumber(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-total-limit">Limite total de usos</Label>
              <Input
                id="coupon-total-limit"
                type="number"
                min="1"
                value={editing.usage_limit ?? ""}
                placeholder="Sem limite"
                onChange={(event) => patch("usage_limit", nullableNumber(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-customer-limit">Limite por cliente</Label>
              <Input
                id="coupon-customer-limit"
                type="number"
                min="1"
                value={editing.per_customer_limit ?? ""}
                placeholder="Sem limite"
                onChange={(event) =>
                  patch("per_customer_limit", nullableNumber(event.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-start">Início</Label>
              <Input
                id="coupon-start"
                type="datetime-local"
                value={dateInput(editing.starts_at)}
                onChange={(event) =>
                  patch(
                    "starts_at",
                    event.target.value ? new Date(event.target.value).toISOString() : null,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-end">Término</Label>
              <Input
                id="coupon-end"
                type="datetime-local"
                value={dateInput(editing.ends_at)}
                onChange={(event) =>
                  patch(
                    "ends_at",
                    event.target.value ? new Date(event.target.value).toISOString() : null,
                  )
                }
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.first_order_only}
                onChange={(event) => patch("first_order_only", event.target.checked)}
              />{" "}
              Apenas primeira compra
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(event) => patch("enabled", event.target.checked)}
              />{" "}
              Cupom ativo
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="hero" disabled={saving} onClick={submit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando…" : "Salvar cupom"}
            </Button>
            <Button variant="surface" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="animate-spin" /> Carregando…
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          Nenhum cupom cadastrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-4">Cupom</th>
                <th className="p-4">Desconto</th>
                <th className="p-4">Compra mínima</th>
                <th className="p-4">Usos</th>
                <th className="p-4">Situação</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                const expired = Boolean(coupon.ends_at && Date.parse(coupon.ends_at) < Date.now());
                return (
                  <tr key={coupon.id} className="border-b border-border last:border-0">
                    <td className="p-4">
                      <strong className="font-display text-primary">{coupon.code}</strong>
                      <div className="text-xs text-muted-foreground">
                        {coupon.description || "Sem descrição"}
                      </div>
                    </td>
                    <td className="p-4">
                      {coupon.discount_type === "percentage"
                        ? `${coupon.discount_value}%`
                        : `R$ ${coupon.discount_value.toFixed(2).replace(".", ",")}`}
                    </td>
                    <td className="p-4">R$ {coupon.minimum_order.toFixed(2).replace(".", ",")}</td>
                    <td className="p-4">
                      {coupon.used_count ?? 0}
                      {coupon.usage_limit ? ` / ${coupon.usage_limit}` : " / ∞"}
                    </td>
                    <td className="p-4">
                      <span
                        className={
                          coupon.enabled && !expired ? "text-emerald-500" : "text-muted-foreground"
                        }
                      >
                        {expired ? "Expirado" : coupon.enabled ? "Ativo" : "Desativado"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${coupon.code}`}
                          onClick={() => setEditing({ ...coupon })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${coupon.code}`}
                          onClick={async () => {
                            if (!window.confirm(`Excluir o cupom ${coupon.code}?`)) return;
                            try {
                              await deleteCoupon({ data: { accessToken, id: coupon.id } });
                              toast.success("Cupom excluído.");
                              await refresh();
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Não foi possível excluir.",
                              );
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
