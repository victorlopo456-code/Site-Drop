import { createFileRoute } from "@tanstack/react-router";
import {
  ContactDetails,
  InstitutionalPage,
  InstitutionalSection,
  useInstitutionalSettings,
} from "@/components/site/InstitutionalPage";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade e LGPD — DROP Skate Shop" },
      {
        name: "description",
        content: "Saiba como a DROP Skate Shop utiliza e protege seus dados pessoais.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const settings = useInstitutionalSettings();
  return (
    <InstitutionalPage
      title="Política de privacidade e LGPD"
      description="Este aviso explica, de forma clara, quais dados utilizamos, para quais finalidades e como você pode exercer seus direitos."
    >
      <InstitutionalSection title="1. Quem controla os dados">
        <p>
          A DROP Skate Shop, identificada por{" "}
          {settings.company_document || "seus dados cadastrais informados no rodapé"}, é responsável
          pelas decisões sobre o tratamento dos dados coletados nesta loja.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="2. Dados que utilizamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Dados de cadastro e contato, como nome, e-mail e telefone.</li>
          <li>CPF e endereço necessários ao pagamento, faturamento e entrega.</li>
          <li>Informações do pedido, produtos, valores e histórico de atendimento.</li>
          <li>
            E-mail e itens do carrinho, quando você solicitar lembrete de carrinho ou aviso de
            reposição de produto.
          </li>
          <li>
            Métricas de navegação, como páginas e produtos vistos, adição ao carrinho e origem da
            campanha. Essas métricas não armazenam nome, e-mail nem endereço IP.
          </li>
          <li>
            Dados técnicos de acesso e segurança, como endereço IP, dispositivo e registros de
            sessão, quando disponíveis.
          </li>
        </ul>
      </InstitutionalSection>
      <InstitutionalSection title="3. Finalidades e bases legais">
        <p>
          Usamos os dados para criar e proteger sua conta, processar compras e pagamentos, entregar
          pedidos, prestar suporte, prevenir fraude, cumprir obrigações legais e exercer direitos em
          processos. Lembretes de carrinho e avisos de reposição são enviados quando solicitados
          pelo cliente. Comunicações promocionais dependem da base legal aplicável e podem ser
          interrompidas a qualquer momento.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="4. Compartilhamento">
        <p>
          Podemos compartilhar apenas os dados necessários com Supabase (autenticação e banco),
          Mercado Pago (pagamento), Melhor Envio e transportadoras (cotação e entrega), hospedagem,
          autoridades e prestadores essenciais. Cada terceiro trata os dados conforme suas próprias
          obrigações legais e contratuais.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="5. Armazenamento e segurança">
        <p>
          Mantemos os dados pelo período necessário às finalidades informadas e aos prazos legais.
          Adotamos controles de acesso, autenticação e políticas de banco para reduzir acessos
          indevidos. Nenhum sistema é totalmente imune a incidentes; situações relevantes serão
          tratadas conforme a legislação.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="6. Seus direitos">
        <p>
          Você pode solicitar confirmação e acesso, correção, informações sobre compartilhamento,
          portabilidade quando aplicável, anonimização, bloqueio ou exclusão nos casos previstos,
          oposição, revogação de consentimento e revisão de decisões automatizadas. Algumas
          informações podem ser mantidas para cumprimento de obrigação legal.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="7. Cookies e sessão">
        <p>
          Utilizamos recursos estritamente necessários para login, carrinho, segurança e
          funcionamento da loja. As métricas próprias usam um identificador aleatório temporário da
          sessão para produzir relatórios agregados de visitas e conversões. Não utilizamos esse
          identificador para publicidade comportamental nem o compartilhamos com redes de anúncios.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="8. Contato do titular">
        <p>
          Solicite o exercício de direitos pelo e-mail abaixo. Poderemos pedir informações para
          confirmar sua identidade e proteger seus dados.
        </p>
        <ContactDetails settings={settings} />
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
