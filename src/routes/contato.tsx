import { createFileRoute } from "@tanstack/react-router";
import {
  ContactDetails,
  InstitutionalPage,
  InstitutionalSection,
  useInstitutionalSettings,
} from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — DROP Skate Shop" },
      { name: "description", content: "Canais de atendimento da DROP Skate Shop." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const settings = useInstitutionalSettings();
  return (
    <InstitutionalPage
      title="Fale conosco"
      description="Dúvidas sobre produtos, pedidos, pagamento, entrega ou privacidade? Use nossos canais oficiais."
    >
      <ContactDetails settings={settings} />
      <InstitutionalSection title="Para agilizar o atendimento">
        <p>
          Em assuntos relacionados a uma compra, informe o número do pedido e o e-mail utilizado.
          Nunca envie senha, código de autenticação ou dados completos do cartão.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Identificação da loja">
        <p>{settings.company_document || "Documento empresarial disponível no rodapé."}</p>
        <p>{settings.address}</p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
