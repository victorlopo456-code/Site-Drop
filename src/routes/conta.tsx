import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  Bell,
  CreditCard,
  Eye,
  Heart,
  KeyRound,
  LogOut,
  MapPin,
  Package,
  RotateCcw,
  Trash2,
  Undo2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductCard } from "@/components/site/ProductCard";
import { useCart } from "@/lib/cart";
import { useProducts } from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { formatBRL } from "@/lib/catalog";
import { fulfillmentLabels, loadCustomerOrders, type AdminOrder } from "@/lib/order-management";
import {
  createReturnRequest,
  deleteAddress,
  loadAddresses,
  loadOrderNotifications,
  loadReturnRequests,
  saveAddress,
  type CustomerAddress,
  type OrderNotification,
  type ReturnRequest,
} from "@/lib/customer-account";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — DROP Skate Shop" },
      { name: "description", content: "Pedidos e dados da sua conta DROP Skate Shop." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecureAccount,
});

function SecureAccount() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setLoading(false);
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user);
        setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (loading) return <AccountMessage title="Carregando sua conta…" />;
  if (!isSupabaseConfigured()) return <AccountMessage title="Supabase não configurado" />;
  if (!user)
    return (
      <AccountMessage title="Entre na sua conta">
        <Button className="mt-6" variant="hero" asChild>
          <Link to="/entrar">Entrar</Link>
        </Button>
      </AccountMessage>
    );
  return <Account user={user} />;
}

function AccountMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="container-drop flex min-h-[60vh] items-center justify-center py-16">
      <div className="max-w-xl rounded-xl border border-primary/40 bg-card p-8 text-center">
        <h1 className="text-3xl uppercase">{title}</h1>
        {children && <div className="mt-4 flex flex-col text-muted-foreground">{children}</div>}
        <Button className="mt-6" variant="hero" asChild>
          <Link to="/">Voltar para a loja</Link>
        </Button>
      </div>
    </div>
  );
}

const panels = [
  { value: "pedidos", label: "Meus pedidos", icon: Package },
  { value: "favoritos", label: "Favoritos", icon: Heart },
  { value: "enderecos", label: "Endereços", icon: MapPin },
  { value: "cartoes", label: "Pagamentos", icon: CreditCard },
  { value: "perfil", label: "Perfil", icon: User },
  { value: "senha", label: "Senha", icon: KeyRound },
  { value: "vistos", label: "Vistos", icon: Eye },
  { value: "trocas", label: "Trocas", icon: RotateCcw },
  { value: "devolucoes", label: "Devoluções", icon: Undo2 },
  { value: "notificacoes", label: "Notificações", icon: Bell },
];

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-6">{children}</div>;
}

const emptyAddress = {
  label: "Casa",
  recipient: "",
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  is_default: false,
};

function Account({ user }: { user: SupabaseUser }) {
  const { favorites } = useCart();
  const products = useProducts();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressDraft, setAddressDraft] = useState(emptyAddress);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [requestOrder, setRequestOrder] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [profileName, setProfileName] = useState(
    typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : "",
  );
  const [profileEmail, setProfileEmail] = useState(user.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const displayName = profileName || "Skatista";
  const favProducts = products.filter((product) => favorites.includes(product.id));
  const viewedProducts = viewedIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is (typeof products)[number] => Boolean(product));

  const reloadAccountData = async () => {
    const [loadedAddresses, loadedRequests, loadedNotifications] = await Promise.all([
      loadAddresses(),
      loadReturnRequests(),
      loadOrderNotifications(),
    ]);
    setAddresses(loadedAddresses);
    setRequests(loadedRequests);
    setNotifications(loadedNotifications);
  };

  useEffect(() => {
    let active = true;
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("drop-viewed-products") ?? "[]");
      if (Array.isArray(parsed))
        setViewedIds(parsed.filter((id): id is string => typeof id === "string"));
    } catch {
      /* armazenamento indisponível */
    }
    void loadCustomerOrders()
      .then((loaded) => {
        if (active) setOrders(loaded);
      })
      .catch((error) => {
        if (active)
          setOrdersError(
            error instanceof Error ? error.message : "Não foi possível carregar seus pedidos.",
          );
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });
    void reloadAccountData().catch((error) => {
      if (active) console.warn("Recursos da conta aguardam a migration:", error);
    });
    return () => {
      active = false;
    };
  }, []);

  const paidOrders = useMemo(
    () =>
      orders.filter((order) =>
        ["payment_approved", "payment_approved_stock_error"].includes(order.status),
      ),
    [orders],
  );

  const saveProfile = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || profileName.trim().length < 2)
      return toast.error("Informe seu nome completo.");
    const email = profileEmail.trim().toLowerCase();
    const { error } = await supabase.auth.updateUser({
      email,
      data: { full_name: profileName.trim() },
    });
    if (error) return toast.error(error.message);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: profileName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (profileError) return toast.error(profileError.message);
    toast.success(
      email !== user.email
        ? "Perfil salvo. Confirme a troca no novo e-mail."
        : "Perfil atualizado.",
    );
  };

  const changePassword = async () => {
    if (newPassword.length < 8)
      return toast.error("A nova senha deve ter pelo menos 8 caracteres.");
    if (newPassword !== confirmPassword) return toast.error("As senhas não conferem.");
    const { error } = await getSupabaseBrowserClient()!.auth.updateUser({ password: newPassword });
    if (error) return toast.error(error.message);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Senha alterada com segurança.");
  };

  const submitAddress = async () => {
    if (!/^\d{8}$/.test(addressDraft.postal_code) || !/^[A-Z]{2}$/.test(addressDraft.state))
      return toast.error("Confira o CEP e a UF.");
    try {
      await saveAddress(addressDraft);
      setAddresses(await loadAddresses());
      setAddressDraft(emptyAddress);
      setShowAddressForm(false);
      toast.success("Endereço salvo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const submitRequest = async (type: "exchange" | "return") => {
    if (!requestOrder || requestReason.trim().length < 10)
      return toast.error("Escolha o pedido e explique o motivo com pelo menos 10 caracteres.");
    try {
      await createReturnRequest(requestOrder, type, requestReason);
      setRequests(await loadReturnRequests());
      setRequestOrder("");
      setRequestReason("");
      toast.success(type === "exchange" ? "Troca solicitada." : "Devolução solicitada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar.");
    }
  };

  return (
    <div className="container-drop py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl uppercase md:text-4xl">Minha conta</h1>
          <p className="mt-2 text-sm text-muted-foreground">Bem-vindo de volta, {displayName}.</p>
        </div>
        <Button variant="surface" onClick={() => getSupabaseBrowserClient()?.auth.signOut()}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
      <Tabs defaultValue="pedidos" className="mt-8 gap-6 lg:grid lg:grid-cols-[240px_1fr]">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 lg:flex-col lg:items-stretch">
          {panels.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="justify-start gap-2 data-[state=active]:bg-surface data-[state=active]:text-primary"
            >
              <Icon className="h-4 w-4" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6 lg:mt-0">
          <TabsContent value="pedidos" className="space-y-4">
            {ordersLoading && (
              <Card>
                <p className="text-sm text-muted-foreground">Carregando pedidos…</p>
              </Card>
            )}
            {!ordersLoading && ordersError && (
              <Card>
                <p className="text-sm text-destructive">{ordersError}</p>
              </Card>
            )}
            {!ordersLoading && !ordersError && !orders.length && (
              <Card>
                <p className="text-sm text-muted-foreground">Você ainda não tem pedidos.</p>
              </Card>
            )}
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </TabsContent>
          <TabsContent value="favoritos">
            {!favProducts.length ? (
              <Card>
                <p className="text-sm text-muted-foreground">
                  Nenhum produto favoritado.{" "}
                  <Link
                    to="/produtos"
                    search={{ q: "", cat: "", marca: "" }}
                    className="text-primary"
                  >
                    Explorar catálogo
                  </Link>
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {favProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="enderecos" className="space-y-4">
            {addresses.map((address) => (
              <Card key={address.id}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-display uppercase">
                      {address.label}
                      {address.is_default ? " · Principal" : ""}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {address.recipient} — {address.street}, {address.number}
                      {address.complement ? `, ${address.complement}` : ""} — {address.neighborhood}
                      , {address.city}/{address.state} —{" "}
                      {address.postal_code.replace(/(\d{5})(\d{3})/, "$1-$2")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir endereço"
                    onClick={async () => {
                      await deleteAddress(address.id);
                      setAddresses(await loadAddresses());
                      toast.success("Endereço removido.");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
            {!addresses.length && !showAddressForm && (
              <Card>
                <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
              </Card>
            )}
            {showAddressForm && (
              <AddressForm
                draft={addressDraft}
                setDraft={setAddressDraft}
                onSave={submitAddress}
                onCancel={() => setShowAddressForm(false)}
              />
            )}
            {!showAddressForm && (
              <Button variant="surface" onClick={() => setShowAddressForm(true)}>
                Adicionar endereço
              </Button>
            )}
          </TabsContent>
          <TabsContent value="cartoes">
            <Card>
              <p className="font-display uppercase">Pagamento protegido pelo Mercado Pago</p>
              <p className="mt-2 text-sm text-muted-foreground">
                A DROP não armazena números de cartão. Você escolhe e gerencia a forma de pagamento
                no ambiente seguro do Mercado Pago ao finalizar cada compra.
              </p>
            </Card>
          </TabsContent>
          <TabsContent value="perfil">
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mail">E-mail</Label>
                  <Input
                    id="mail"
                    type="email"
                    value={profileEmail}
                    onChange={(event) => setProfileEmail(event.target.value)}
                    maxLength={255}
                  />
                </div>
              </div>
              <Button variant="hero" size="sm" className="mt-5" onClick={saveProfile}>
                Salvar alterações
              </Button>
            </Card>
          </TabsContent>
          <TabsContent value="senha">
            <Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nova">Nova senha</Label>
                  <Input
                    id="nova"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar">Confirmar nova senha</Label>
                  <Input
                    id="confirmar"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button variant="hero" size="sm" className="mt-5" onClick={changePassword}>
                Alterar senha
              </Button>
            </Card>
          </TabsContent>
          <TabsContent value="vistos">
            {!viewedProducts.length ? (
              <Card>
                <p className="text-sm text-muted-foreground">
                  Os produtos que você visitar aparecerão aqui.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {viewedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="trocas">
            <RequestPanel
              type="exchange"
              orders={paidOrders}
              requests={requests}
              orderId={requestOrder}
              setOrderId={setRequestOrder}
              reason={requestReason}
              setReason={setRequestReason}
              onSubmit={() => submitRequest("exchange")}
            />
          </TabsContent>
          <TabsContent value="devolucoes">
            <RequestPanel
              type="return"
              orders={paidOrders}
              requests={requests}
              orderId={requestOrder}
              setOrderId={setRequestOrder}
              reason={requestReason}
              setReason={setRequestReason}
              onSubmit={() => submitRequest("return")}
            />
          </TabsContent>
          <TabsContent value="notificacoes" className="space-y-3">
            {!notifications.length && !orders.length ? (
              <Card>
                <p className="text-sm text-muted-foreground">Você ainda não possui notificações.</p>
              </Card>
            ) : (
              <>
                {notifications.map((item) => (
                  <Card key={item.id}>
                    <p className="text-sm">{item.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </p>
                  </Card>
                ))}
                {!notifications.length &&
                  orders.map((order) => (
                    <Card key={order.id}>
                      <p className="text-sm">
                        Pedido #DRP{order.order_number}:{" "}
                        {fulfillmentLabels[order.fulfillment_status]}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleString("pt-BR")}
                      </p>
                    </Card>
                  ))}
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function OrderCard({ order }: { order: AdminOrder }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="font-display text-lg uppercase">Pedido #DRP{order.order_number}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-primary">{formatBRL(Number(order.total))}</p>
          <p className="text-xs text-muted-foreground">
            {fulfillmentLabels[order.fulfillment_status]}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.image_url && (
              <img src={item.image_url} alt="" className="h-12 w-12 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {item.quantity}× {item.name}
              </p>
              {(item.variant_size || item.variant_color) && (
                <p className="text-xs text-muted-foreground">
                  {[item.variant_size, item.variant_color].filter(Boolean).join(" / ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {order.tracking_code && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Rastreio: <span className="font-display">{order.tracking_code}</span>
          {order.carrier ? ` · ${order.carrier}` : ""}
        </div>
      )}
    </Card>
  );
}

function AddressForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: typeof emptyAddress;
  setDraft: React.Dispatch<React.SetStateAction<typeof emptyAddress>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const field = (key: keyof typeof emptyAddress, value: string | boolean) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Card>
      <h2 className="font-display text-lg uppercase">Novo endereço</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(
          [
            ["label", "Nome do endereço"],
            ["recipient", "Destinatário"],
            ["postal_code", "CEP"],
            ["street", "Rua/Avenida"],
            ["number", "Número"],
            ["complement", "Complemento"],
            ["neighborhood", "Bairro"],
            ["city", "Cidade"],
            ["state", "UF"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`address-${key}`}>{label}</Label>
            <Input
              id={`address-${key}`}
              value={String(draft[key])}
              maxLength={key === "state" ? 2 : key === "postal_code" ? 8 : 160}
              onChange={(event) =>
                field(
                  key,
                  key === "state"
                    ? event.target.value.toUpperCase().replace(/[^A-Z]/g, "")
                    : key === "postal_code"
                      ? event.target.value.replace(/\D/g, "")
                      : event.target.value,
                )
              }
            />
          </div>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.is_default}
          onChange={(event) => field("is_default", event.target.checked)}
        />{" "}
        Endereço principal
      </label>
      <div className="mt-5 flex gap-2">
        <Button variant="hero" size="sm" onClick={onSave}>
          Salvar endereço
        </Button>
        <Button variant="surface" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

const requestLabels = { exchange: "troca", return: "devolução" } as const;
const requestStatus = {
  requested: "Solicitada",
  reviewing: "Em análise",
  approved: "Aprovada",
  rejected: "Recusada",
  completed: "Concluída",
  cancelled: "Cancelada",
} as const;
function RequestPanel({
  type,
  orders,
  requests,
  orderId,
  setOrderId,
  reason,
  setReason,
  onSubmit,
}: {
  type: "exchange" | "return";
  orders: AdminOrder[];
  requests: ReturnRequest[];
  orderId: string;
  setOrderId: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  onSubmit: () => void;
}) {
  const relevant = requests.filter((request) => request.request_type === type);
  return (
    <div className="space-y-4">
      {relevant.map((request) => (
        <Card key={request.id}>
          <p className="font-display uppercase">
            {requestLabels[type]} · {requestStatus[request.status]}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>
          {request.admin_response && (
            <p className="mt-3 text-sm">Resposta da loja: {request.admin_response}</p>
          )}
        </Card>
      ))}
      <Card>
        <h2 className="font-display text-lg uppercase">Solicitar {requestLabels[type]}</h2>
        {!orders.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum pedido pago disponível para esta solicitação.
          </p>
        ) : (
          <>
            <Label htmlFor={`${type}-order`} className="mt-4 block">
              Pedido
            </Label>
            <select
              id={`${type}-order`}
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Selecione</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  #DRP{order.order_number} — {formatBRL(Number(order.total))}
                </option>
              ))}
            </select>
            <Label htmlFor={`${type}-reason`} className="mt-4 block">
              Motivo e detalhes
            </Label>
            <Textarea
              id={`${type}-reason`}
              className="mt-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              placeholder="Explique o que aconteceu e qual produto está envolvido."
            />
            <Button variant="hero" size="sm" className="mt-4" onClick={onSubmit}>
              Enviar solicitação
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
