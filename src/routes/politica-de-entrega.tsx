import { createFileRoute } from "@tanstack/react-router";
import { InstitutionalPage, InstitutionalSection } from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/politica-de-entrega")({
  head: () => ({
    meta: [
      { title: "Política de Entrega — DROP Skate Shop" },
      { name: "description", content: "Cálculo, prazos, rastreamento e orientações de entrega." },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  return (
    <InstitutionalPage
      title="Política de entrega"
      description="Entenda como calculamos o frete, o início do prazo e o acompanhamento do pedido."
    >
      <InstitutionalSection title="Cálculo do frete">
        <p>
          As opções disponíveis são calculadas no checkout a partir do CEP, peso, dimensões e itens
          do carrinho. O valor e o prazo exibidos para a opção escolhida passam a integrar o pedido.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Início e contagem do prazo">
        <p>
          O prazo informado é estimado em dias úteis e começa após a aprovação do pagamento e o
          processamento do pedido. Finais de semana, feriados, áreas com restrição, eventos
          climáticos e situações operacionais podem alterar a previsão.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Endereço e recebimento">
        <p>
          Revise o endereço antes do pagamento e garanta que haja alguém autorizado para receber.
          Custos decorrentes de endereço incorreto, incompleto ou nova postagem serão tratados
          conforme a causa e a legislação aplicável.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Rastreamento">
        <p>
          Quando disponibilizado pela transportadora, o código de rastreio aparecerá em “Minha conta
          → Meus pedidos”. A atualização inicial pode levar algum tempo após a postagem.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Atraso, extravio ou avaria">
        <p>
          Se a entrega ultrapassar a previsão ou apresentar problema, entre em contato para abertura
          de verificação com a transportadora. Os direitos do consumidor permanecem preservados.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
