import { createFileRoute } from "@tanstack/react-router";
import {
  InstitutionalPage,
  InstitutionalSection,
  useInstitutionalSettings,
} from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre a DROP Skate Shop" },
      {
        name: "description",
        content: "Conheça a DROP Skate Shop e nossa curadoria de skate e streetwear.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const settings = useInstitutionalSettings();
  return (
    <InstitutionalPage title="Sobre a DROP" description={settings.store_description}>
      <InstitutionalSection title="Nossa loja">
        <p>
          A DROP Skate Shop reúne skate, streetwear e acessórios em um catálogo pensado para quem
          vive a cultura urbana. Nosso compromisso é oferecer informações claras, atendimento
          acessível e uma compra segura.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Curadoria">
        <p>
          Selecionamos produtos e marcas considerando qualidade, aplicação e estilo. As
          características, variações e disponibilidade são apresentadas em cada página de produto.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Identificação">
        <p>{settings.company_document || "Dados empresariais disponíveis no rodapé."}</p>
        <p>{settings.address}</p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
