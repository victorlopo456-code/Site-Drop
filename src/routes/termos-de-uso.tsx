import { createFileRoute, Link } from "@tanstack/react-router";
import {
  InstitutionalPage,
  InstitutionalSection,
  useInstitutionalSettings,
} from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/termos-de-uso")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — DROP Skate Shop" },
      { name: "description", content: "Condições de uso e compra na DROP Skate Shop." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const settings = useInstitutionalSettings();
  return (
    <InstitutionalPage
      title="Termos de uso e compra"
      description="Estas condições regulam o acesso ao site e as compras realizadas na DROP Skate Shop."
    >
      <InstitutionalSection title="1. Identificação">
        <p>
          Esta loja é operada pela DROP Skate Shop,{" "}
          {settings.company_document || "conforme identificação exibida no rodapé"}, com atendimento
          pelo e-mail {settings.email}.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="2. Cadastro e segurança">
        <p>
          O cliente deve fornecer dados verdadeiros, manter a senha protegida e comunicar uso
          indevido da conta. Compras podem ser submetidas a validações de segurança e
          disponibilidade.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="3. Produtos, preços e estoque">
        <p>
          Apresentamos características e preços dos produtos de forma clara. O pedido somente é
          confirmado após aprovação do pagamento e validação do estoque. Erros evidentes de
          informação serão comunicados ao cliente, garantindo as opções previstas na legislação.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="4. Pagamento">
        <p>
          O pagamento é processado pelo Mercado Pago. As formas disponíveis, análises, parcelamento
          e prazo de aprovação são informados no checkout e no ambiente do provedor.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="5. Entrega">
        <p>
          Preço e prazo são calculados pelo CEP e transportadora escolhida. O prazo começa conforme
          a aprovação do pagamento e pode ser afetado por eventos externos. Consulte a{" "}
          <Link to="/politica-de-entrega" className="text-primary">
            Política de entrega
          </Link>
          .
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="6. Cancelamentos, trocas e devoluções">
        <p>
          O direito de arrependimento e as hipóteses de defeito seguem o Código de Defesa do
          Consumidor. Veja os procedimentos na{" "}
          <Link to="/trocas-e-devolucoes" className="text-primary">
            Política de trocas e devoluções
          </Link>
          .
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="7. Uso permitido">
        <p>
          É proibido tentar violar a segurança, acessar áreas não autorizadas, copiar conteúdo em
          desacordo com a lei, usar automação abusiva ou praticar fraude. O acesso pode ser
          restringido para proteção dos clientes e da operação.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="8. Privacidade e legislação">
        <p>
          O tratamento de dados segue nossa{" "}
          <Link to="/politica-de-privacidade" className="text-primary">
            Política de privacidade
          </Link>
          . Aplicam-se as leis brasileiras, sem afastar o foro legalmente assegurado ao consumidor.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
