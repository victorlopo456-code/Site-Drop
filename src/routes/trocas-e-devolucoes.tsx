import { createFileRoute } from "@tanstack/react-router";
import {
  ContactDetails,
  InstitutionalPage,
  InstitutionalSection,
  useInstitutionalSettings,
} from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/trocas-e-devolucoes")({
  head: () => ({
    meta: [
      { title: "Trocas e Devoluções — DROP Skate Shop" },
      {
        name: "description",
        content: "Política de trocas, devoluções, arrependimento e produtos com defeito.",
      },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const settings = useInstitutionalSettings();
  return (
    <InstitutionalPage
      title="Trocas e devoluções"
      description="Confira os prazos e o procedimento para arrependimento, troca ou produto com defeito."
    >
      <InstitutionalSection title="Direito de arrependimento">
        <p>
          Em compras online, você pode desistir em até 7 dias corridos contados do recebimento.
          Comunique a decisão pelos canais abaixo. Após a devolução e conferência, os valores pagos
          serão restituídos pelo meio adequado, sem cobrança pelo exercício regular desse direito.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Condições para envio">
        <p>
          Envie o produto com acessórios e itens que o acompanharam. Sempre que possível, use a
          embalagem original e proteja o pacote. O uso necessário para avaliar o produto não elimina
          o direito de arrependimento; danos causados por uso inadequado serão analisados
          individualmente.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Produto com defeito">
        <p>
          Entre em contato informando o pedido, o problema e, se possível, fotos ou vídeo. A
          garantia legal e as alternativas de reparo, substituição, abatimento ou restituição serão
          observadas conforme o Código de Defesa do Consumidor.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Produto incorreto ou avariado no transporte">
        <p>
          Não utilize o item e fale conosco assim que identificar a divergência. Guarde a embalagem
          e registre imagens para agilizar a análise com a transportadora.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Como solicitar">
        <p>
          Informe número do pedido, nome, e-mail da compra, produto e motivo. Nunca envie um item
          sem receber as instruções de postagem.
        </p>
        <ContactDetails settings={settings} />
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
