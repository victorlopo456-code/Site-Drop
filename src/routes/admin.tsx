import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ClipboardList,
  LogOut,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductFormDialog } from "@/components/admin/ProductFormDialog";
import { TaxonomyAdmin } from "@/components/admin/TaxonomyAdmin";
import { CouponAdmin } from "@/components/admin/CouponAdmin";
import { discountPercent, formatBRL, isOutOfStock, totalStock, type Product } from "@/lib/catalog";
import {
  isPromotionActive,
  removeProduct,
  resetCatalog,
  schedulePromotion,
  setStock,
  setVariantStock,
  updateProduct,
  useProducts,
} from "@/lib/store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  benefitIcons,
  defaultSiteBenefits,
  saveSiteBenefits,
  type SiteBenefit,
} from "@/lib/site-benefits";
import {
  defaultSiteSettings,
  loadSiteSettings,
  saveSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";
import {
  fulfillmentLabels,
  fulfillmentStatuses,
  loadAdminOrders,
  manuallyManagedFulfillmentStatuses,
  notifyOrderUpdate,
  refundMercadoPagoOrder,
  updateAdminOrder,
  type AdminOrder,
  type FulfillmentStatus,
} from "@/lib/order-management";
import {
  loadReturnRequests,
  updateReturnRequest,
  type ReturnRequest,
} from "@/lib/customer-account";
import {
  defaultSiteAnnouncements,
  loadSiteAnnouncements,
  saveSiteAnnouncements,
  type SiteAnnouncement,
} from "@/lib/site-announcements";
import { loadAnalyticsDashboard, type AnalyticsDashboard } from "@/lib/analytics";
import {
  defaultSitePromoBanner,
  getSitePromoBanner,
  saveSitePromoBanner,
  type SitePromoBanner,
} from "@/lib/site-promo-banner";
import { loadReviewsForAdmin, moderateReview, type ProductReview } from "@/lib/product-reviews";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Gestão de produtos, estoque e promoções — DROP Skate Shop" },
      {
        name: "description",
        content:
          "Painel interno da DROP Skate Shop para cadastrar e editar produtos, controlar estoque por SKU e agendar promoções por período.",
      },
      { property: "og:title", content: "Gestão de produtos, estoque e promoções — DROP" },
      {
        property: "og:description",
        content: "Cadastre produtos, controle estoque por SKU e agende descontos por data.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecureAdminPage,
});

type AdminState =
  "loading" | "setup" | "signed-out" | "forbidden" | "mfa-enroll" | "mfa-challenge" | "ready";

type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function SecureAdminPage() {
  const [state, setState] = useState<AdminState>("loading");
  const [accessToken, setAccessToken] = useState("");
  const [benefits, setBenefits] = useState<SiteBenefit[]>(defaultSiteBenefits);
  const [saving, setSaving] = useState(false);
  const [footerSettings, setFooterSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [savingFooter, setSavingFooter] = useState(false);
  const [announcements, setAnnouncements] = useState<SiteAnnouncement[]>(defaultSiteAnnouncements);
  const [savingAnnouncements, setSavingAnnouncements] = useState(false);
  const [promoBanner, setPromoBanner] = useState<SitePromoBanner>(defaultSitePromoBanner);
  const [savingPromoBanner, setSavingPromoBanner] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState("setup");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("setup");
      return;
    }

    let active = true;
    void (async () => {
      const [{ data: auth }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      if (!active) return;
      if (!auth.user || !sessionData.session) {
        setState("signed-out");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!active) return;
      if (profile?.role !== "admin") {
        setState("forbidden");
        return;
      }

      const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] =
        await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);
      if (!active) return;
      if (assuranceError || factorsError) {
        toast.error("Não foi possível verificar a proteção em duas etapas.");
        setState("signed-out");
        return;
      }
      if (assurance.currentLevel !== "aal2") {
        const verifiedTotp = factors.totp[0];
        if (verifiedTotp) {
          setMfaFactorId(verifiedTotp.id);
          setState("mfa-challenge");
        } else {
          setState("mfa-enroll");
        }
        return;
      }

      const [{ data }, loadedFooter, loadedAnnouncements, loadedPromoBanner] = await Promise.all([
        supabase
          .from("site_benefits")
          .select("id,title,description,icon,position,enabled")
          .order("position"),
        loadSiteSettings(),
        loadSiteAnnouncements(),
        getSitePromoBanner(),
      ]);
      if (!active) return;
      setAccessToken(sessionData.session.access_token);
      if (data?.length) setBenefits(data as SiteBenefit[]);
      setFooterSettings(loadedFooter);
      setAnnouncements(loadedAnnouncements);
      setPromoBanner(loadedPromoBanner);
      setState("ready");
    })();

    return () => {
      active = false;
    };
  }, []);

  const update = (id: string, patch: Partial<SiteBenefit>) => {
    setBenefits((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const ordered = benefits.map((item, position) => ({ ...item, position }));
      const saved = await saveSiteBenefits({ data: { accessToken, benefits: ordered } });
      setBenefits(saved);
      toast.success("Banner de benefícios atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const updateFooter = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setFooterSettings((current) => ({ ...current, [key]: value }));

  const saveFooter = async () => {
    setSavingFooter(true);
    try {
      setFooterSettings(await saveSiteSettings(footerSettings));
      toast.success("Rodapé e redes sociais atualizados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o rodapé.");
    } finally {
      setSavingFooter(false);
    }
  };

  const updateAnnouncement = (id: string, patch: Partial<SiteAnnouncement>) =>
    setAnnouncements((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const moveAnnouncement = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= announcements.length) return;
    setAnnouncements((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy.map((item, position) => ({ ...item, position }));
    });
  };

  const saveAnnouncements = async () => {
    setSavingAnnouncements(true);
    try {
      const saved = await saveSiteAnnouncements(
        announcements.map((item, position) => ({ ...item, position })),
      );
      setAnnouncements(saved);
      toast.success("Faixa superior atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a faixa.");
    } finally {
      setSavingAnnouncements(false);
    }
  };

  const updatePromoBanner = <K extends keyof SitePromoBanner>(key: K, value: SitePromoBanner[K]) =>
    setPromoBanner((current) => ({ ...current, [key]: value }));

  const savePromoBanner = async () => {
    setSavingPromoBanner(true);
    try {
      const saved = await saveSitePromoBanner({ data: { accessToken, banner: promoBanner } });
      setPromoBanner(saved);
      toast.success("Banner promocional atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o banner.");
    } finally {
      setSavingPromoBanner(false);
    }
  };

  const beginMfaEnrollment = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setMfaBusy(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      await Promise.all(
        (factors?.all ?? [])
          .filter((factor) => factor.factor_type === "totp" && factor.status === "unverified")
          .map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })),
      );
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "DROP Skate Shop Admin",
        issuer: "DROP Skate Shop",
      });
      if (error) throw error;
      const qrCode = data.totp.qr_code.startsWith("data:")
        ? data.totp.qr_code
        : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`;
      setMfaEnrollment({ factorId: data.id, qrCode, secret: data.totp.secret });
      setMfaFactorId(data.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar a proteção.");
    } finally {
      setMfaBusy(false);
    }
  };

  const verifyMfa = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !mfaFactorId || !/^\d{6}$/.test(mfaCode)) {
      toast.error("Digite o código de 6 números do aplicativo autenticador.");
      return;
    }
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: mfaCode,
      });
      if (error) throw error;
      toast.success("Acesso administrativo protegido.");
      window.location.reload();
    } catch {
      toast.error("Código inválido ou expirado. Confira no aplicativo e tente novamente.");
    } finally {
      setMfaBusy(false);
    }
  };

  if (state === "loading") return <AdminMessage title="Validando acesso…" />;
  if (state === "setup") {
    return (
      <AdminMessage title="Conecte o Supabase">
        Copie <code>.env.example</code> para <code>.env.local</code>, informe a URL e a chave
        pública do projeto e execute a migration da pasta <code>supabase/migrations</code>.
      </AdminMessage>
    );
  }
  if (state === "signed-out") {
    return (
      <AdminMessage title="Login necessário">
        Entre com uma conta administrativa para acessar esta área.
        <Button className="mt-6" variant="hero" asChild>
          <Link to="/entrar">Entrar</Link>
        </Button>
      </AdminMessage>
    );
  }
  if (state === "forbidden") {
    return (
      <AdminMessage title="Acesso negado">
        Sua conta não possui a função de administrador.
      </AdminMessage>
    );
  }
  if (state === "mfa-enroll") {
    return (
      <AdminMessage title="Proteja sua conta de administrador">
        {!mfaEnrollment ? (
          <>
            <p>
              Antes de abrir o painel, ative a verificação em duas etapas com Google Authenticator,
              Microsoft Authenticator ou outro aplicativo compatível.
            </p>
            <Button className="mt-6" variant="hero" disabled={mfaBusy} onClick={beginMfaEnrollment}>
              {mfaBusy ? "Preparando…" : "Ativar proteção"}
            </Button>
          </>
        ) : (
          <>
            <p>Escaneie este QR Code no aplicativo autenticador.</p>
            <img
              src={mfaEnrollment.qrCode}
              alt="QR Code para ativar a autenticação em duas etapas"
              className="mx-auto mt-4 h-52 w-52 rounded bg-white p-2"
            />
            <p className="mt-3 text-xs">Se não puder escanear, use esta chave:</p>
            <code className="mt-1 break-all rounded bg-background p-2 text-xs text-foreground">
              {mfaEnrollment.secret}
            </code>
            <Label htmlFor="mfa-enroll-code" className="mt-5 text-left text-foreground">
              Código de 6 números
            </Label>
            <Input
              id="mfa-enroll-code"
              className="mt-2 text-center text-lg tracking-[0.35em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
            />
            <Button className="mt-4" variant="hero" disabled={mfaBusy} onClick={verifyMfa}>
              {mfaBusy ? "Confirmando…" : "Confirmar e entrar"}
            </Button>
          </>
        )}
      </AdminMessage>
    );
  }
  if (state === "mfa-challenge") {
    return (
      <AdminMessage title="Código de segurança">
        <p>Abra seu aplicativo autenticador e informe o código atual.</p>
        <Label htmlFor="mfa-code" className="mt-5 text-left text-foreground">
          Código de 6 números
        </Label>
        <Input
          id="mfa-code"
          className="mt-2 text-center text-lg tracking-[0.35em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={mfaCode}
          onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter") void verifyMfa();
          }}
        />
        <Button className="mt-4" variant="hero" disabled={mfaBusy} onClick={verifyMfa}>
          {mfaBusy ? "Confirmando…" : "Entrar no painel"}
        </Button>
      </AdminMessage>
    );
  }

  return (
    <div className="container-drop py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">
            Painel interno
          </p>
          <h1 className="mt-2 text-3xl uppercase md:text-4xl">Gerenciamento da loja</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Controle produtos, estoque, promoções e a aparência do site.
          </p>
        </div>
        <Button
          variant="surface"
          onClick={async () => {
            await getSupabaseBrowserClient()?.auth.signOut();
            setState("signed-out");
          }}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>

      <Tabs defaultValue="visao-geral" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="catalogo">Produtos, estoque e promoções</TabsTrigger>
          <TabsTrigger value="categorias">Categorias e marcas</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
          <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
          <TabsTrigger value="aparencia">Aparência da loja</TabsTrigger>
          <TabsTrigger value="rodape">Rodapé e redes sociais</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-6">
          <OperationsOverview />
        </TabsContent>

        <TabsContent value="pedidos" className="mt-6">
          <OrdersAdmin accessToken={accessToken} />
          <ReturnsAdmin />
        </TabsContent>

        <TabsContent value="relatorios" className="mt-6">
          <AnalyticsAdmin accessToken={accessToken} />
        </TabsContent>

        <TabsContent value="catalogo">
          <AdminPage />
        </TabsContent>

        <TabsContent value="categorias" className="mt-6">
          <TaxonomyAdmin />
        </TabsContent>

        <TabsContent value="cupons" className="mt-6">
          <CouponAdmin accessToken={accessToken} />
        </TabsContent>

        <TabsContent value="avaliacoes" className="mt-6">
          <ReviewsAdmin />
        </TabsContent>

        <TabsContent value="aparencia" className="mt-6">
          <div className="mb-10 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl uppercase">Faixa superior</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Edite as mensagens que passam no topo do site. A opção “Laranja” destaca a frase.
                </p>
              </div>
              <Button
                variant="surface"
                disabled={announcements.length >= 12}
                onClick={() =>
                  setAnnouncements((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      text: "Nova mensagem",
                      accent: false,
                      position: current.length,
                      enabled: true,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Adicionar mensagem
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {announcements.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end"
                >
                  <div className="space-y-2">
                    <Label htmlFor={`announcement-${item.id}`}>Mensagem</Label>
                    <Input
                      id={`announcement-${item.id}`}
                      value={item.text}
                      maxLength={80}
                      onChange={(event) =>
                        updateAnnouncement(item.id, { text: event.target.value })
                      }
                    />
                  </div>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.accent}
                      onChange={(event) =>
                        updateAnnouncement(item.id, { accent: event.target.checked })
                      }
                    />
                    Laranja
                  </label>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(event) =>
                        updateAnnouncement(item.id, { enabled: event.target.checked })
                      }
                    />
                    Exibir
                  </label>
                  <div className="flex gap-1">
                    <Button
                      variant="surface"
                      size="icon"
                      disabled={index === 0}
                      aria-label="Mover para esquerda"
                      onClick={() => moveAnnouncement(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="surface"
                      size="icon"
                      disabled={index === announcements.length - 1}
                      aria-label="Mover para direita"
                      onClick={() => moveAnnouncement(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={announcements.length === 1}
                      aria-label="Excluir mensagem"
                      onClick={() =>
                        setAnnouncements((current) =>
                          current.filter((candidate) => candidate.id !== item.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="hero"
              className="mt-5"
              disabled={savingAnnouncements}
              onClick={saveAnnouncements}
            >
              <Save className="h-4 w-4" />{" "}
              {savingAnnouncements ? "Salvando…" : "Salvar faixa superior"}
            </Button>
          </div>

          <div className="mb-10 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl uppercase">Banner promocional da página inicial</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Edite o banner “Semana DROP” exibido perto do final da página inicial.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={promoBanner.enabled}
                  onCheckedChange={(checked) => updatePromoBanner("enabled", checked)}
                />
                Exibir banner
              </label>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="promo-eyebrow">Chamada pequena</Label>
                <Input
                  id="promo-eyebrow"
                  maxLength={60}
                  value={promoBanner.eyebrow}
                  onChange={(event) => updatePromoBanner("eyebrow", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-coupon">Cupom</Label>
                <Input
                  id="promo-coupon"
                  maxLength={40}
                  value={promoBanner.coupon}
                  onChange={(event) =>
                    updatePromoBanner("coupon", event.target.value.toUpperCase())
                  }
                  placeholder="Deixe vazio para ocultar"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="promo-title">Título</Label>
                <Input
                  id="promo-title"
                  maxLength={120}
                  value={promoBanner.title}
                  onChange={(event) => updatePromoBanner("title", event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="promo-description">Descrição</Label>
                <Textarea
                  id="promo-description"
                  rows={3}
                  maxLength={300}
                  value={promoBanner.description}
                  onChange={(event) => updatePromoBanner("description", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-button-label">Texto do botão</Label>
                <Input
                  id="promo-button-label"
                  maxLength={60}
                  value={promoBanner.button_label}
                  onChange={(event) => updatePromoBanner("button_label", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-button-url">Destino do botão</Label>
                <Input
                  id="promo-button-url"
                  maxLength={300}
                  value={promoBanner.button_url}
                  onChange={(event) => updatePromoBanner("button_url", event.target.value)}
                  placeholder="/promocoes"
                />
              </div>
            </div>
            <Button
              variant="hero"
              className="mt-5"
              disabled={savingPromoBanner}
              onClick={savePromoBanner}
            >
              <Save className="h-4 w-4" />{" "}
              {savingPromoBanner ? "Salvando…" : "Salvar banner promocional"}
            </Button>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl uppercase">Banner de benefícios</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Altere os benefícios exibidos logo abaixo do banner principal.
            </p>
          </div>
          <div className="space-y-4">
            {benefits.map((benefit) => (
              <div
                key={benefit.id}
                className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-[1fr_1.5fr_160px_auto]"
              >
                <div className="space-y-2">
                  <Label htmlFor={`title-${benefit.id}`}>Título</Label>
                  <Input
                    id={`title-${benefit.id}`}
                    value={benefit.title}
                    maxLength={60}
                    onChange={(event) => update(benefit.id, { title: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`description-${benefit.id}`}>Descrição</Label>
                  <Input
                    id={`description-${benefit.id}`}
                    value={benefit.description}
                    maxLength={120}
                    onChange={(event) => update(benefit.id, { description: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`icon-${benefit.id}`}>Ícone</Label>
                  <select
                    id={`icon-${benefit.id}`}
                    value={benefit.icon}
                    onChange={(event) =>
                      update(benefit.id, { icon: event.target.value as SiteBenefit["icon"] })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    {benefitIcons.map((icon) => (
                      <option key={icon} value={icon}>
                        {icon}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={benefit.enabled}
                    onChange={(event) => update(benefit.id, { enabled: event.target.checked })}
                  />
                  Exibir
                </label>
              </div>
            ))}
          </div>

          <Button variant="hero" size="lg" className="mt-6" disabled={saving} onClick={save}>
            <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </TabsContent>

        <TabsContent value="rodape" className="mt-6">
          <div className="mb-6">
            <h2 className="text-2xl uppercase">Rodapé e redes sociais</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Altere os dados exibidos no final do site. Deixe uma rede social vazia para ocultar o
              ícone.
            </p>
            {(footerSettings.company_document.includes("00.000.000") ||
              footerSettings.email.includes("@dropskateshop.com.br") ||
              footerSettings.address.includes("Rua do Skate")) && (
              <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                Antes de publicar, substitua CNPJ/documento, e-mail e endereço de demonstração pelos
                dados oficiais da loja. As páginas institucionais usam estas informações.
              </div>
            )}
          </div>

          <div className="grid gap-5 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="footer-description">Descrição da loja</Label>
              <Textarea
                id="footer-description"
                rows={3}
                maxLength={500}
                value={footerSettings.store_description}
                onChange={(event) => updateFooter("store_description", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-phone">WhatsApp comercial</Label>
              <Input
                id="footer-phone"
                maxLength={40}
                inputMode="tel"
                placeholder="(35) 99999-9999"
                value={footerSettings.phone}
                onChange={(event) => updateFooter("phone", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Informe DDD e número. O site adiciona automaticamente o código do Brasil (55).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-email">E-mail</Label>
              <Input
                id="footer-email"
                type="email"
                maxLength={254}
                value={footerSettings.email}
                onChange={(event) => updateFooter("email", event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="footer-address">Endereço</Label>
              <Input
                id="footer-address"
                maxLength={300}
                value={footerSettings.address}
                onChange={(event) => updateFooter("address", event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="footer-payment">Formas de pagamento</Label>
              <Input
                id="footer-payment"
                maxLength={300}
                value={footerSettings.payment_methods}
                onChange={(event) => updateFooter("payment_methods", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-instagram">Link do Instagram</Label>
              <Input
                id="footer-instagram"
                type="url"
                maxLength={500}
                placeholder="https://www.instagram.com/sua_loja"
                value={footerSettings.instagram_url}
                onChange={(event) => updateFooter("instagram_url", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-youtube">Link do YouTube</Label>
              <Input
                id="footer-youtube"
                type="url"
                maxLength={500}
                placeholder="https://www.youtube.com/@sua_loja"
                value={footerSettings.youtube_url}
                onChange={(event) => updateFooter("youtube_url", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-document">CNPJ ou documento</Label>
              <Input
                id="footer-document"
                maxLength={80}
                value={footerSettings.company_document}
                onChange={(event) => updateFooter("company_document", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer-copyright">Texto de direitos autorais</Label>
              <Input
                id="footer-copyright"
                maxLength={160}
                value={footerSettings.copyright_text}
                onChange={(event) => updateFooter("copyright_text", event.target.value)}
              />
            </div>
          </div>

          <Button
            variant="hero"
            size="lg"
            className="mt-6"
            disabled={savingFooter}
            onClick={saveFooter}
          >
            <Save className="h-4 w-4" /> {savingFooter ? "Salvando…" : "Salvar rodapé"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type OrderDraft = {
  fulfillment_status: FulfillmentStatus;
  carrier: string;
  tracking_code: string;
  admin_notes: string;
};

const paymentLabels: Record<string, string> = {
  pending: "Pagamento pendente",
  approved: "Pagamento aprovado",
  rejected: "Pagamento recusado",
  cancelled: "Pagamento cancelado",
  refunded: "Pagamento reembolsado",
  charged_back: "Pagamento contestado",
};

function addressText(address: AdminOrder["shipping_address"]) {
  return [address.endereco, address.numero, address.cidade, address.cep]
    .filter(Boolean)
    .join(" — ");
}

function ReviewsAdmin() {
  const products = useProducts();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    try {
      setReviews(await loadReviewsForAdmin());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar avaliações.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const updateStatus = async (review: ProductReview, status: ProductReview["status"]) => {
    try {
      await moderateReview(review.id, status);
      toast.success(status === "approved" ? "Avaliação aprovada." : "Avaliação rejeitada.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível moderar.");
    }
  };
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Confiança</p>
          <h2 className="mt-2 text-3xl uppercase">Avaliações verificadas</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Aprove ou rejeite comentários enviados por clientes que realmente compraram.
          </p>
        </div>
        <Button variant="surface" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      <div className="mt-6 space-y-4">
        {!loading && !reviews.length && (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Nenhuma avaliação enviada.
          </div>
        )}
        {reviews.map((review) => {
          const product = products.find((item) => item.id === review.product_id);
          return (
            <article key={review.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display uppercase">{product?.name ?? review.product_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {review.reviewer_name} ·{" "}
                    {new Date(review.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="rounded border border-border px-2 py-1 text-xs uppercase">
                  {review.status === "pending"
                    ? "Pendente"
                    : review.status === "approved"
                      ? "Aprovada"
                      : "Rejeitada"}
                </span>
              </div>
              <div className="mt-3 flex gap-1">
                {Array.from({ length: review.rating }).map((_, index) => (
                  <span key={index} className="text-primary">
                    ★
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="hero"
                  size="sm"
                  onClick={() => void updateStatus(review, "approved")}
                >
                  Aprovar
                </Button>
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => void updateStatus(review, "rejected")}
                >
                  Rejeitar
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OperationsOverview() {
  const products = useProducts();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setOrders(await loadAdminOrders());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o resumo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const now = new Date();
  const approvedThisMonth = orders.filter((order) => {
    const created = new Date(order.created_at);
    return (
      order.payment_status === "approved" &&
      created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth()
    );
  });
  const revenue = approvedThisMonth.reduce((sum, order) => sum + Number(order.total), 0);
  const averageTicket = approvedThisMonth.length ? revenue / approvedThisMonth.length : 0;
  const actionOrders = orders.filter((order) =>
    ["waiting_payment", "preparing", "stock_review"].includes(order.fulfillment_status),
  );
  const lowStock = products.filter((product) => {
    const stock = totalStock(product);
    return stock > 0 && stock <= 3 && !product.soldOut;
  });
  const soldOut = products.filter((product) => isOutOfStock(product));

  const metrics = [
    {
      label: "Faturamento no mês",
      value: formatBRL(revenue),
      detail: `${approvedThisMonth.length} venda(s) aprovada(s)`,
      icon: TrendingUp,
    },
    {
      label: "Ticket médio",
      value: formatBRL(averageTicket),
      detail: "Pedidos aprovados neste mês",
      icon: ClipboardList,
    },
    {
      label: "Pedidos para agir",
      value: actionOrders.length,
      detail: "Aguardando, preparando ou revisar",
      icon: AlertTriangle,
    },
    {
      label: "Atenção no estoque",
      value: lowStock.length + soldOut.length,
      detail: `${lowStock.length} baixo · ${soldOut.length} esgotado(s)`,
      icon: Boxes,
    },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">
            Hoje na DROP
          </p>
          <h2 className="mt-2 text-3xl uppercase">Visão geral operacional</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O que precisa da sua atenção para manter vendas, pedidos e estoque em dia.
          </p>
        </div>
        <Button variant="surface" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs uppercase text-muted-foreground">{label}</p>
              <Icon className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <p className="mt-3 font-display text-2xl text-primary sm:text-3xl">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display text-lg uppercase">Pedidos que exigem ação</h3>
          <div className="mt-4 space-y-3">
            {!actionOrders.length ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido pendente no momento.</p>
            ) : (
              actionOrders.slice(0, 6).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block font-display uppercase">#DRP{order.order_number}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {order.buyer_name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-primary">
                      {fulfillmentLabels[order.fulfillment_status]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatBRL(Number(order.total))}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display text-lg uppercase">Alertas de estoque</h3>
          <div className="mt-4 space-y-3">
            {!lowStock.length && !soldOut.length ? (
              <p className="text-sm text-muted-foreground">
                Todos os produtos possuem estoque saudável.
              </p>
            ) : (
              [...soldOut, ...lowStock].slice(0, 8).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 border-b border-border pb-3 text-sm last:border-0"
                >
                  <img src={product.images[0]} alt="" className="h-10 w-10 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{product.name}</span>
                    <span className="block text-xs text-muted-foreground">SKU {product.sku}</span>
                  </span>
                  <span className={isOutOfStock(product) ? "text-destructive" : "text-primary"}>
                    {isOutOfStock(product) ? "Esgotado" : `${totalStock(product)} restante(s)`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsAdmin({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(30);
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async (period = days) => {
    setLoading(true);
    try {
      setDashboard(await loadAnalyticsDashboard({ data: { accessToken, days: period } }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar os relatórios.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const conversion = dashboard?.visitors ? (dashboard.purchases / dashboard.visitors) * 100 : 0;
  const metrics = dashboard
    ? [
        ["Visitantes", dashboard.visitors],
        ["Páginas vistas", dashboard.pageViews],
        ["Produtos vistos", dashboard.productViews],
        ["Adições ao carrinho", dashboard.addToCart],
        ["Checkouts iniciados", dashboard.beginCheckout],
        ["Compras aprovadas", dashboard.purchases],
      ]
    : [];
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Desempenho</p>
          <h2 className="mt-2 text-3xl uppercase">Visitas e conversões</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Métricas próprias, sem armazenar IP, nome ou e-mail do visitante.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(event) => {
              const value = Number(event.target.value);
              setDays(value);
              void refresh(value);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
          </select>
          <Button variant="surface" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>
      {loading && !dashboard ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Carregando métricas…
        </div>
      ) : (
        dashboard && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card p-5">
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="mt-2 font-display text-3xl text-primary">{value}</p>
                </div>
              ))}
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs uppercase text-muted-foreground">Faturamento aprovado</p>
                <p className="mt-2 font-display text-2xl text-primary">
                  {formatBRL(Number(dashboard.revenue))}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs uppercase text-muted-foreground">Conversão</p>
                <p className="mt-2 font-display text-3xl text-primary">{conversion.toFixed(1)}%</p>
              </div>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-display text-lg uppercase">Origem das visitas</h3>
                <div className="mt-4 space-y-3">
                  {!dashboard.sources.length ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma visita registrada ainda.
                    </p>
                  ) : (
                    dashboard.sources.map((source) => (
                      <div
                        key={source.source}
                        className="flex justify-between border-b border-border pb-2 text-sm"
                      >
                        <span>{source.source}</span>
                        <span className="font-display">{source.visitors}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-display text-lg uppercase">Vendas por campanha</h3>
                <div className="mt-4 space-y-3">
                  {!dashboard.campaigns.length ? (
                    <p className="text-sm text-muted-foreground">Nenhuma venda atribuída ainda.</p>
                  ) : (
                    dashboard.campaigns.map((campaign, index) => (
                      <div
                        key={`${campaign.source}-${campaign.campaign}-${index}`}
                        className="border-b border-border pb-3 text-sm"
                      >
                        <div className="flex justify-between">
                          <span>
                            {campaign.source}
                            {campaign.campaign ? ` · ${campaign.campaign}` : ""}
                          </span>
                          <span className="font-display">
                            {campaign.visitors} visita(s) · {campaign.purchases} compra(s)
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-primary">
                          {formatBRL(Number(campaign.revenue))}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-5">
              <p className="font-display uppercase">Link para a bio do Instagram</p>
              <code className="mt-3 block break-all text-sm text-primary">
                https://drop-skate-shop.vercel.app/?utm_source=instagram&amp;utm_medium=social&amp;utm_campaign=bio
              </code>
              <p className="mt-2 text-xs text-muted-foreground">
                Use esse endereço na bio. Para anúncios diferentes, troque “bio” por um nome como
                lancamento-shapes.
              </p>
            </div>
          </>
        )
      )}
    </section>
  );
}

function OrdersAdmin({ accessToken }: { accessToken: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<string, OrderDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const loaded = await loadAdminOrders();
      setOrders(loaded);
      setDrafts(
        Object.fromEntries(
          loaded.map((order) => [
            order.id,
            {
              fulfillment_status: order.fulfillment_status,
              carrier: order.carrier ?? "",
              tracking_code: order.tracking_code ?? "",
              admin_notes: order.admin_notes ?? "",
            },
          ]),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.fulfillment_status !== statusFilter) return false;
      if (!normalized) return true;
      return [
        String(order.order_number),
        order.buyer_name,
        order.buyer_email,
        order.mercado_pago_payment_id ?? "",
        ...order.order_items.flatMap((item) => [item.name, item.sku]),
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [orders, query, statusFilter]);

  const changeDraft = (id: string, patch: Partial<OrderDraft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const saveOrder = async (order: AdminOrder) => {
    const draft = drafts[order.id];
    if (!draft) return;
    setBusyId(order.id);
    try {
      await updateAdminOrder(order, draft);
      if (
        ["preparing", "shipped", "delivered"].includes(draft.fulfillment_status) &&
        (order.fulfillment_status !== draft.fulfillment_status ||
          (order.tracking_code ?? "") !== draft.tracking_code.trim())
      ) {
        await notifyOrderUpdate({
          data: {
            accessToken,
            orderId: order.id,
            status: draft.fulfillment_status as "preparing" | "shipped" | "delivered",
          },
        });
      }
      toast.success(`Pedido #DRP${order.order_number} atualizado.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o pedido.");
    } finally {
      setBusyId(null);
    }
  };

  const refundOrder = async (order: AdminOrder) => {
    const confirmation = window.prompt(
      `O valor de ${formatBRL(Number(order.total))} será devolvido e o estoque restaurado. Digite REEMBOLSAR para confirmar.`,
    );
    if (confirmation !== "REEMBOLSAR") return;
    setBusyId(order.id);
    try {
      await refundMercadoPagoOrder({ data: { accessToken, orderId: order.id, confirmation } });
      toast.success(`Pedido #DRP${order.order_number} reembolsado.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível fazer o reembolso.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Operação</p>
          <h2 className="mt-2 text-3xl uppercase">Gerenciamento de pedidos</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Acompanhe pagamentos, separe produtos, informe o rastreio e conclua entregas.
          </p>
        </div>
        <Button variant="surface" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_240px]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por pedido, cliente, produto ou SKU"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos os status</option>
          {fulfillmentStatuses.map((status) => (
            <option key={status} value={status}>
              {fulfillmentLabels[status]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Carregando pedidos…
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center">
          <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {filtered.map((order) => {
            const draft = drafts[order.id];
            if (!draft) return null;
            const canRefund =
              order.status === "payment_approved" && Boolean(order.mercado_pago_payment_id);
            return (
              <article key={order.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-xl uppercase">Pedido #DRP{order.order_number}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("pt-BR")} · {order.buyer_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl text-primary">
                      {formatBRL(Number(order.total))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {paymentLabels[order.payment_status] ?? order.payment_status}
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 py-5 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Cliente e entrega</p>
                      <p className="mt-1 text-sm">
                        {order.buyer_name} · {order.buyer_email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {addressText(order.shipping_address)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Frete: {order.shipping_method}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase text-muted-foreground">Produtos</p>
                      {order.order_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-3 rounded-md border border-border p-3"
                        >
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt=""
                              className="h-14 w-14 rounded object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="font-display uppercase">
                              {item.quantity}× {item.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              SKU {item.sku}
                              {(item.variant_size || item.variant_color) &&
                                ` · ${[item.variant_size, item.variant_color].filter(Boolean).join(" / ")}`}
                            </p>
                          </div>
                          <p className="text-sm">{formatBRL(Number(item.line_total))}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid content-start gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Status do pedido</Label>
                      <select
                        value={draft.fulfillment_status}
                        disabled={order.fulfillment_status === "refunded"}
                        onChange={(event) =>
                          changeDraft(order.id, {
                            fulfillment_status: event.target.value as FulfillmentStatus,
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {manuallyManagedFulfillmentStatuses.map((status) => (
                          <option key={status} value={status}>
                            {fulfillmentLabels[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Transportadora</Label>
                      <Input
                        value={draft.carrier}
                        maxLength={100}
                        onChange={(event) => changeDraft(order.id, { carrier: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Código de rastreio</Label>
                      <Input
                        value={draft.tracking_code}
                        maxLength={100}
                        onChange={(event) =>
                          changeDraft(order.id, { tracking_code: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Observações internas</Label>
                      <Textarea
                        rows={3}
                        maxLength={1000}
                        value={draft.admin_notes}
                        onChange={(event) =>
                          changeDraft(order.id, { admin_notes: event.target.value })
                        }
                      />
                    </div>
                    {order.stock_error && (
                      <p className="text-sm text-destructive sm:col-span-2">
                        Atenção: {order.stock_error}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button
                        variant="hero"
                        disabled={busyId === order.id || order.fulfillment_status === "refunded"}
                        onClick={() => void saveOrder(order)}
                      >
                        <Save className="h-4 w-4" /> Salvar pedido
                      </Button>
                      {canRefund && (
                        <Button
                          variant="destructive"
                          disabled={busyId === order.id}
                          onClick={() => void refundOrder(order)}
                        >
                          <Undo2 className="h-4 w-4" /> Reembolsar pagamento
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const returnStatusLabels: Record<ReturnRequest["status"], string> = {
  requested: "Solicitada",
  reviewing: "Em análise",
  approved: "Aprovada",
  rejected: "Recusada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function ReturnsAdmin() {
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, ReturnRequest["status"]>>({});
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    try {
      const loaded = await loadReturnRequests();
      setRequests(loaded);
      setResponses(Object.fromEntries(loaded.map((item) => [item.id, item.admin_response ?? ""])));
      setStatuses(Object.fromEntries(loaded.map((item) => [item.id, item.status])));
    } catch (error) {
      console.warn("Solicitações pós-venda aguardam a migration:", error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const save = async (request: ReturnRequest) => {
    try {
      await updateReturnRequest(
        request.id,
        statuses[request.id] ?? request.status,
        responses[request.id] ?? "",
      );
      toast.success("Solicitação atualizada.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.");
    }
  };
  return (
    <section className="mt-12 border-t border-border pt-10">
      <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Pós-venda</p>
      <h2 className="mt-2 text-3xl uppercase">Trocas e devoluções</h2>
      {loading ? (
        <p className="mt-5 text-sm text-muted-foreground">Carregando solicitações…</p>
      ) : !requests.length ? (
        <div className="mt-5 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma solicitação recebida.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {requests.map((request) => (
            <article key={request.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-display uppercase">
                    {request.request_type === "exchange" ? "Troca" : "Devolução"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pedido {request.order_id} ·{" "}
                    {new Date(request.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={statuses[request.id] ?? request.status}
                  onChange={(event) =>
                    setStatuses((current) => ({
                      ...current,
                      [request.id]: event.target.value as ReturnRequest["status"],
                    }))
                  }
                >
                  {Object.entries(returnStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-4 text-sm">{request.reason}</p>
              <Label htmlFor={`response-${request.id}`} className="mt-4 block">
                Resposta para o cliente
              </Label>
              <Textarea
                id={`response-${request.id}`}
                className="mt-2"
                maxLength={1000}
                value={responses[request.id] ?? ""}
                onChange={(event) =>
                  setResponses((current) => ({ ...current, [request.id]: event.target.value }))
                }
              />
              <Button variant="hero" size="sm" className="mt-3" onClick={() => void save(request)}>
                <Save className="h-4 w-4" /> Salvar resposta
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminMessage({ title, children }: { title: string; children?: React.ReactNode }) {
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

function AdminPage() {
  const products = useProducts();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.brand, p.category, p.sku].some((f) => f.toLowerCase().includes(q)),
    );
  }, [products, query]);

  const promos = products.filter((p) => p.tags.includes("promocoes"));
  const outOfStock = products.filter(isOutOfStock);

  return (
    <div className="py-8">
      <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Painel interno</p>
      <h1 className="mt-2 text-3xl uppercase md:text-4xl">Produtos, estoque e promoções</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Crie e edite produtos com imagens e variações, controle o estoque por SKU e agende descontos
        por período — refletindo em{" "}
        <Link to="/promocoes" className="text-primary">
          Promoções
        </Link>
        . As alterações são sincronizadas com o catálogo do Supabase e refletidas para todos os
        visitantes.
      </p>

      <Tabs defaultValue="produtos" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="produtos">Produtos ({products.length})</TabsTrigger>
          <TabsTrigger value="estoque">Estoque ({outOfStock.length} esgotados)</TabsTrigger>
          <TabsTrigger value="promocoes">Promoções ({promos.length})</TabsTrigger>
        </TabsList>

        {/* PRODUTOS */}
        <TabsContent value="produtos" className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="hero"
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo produto
            </Button>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, marca ou SKU"
              className="max-w-xs"
              maxLength={80}
            />
            <Button
              variant="surface"
              size="sm"
              onClick={() => {
                resetCatalog();
                toast.success("Catálogo restaurado ao padrão.");
              }}
            >
              <RotateCcw className="h-4 w-4" /> Restaurar catálogo
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Marca</th>
                  <th className="p-3">Preço</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3">Promoção</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <p className="font-display uppercase">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku}
                        {p.variants?.length ? ` · ${p.variants.length} variações` : ""}
                      </p>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.brand}</td>
                    <td className="p-3">{formatBRL(p.price)}</td>
                    <td className="p-3">
                      {!isOutOfStock(p) ? (
                        <span className="text-muted-foreground">{totalStock(p)}</span>
                      ) : (
                        <span className="rounded border border-destructive/50 px-2 py-1 text-xs uppercase text-destructive">
                          Esgotado
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {p.tags.includes("promocoes") ? (
                        <span className="rounded border border-primary/40 px-2 py-1 text-xs uppercase text-primary">
                          -{discountPercent(p)}%
                        </span>
                      ) : p.promotion ? (
                        <span className="text-xs text-muted-foreground">Agendada</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover ${p.name}`}
                        onClick={() => {
                          removeProduct(p.id);
                          toast.success(`${p.name} removido.`);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-primary" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="p-8 text-center text-muted-foreground">Nenhum produto encontrado.</p>
            )}
          </div>
        </TabsContent>

        {/* ESTOQUE */}
        <TabsContent value="estoque" className="mt-6 space-y-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar SKU"
            className="max-w-xs"
            maxLength={80}
          />
          {filtered.map((p) => (
            <StockRow key={p.id} product={p} />
          ))}
          {filtered.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">Nenhum SKU encontrado.</p>
          )}
        </TabsContent>

        {/* PROMOÇÕES */}
        <TabsContent value="promocoes" className="mt-6 space-y-3">
          {products.map((p) => (
            <PromoRow key={p.id} product={p} />
          ))}
        </TabsContent>
      </Tabs>

      <ProductFormDialog open={formOpen} product={editing} onOpenChange={setFormOpen} />
    </div>
  );
}

function StockRow({ product }: { product: Product }) {
  const total = totalStock(product);
  const soldOut = isOutOfStock(product);
  const hasVariants = !!product.variants?.length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display uppercase">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            SKU {product.sku} · {product.brand}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor={`sold-out-${product.id}`} className="text-xs uppercase">
            Marcar esgotado
          </Label>
          <Switch
            id={`sold-out-${product.id}`}
            checked={Boolean(product.soldOut)}
            onCheckedChange={(checked) => {
              updateProduct(product.id, { soldOut: checked });
              toast.success(
                checked ? `${product.name} marcado como esgotado.` : `${product.name} reativado.`,
              );
            }}
          />
          <span
            className={
              !soldOut
                ? "rounded border border-border px-2 py-1 text-xs uppercase text-muted-foreground"
                : "rounded border border-destructive/50 px-2 py-1 text-xs uppercase text-destructive"
            }
          >
            {soldOut ? "Esgotado" : `${total} disponíveis`}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        {hasVariants ? (
          product.variants!.map((v) => (
            <div key={v.id} className="space-y-1">
              <Label className="text-xs">
                {product.sku}-{v.size} · {v.color}
              </Label>
              <Input
                className="w-28"
                inputMode="numeric"
                maxLength={5}
                value={String(v.stock)}
                onChange={(e) => setVariantStock(product.id, v.id, Number(e.target.value))}
                aria-label={`Estoque ${product.sku} tamanho ${v.size}`}
              />
            </div>
          ))
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">Estoque {product.sku}</Label>
            <Input
              className="w-28"
              inputMode="numeric"
              maxLength={5}
              value={String(product.stock)}
              onChange={(e) => setStock(product.id, Number(e.target.value))}
              aria-label={`Estoque ${product.sku}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PromoRow({ product }: { product: Product }) {
  const promo = product.promotion;
  const active = isPromotionActive(promo);
  const [percent, setPercent] = useState(String(promo?.percent ?? 15));
  const [start, setStart] = useState(promo?.start ?? "");
  const [end, setEnd] = useState(promo?.end ?? "");

  function save() {
    const value = Number(percent);
    if (!Number.isFinite(value) || value < 1 || value > 90) {
      toast.error("Informe um desconto entre 1% e 90%.");
      return;
    }
    if (start && end && end < start) {
      toast.error("A data final deve ser posterior à inicial.");
      return;
    }
    schedulePromotion(product.id, {
      percent: value,
      start: start || undefined,
      end: end || undefined,
    });
    toast.success(
      isPromotionActive({ percent: value, start: start || undefined, end: end || undefined })
        ? `${product.name} está em promoção agora.`
        : `Promoção de ${product.name} agendada.`,
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display uppercase">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBRL(product.price)}
            {product.compareAt ? ` · de ${formatBRL(product.compareAt)}` : ""}
          </p>
        </div>
        <span
          className={
            active
              ? "rounded border border-primary/40 px-2 py-1 text-xs uppercase text-primary"
              : "rounded border border-border px-2 py-1 text-xs uppercase text-muted-foreground"
          }
        >
          {active ? "Ativa" : promo ? "Agendada / encerrada" : "Sem promoção"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Desconto (%)</Label>
          <Input
            className="w-24"
            inputMode="numeric"
            maxLength={2}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            aria-label={`Desconto de ${product.name}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Início</Label>
          <Input
            type="date"
            className="w-44"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label={`Início da promoção de ${product.name}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fim</Label>
          <Input
            type="date"
            className="w-44"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label={`Fim da promoção de ${product.name}`}
          />
        </div>
        <Button variant="hero" size="sm" onClick={save}>
          <CalendarClock className="h-4 w-4" /> Agendar
        </Button>
        {promo && (
          <Button
            variant="surface"
            size="sm"
            onClick={() => {
              schedulePromotion(product.id, null);
              setStart("");
              setEnd("");
              toast.success(`Promoção de ${product.name} removida.`);
            }}
          >
            Remover
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Sem datas o desconto vale imediatamente. Com datas, ele liga e desliga sozinho.
      </p>
    </div>
  );
}
