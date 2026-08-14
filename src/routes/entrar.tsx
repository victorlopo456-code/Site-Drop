import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import logo from "@/assets/logo-drop.png";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — DROP Skate Shop" },
      {
        name: "description",
        content:
          "Acesse sua conta DROP Skate Shop para acompanhar pedidos, favoritos, cupons e endereços.",
      },
      { property: "og:title", content: "Entrar ou criar conta — DROP Skate Shop" },
      { property: "og:description", content: "Área do cliente da DROP Skate Shop." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passSchema = z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72);

function SocialButtons() {
  const providers = [
    { label: "Google", provider: "google" as const },
    { label: "Facebook", provider: "facebook" as const },
    { label: "Apple", provider: "apple" as const },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {providers.map(({ label, provider }) => (
        <Button
          key={provider}
          variant="surface"
          disabled={!isSupabaseConfigured()}
          onClick={async () => {
            const supabase = getSupabaseBrowserClient();
            if (!supabase) return toast.error("Configure o Supabase primeiro.");
            const { error } = await supabase.auth.signInWithOAuth({
              provider,
              options: { redirectTo: window.location.origin },
            });
            if (error) toast.error(error.message);
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (mode: "login" | "signup" | "reset") => {
    const emailCheck = emailSchema.safeParse(email);
    if (!emailCheck.success) return toast.error(emailCheck.error.issues[0].message);
    if (mode !== "reset") {
      const passCheck = passSchema.safeParse(password);
      if (!passCheck.success) return toast.error(passCheck.error.issues[0].message);
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return toast.error("Configure as variáveis do Supabase em .env.local.");

    setLoading(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(emailCheck.data, {
          redirectTo: `${window.location.origin}/entrar`,
        });
        if (error) throw error;
        toast.success("Se o e-mail existir, enviaremos o link de recuperação.");
        return;
      }

      if (mode === "signup") {
        if (name.trim().length < 3) return toast.error("Informe seu nome completo.");
        const { error } = await supabase.auth.signUp({
          email: emailCheck.data,
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) throw error;
        toast.success("Cadastro realizado. Verifique seu e-mail para confirmar a conta.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailCheck.data,
        password,
      });
      if (error) throw error;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      toast.success("Bem-vindo de volta!");
      await navigate({ to: profile?.role === "admin" ? "/admin" : "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na autenticação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-drop flex justify-center py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-card">
        <Link
          to="/"
          aria-label="DROP Skate Shop — ir para a página inicial"
          className="mx-auto block w-fit"
        >
          <img
            src={logo}
            alt="DROP Skate Shop"
            width={1280}
            height={1280}
            className="h-28 w-28 object-contain"
          />
        </Link>
        <h1 className="mt-6 text-center text-2xl uppercase">Área do cliente</h1>

        {!isSupabaseConfigured() && (
          <p className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-center text-sm text-muted-foreground">
            Supabase ainda não configurado. Preencha o arquivo <code>.env.local</code> para ativar a
            autenticação.
          </p>
        )}

        <Tabs defaultValue="login" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            <TabsTrigger value="reset">Recuperar</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">Senha</Label>
              <Input
                id="pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={72}
              />
            </div>
            <Button
              variant="hero"
              className="w-full"
              disabled={loading}
              onClick={() => void submit("login")}
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <Separator />
            <SocialButtons />
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email2">E-mail</Label>
              <Input
                id="email2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass2">Senha</Label>
              <Input
                id="pass2"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={72}
              />
            </div>
            <Button
              variant="hero"
              className="w-full"
              disabled={loading}
              onClick={() => void submit("signup")}
            >
              Criar conta
            </Button>
            <Separator />
            <SocialButtons />
          </TabsContent>

          <TabsContent value="reset" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
            </p>
            <div className="space-y-2">
              <Label htmlFor="email3">E-mail</Label>
              <Input
                id="email3"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
            </div>
            <Button
              variant="hero"
              className="w-full"
              disabled={loading}
              onClick={() => void submit("reset")}
            >
              Enviar link
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
