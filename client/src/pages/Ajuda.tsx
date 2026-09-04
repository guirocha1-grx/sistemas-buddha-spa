import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import {
  BookOpenCheck, CalendarClock, CreditCard, HelpCircle, ListTodo,
  MessageCircle, ScrollText, Settings, Users,
} from "lucide-react";

type Topico = {
  id: string;
  icon: typeof HelpCircle;
  titulo: string;
  resumo: string;
  passos: string[];
};

const TOPICOS: Topico[] = [
  {
    id: "whatsapp",
    icon: MessageCircle,
    titulo: "WhatsApp (Inbox)",
    resumo: "É aqui que você conversa com os clientes pelo WhatsApp da unidade — a tela mais usada no dia a dia.",
    passos: [
      "Escolha a conversa na lista à esquerda. O campo de busca encontra por nome ou telefone, e os filtros Todos/Abertas/Encerradas ajudam a organizar.",
      "Digite a mensagem na caixa de baixo e envie (botão ou Enter). Dá pra anexar foto, áudio ou documento pelo clipe, e usar o emoji.",
      "Digite \"/\" ou toque no raio pra abrir um Script pronto (as mensagens da tela Scripts) sem precisar escrever tudo de novo.",
      "Quando a IA sugere uma resposta, ela já aparece na caixa de texto — revise, ajuste se precisar e envie.",
      "No painel da direita: \"Incluir atendimento\" cadastra o próximo agendamento do cliente. Se já existe um marcado, o menu \"Opções do agendamento\" deixa editar, incluir outro ou cancelar.",
      "No mesmo menu, \"Adicionar à lista de espera\" guarda o pedido do cliente pra um dia lotado, sem sair da conversa.",
      "\"Chamar terapeuta\" avisa a equipe que o cliente chegou pro atendimento.",
      "O ícone de etiqueta marca ou remove etiquetas do cliente direto da conversa.",
      "\"Cobrança via link\" gera um link de pagamento (Mercado Pago) pra mandar pro cliente.",
    ],
  },
  {
    id: "config-inbox",
    icon: Settings,
    titulo: "Config. Inbox",
    resumo: "Configurações que dão suporte ao WhatsApp: conexão do número, etiquetas e campos personalizados.",
    passos: [
      "Aba Conexão: mostra se o WhatsApp da unidade está conectado. Se não estiver, aparece um QR Code — escaneie com o celular vinculado pra reconectar.",
      "Aba Etiquetas: cria, renomeia e apaga as etiquetas disponíveis pra marcar clientes. A marcação em si (aplicar numa pessoa) é feita na tela Clientes ou no Inbox.",
      "Aba Campos personalizados: cria/renomeia/apaga campos numéricos usados por fluxos automáticos (ex.: contador de resposta de disparo). O valor de cada cliente é preenchido sozinho pelo sistema, não se digita aqui.",
    ],
  },
  {
    id: "clientes",
    icon: Users,
    titulo: "Clientes",
    resumo: "Cadastro e histórico de cada cliente — use pra consultar dados, etiquetas, planos e atendimentos anteriores.",
    passos: [
      "Busque por nome, celular, CPF ou nascimento no campo de busca.",
      "Clique numa linha pra abrir o cadastro completo: dados pessoais, etiquetas (adicionar/remover), terapeuta de preferência, últimos atendimentos e planos/sessões.",
      "Planos, sessões e atendimentos são só leitura — vêm direto do Belle, não dá pra editar por aqui.",
      "O ícone verde de WhatsApp na linha abre a conversa desse cliente direto no Inbox.",
    ],
  },
  {
    id: "scripts",
    icon: ScrollText,
    titulo: "Scripts",
    resumo: "Biblioteca de mensagens e fluxos prontos, pra agilizar o atendimento no WhatsApp.",
    passos: [
      "Busque por texto ou filtre por categoria (Boas-vindas, Confirmação, Preços etc.).",
      "Scripts do tipo Texto: toque em \"Copiar\" e cole na conversa.",
      "Scripts do tipo Fluxo: não se copiam — são disparados de dentro do Inbox, usando \"/\" ou o raio.",
    ],
  },
  {
    id: "tabela-precos",
    icon: BookOpenCheck,
    titulo: "Tabela de Preços",
    resumo: "Consulta rápida de preços e durações pra passar orçamento ao cliente.",
    passos: [
      "Filtre por categoria (Bem-Estar, Estética) ou busque pelo nome do serviço.",
      "A tabela mostra duração e os dois preços: Seg-Sáb e Domingo.",
      "A aba \"Campanha do Mês\" mostra a promoção vigente da unidade (o mesmo texto que os fluxos automáticos usam).",
    ],
  },
  {
    id: "proximos-atendimentos",
    icon: CalendarClock,
    titulo: "Próximos Atendimentos",
    resumo: "Lista dos atendimentos do dia (vindos do Belle), em ordem de horário — usada pra organizar e chamar os clientes.",
    passos: [
      "Cada linha mostra horário, cliente e serviço. Dá pra ajustar o terapeuta, marcar como preferencial e definir a sala.",
      "\"Chamar\" abre o aviso pra equipe — escolha Chamado agora ou Pré-chamado, confirme terapeuta, sala e horário, e envie.",
      "O ícone de WhatsApp na linha abre a conversa desse cliente no Inbox.",
      "A lixeira só tira o atendimento dessa lista operacional — não mexe no agendamento real do Belle.",
    ],
  },
  {
    id: "lista-espera",
    icon: ListTodo,
    titulo: "Lista de Espera",
    resumo: "Pra dias lotados: guarda o pedido de dia/horário/terapia do cliente sem comprometer a agenda, até abrir uma vaga.",
    passos: [
      "O pedido entra na fila pelo Inbox, na conversa com o cliente (\"Adicionar à lista de espera\").",
      "Quem tem plano ativo passa na frente (👑) — dentro desse grupo, vale a ordem de quem pediu primeiro.",
      "O botão verde de WhatsApp já abre a conversa com uma mensagem pronta avisando que a vaga abriu — só revisar e enviar.",
      "\"Transformar em agendamento\" quando o cliente confirmar o horário.",
      "O lápis edita o pedido (data, horário, terapia, observação); a lixeira remove da fila sem afetar nenhum agendamento.",
    ],
  },
  {
    id: "confirmacao-pagamento",
    icon: CreditCard,
    titulo: "Confirmação de Pagamento",
    resumo: "Consulta rápida pra checar, no balcão, se o Pix ou link de pagamento do cliente já caiu — só leitura, não altera nada.",
    passos: [
      "Dois painéis: Pix recebidos (Banco Inter) e Links de pagamento (Mercado Pago), sempre das últimas 48 horas.",
      "\"Sincronizar Pix\" / \"Sincronizar Links\" busca os pagamentos mais recentes.",
      "Use a busca (nome, CPF ou valor) pra achar o pagamento do cliente na hora.",
      "Não inclui vendas feitas na maquininha — só Pix e link de pagamento.",
    ],
  },
];

export default function Ajuda() {
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <HelpCircle className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-[0.16em]">Central de Ajuda</span>
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Como usar o sistema</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Um resumo prático de cada tela — toque num tópico pra abrir o passo a passo.</p>
      </header>

      <Card>
        <CardContent className="py-2">
          <Accordion type="single" collapsible defaultValue="whatsapp">
            {TOPICOS.map((topico) => (
              <AccordionItem key={topico.id} value={topico.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <topico.icon className="h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">{topico.titulo}</p>
                      <p className="text-xs font-normal text-muted-foreground">{topico.resumo}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ol className="ml-7 list-decimal space-y-2 text-sm leading-6 text-muted-foreground">
                    {topico.passos.map((passo, indice) => (
                      <li key={indice}>{passo}</li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
