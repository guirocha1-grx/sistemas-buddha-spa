/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const cliente = {
    id: 10,
    nome: "Cliente Existente",
    celular: "(16) 97400-7994",
    celular2: null,
    telefone: null,
    email: "cliente@example.com",
    cpf: "123.456.789-00",
    dataNascimento: null,
    clienteSsu: true,
    clienteRbs: false,
    qtdAtendimentosFinalizados: 1,
    qtdServicosFinalizados: 1,
    ultimoAtendimento: null,
    ultimoContato: new Date("2026-08-26T14:30:00.000Z"),
    dataCadastro: null,
    primeiroAtendimento: null,
    belleId: 10,
    rg: null,
    sexo: null,
    endereco: null,
    bairro: null,
    cidade: null,
    uf: null,
  };
  const clienteMaisRecente = {
    ...cliente,
    id: 12,
    nome: "Contato Recente",
    celular: "(16) 98888-8888",
    ultimoContato: new Date("2026-08-27T17:45:00.000Z"),
  };
  const conversa = {
    id: 41,
    clienteNome: "Cliente Existente",
    nomeContato: "Cliente Existente",
    telefone: "5516974007994",
    status: "aberta",
    naoLidas: 0,
    ultimaMensagemTexto: "Olá",
    ultimaMensagemEm: new Date().toISOString(),
    fotoUrl: null as string | null,
    isGrupo: "false",
    isLidPendente: "false",
    etiquetas: null,
    resumoConversa: null,
    automacaoAgentesEfetiva: "ativa",
    automacaoAgentesBloqueadaAte: null,
    clienteId: 10,
    unidadeId: 1,
    clienteQtdServicos: 1,
    clienteUltimoAtendimento: "2026-08-10",
    resumoRelacionamento: {
      plano: {
        status: "ativo",
        sessoesDisponiveis: 7,
        validade: "2026-09-30",
        detalhes: [{
          planoBelleId: 1901,
          status: "ativo",
          validade: "2026-09-30",
          dataVenda: "2026-07-15",
          tipo: "Plano de massagens",
          campanha: null,
          vendedorNome: "Consultora Teste",
          servicos: [{ nome: "Massagem Relaxante", sessoes: 10, restantes: 4, utilizadas: 4, agendados: 2 }],
        }],
      },
      ultimoAtendimento: {
        dataAtendimento: "2026-08-10",
        horario: "14:00",
        servicoNome: "Massagem Relaxante",
        profissionalNome: "Terapeuta Teste",
      },
      proximoAtendimento: undefined as any,
    },
  };
  const conversaAlternativa = {
    ...conversa,
    id: 42,
    clienteNome: "Outro Cliente",
    nomeContato: "Outro Cliente",
    telefone: "5516999999999",
    ultimaMensagemTexto: "Até logo",
  };
  const conversas = [conversa, conversaAlternativa];
  const page = { location: "/clientes", setLocation: vi.fn(), openMutation: vi.fn() };
  const diagnosticos: any[] = [];
  const revisaoAgente = { pendente: null as any, aprovarMutation: vi.fn(), liberarMutation: vi.fn(), automacaoMutation: vi.fn() };
  const mutation = (options: any = {}) => ({ mutate: vi.fn(), isPending: false, ...options });
  const trpc = {
    useUtils: () => ({
      clientes: { resumoImportados: { invalidate: vi.fn() }, listImportados: { invalidate: vi.fn() } },
      inbox: {
        conversas: { list: { invalidate: vi.fn() }, get: { invalidate: vi.fn() } },
        mensagens: { list: { invalidate: vi.fn() }, listPaginada: { invalidate: vi.fn() } },
      },
      agentes: {
        diagnostico: { conversa: { invalidate: vi.fn() } },
        fila: { pendenteConversa: { invalidate: vi.fn() } },
      },
      cobrancasLink: {
        aberta: { invalidate: vi.fn() },
        modelos: { list: { invalidate: vi.fn() } },
      },
      mensageria: { status: { invalidate: vi.fn() } },
    }),
    clientes: {
      resumoImportados: { useQuery: () => ({ data: { total: 1, ssu: 1, rbs: 0, ambas: 0 }, isLoading: false }) },
      listImportados: { useQuery: () => ({ data: [cliente, clienteMaisRecente], isLoading: false }) },
      importarXlsx: { useMutation: () => mutation() },
      importarAtendimentosXlsx: { useMutation: () => mutation() },
      importarPlanosXls: { useMutation: () => mutation() },
      reindexarTelefones: { useMutation: () => mutation() },
      resolverLids: { useMutation: () => mutation() },
      historicoAtendimentosBelle: { useQuery: () => ({ data: [], isLoading: false }) },
      planosBelle: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    inbox: {
      conversas: {
        abrirPorCliente: {
          useMutation: (options: any) => ({
            mutate: (input: { clienteId: number; unidadeId: number }) => {
              page.openMutation(input);
              options.onSuccess?.({ conversaId: input.clienteId === 10 ? 41 : 42 });
            },
            isPending: false,
          }),
        },
        list: { useQuery: () => ({ data: conversas, isLoading: false, refetch: vi.fn() }) },
        get: { useQuery: (input: { id: number }) => ({ data: input.id === 42 ? conversaAlternativa : conversa, isLoading: false }) },
        atualizarNome: { useMutation: () => mutation() },
        alterarStatus: { useMutation: () => mutation() },
        cancelarProximoAtendimento: { useMutation: () => mutation() },
        editarProximoAtendimento: { useMutation: () => mutation() },
        criarProximoAtendimento: { useMutation: () => mutation() },
        sugerirProximoAtendimento: { useMutation: () => mutation() },
        definirAutomacaoAgentes: { useMutation: (options: any) => ({
          mutate: (input: any) => {
            revisaoAgente.automacaoMutation(input);
            options.onSuccess?.();
          },
          isPending: false,
        }) },
        definirEtiquetas: { useMutation: () => mutation() },
        excluir: { useMutation: () => mutation() },
        criarClienteRapido: { useMutation: () => mutation() },
        vincularCliente: { useMutation: () => mutation() },
        membrosGrupo: { useQuery: () => ({ data: [], isLoading: false }) },
      },
      mensagens: {
        list: { useQuery: (input: { antesDe?: string }) => ({
          data: input.antesDe ? [] : [{ id: 1, direcao: "recebida", tipo: "texto", conteudo: "Olá", createdAt: new Date().toISOString() }],
          isLoading: false,
          isFetching: false,
        }) },
        listPaginada: { useQuery: (input: { antesDe?: string }) => ({
          data: {
            mensagens: input.antesDe ? [] : [{ id: 1, direcao: "recebida", tipo: "texto", conteudo: "Olá", createdAt: new Date().toISOString() }],
            hasMore: false,
            cursorConsultado: input.antesDe ?? null,
          },
          isLoading: false,
          isFetching: false,
        }) },
        enviar: { useMutation: () => mutation() },
        sugerir: { useMutation: (options: any) => ({
          mutate: () => options.onSuccess?.({ sugestao: "Olá! Será um prazer ajudar você. Como posso seguir?" }),
          isPending: false,
        }) },
        enviarMidia: { useMutation: () => mutation() },
        reagir: { useMutation: () => mutation() },
      },
      unificarConversas: { useMutation: () => mutation() },
      iniciarConversaComCliente: { useMutation: () => mutation() },
    },
    scripts: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      listCategorias: { useQuery: () => ({ data: [], isLoading: false }) },
      listRecentes: { useQuery: () => ({ data: [], isLoading: false }) },
      registrarUso: { useMutation: () => mutation() },
    },
    tabelaPrecos: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      campanhaMes: { useQuery: () => ({ data: { conteudo: "" }, isLoading: false }) },
    },
    mensageria: {
      status: { useQuery: () => ({ data: { enabled: true }, isLoading: false }) },
      setStatus: { useMutation: () => mutation() },
    },
    atendentes: {
      atual: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    chamados: {
      opcoes: { useQuery: () => ({ data: { parametros: [], terapeutas: [], preferencias: [] }, isLoading: false, refetch: vi.fn() }) },
      enviarTeste: { useMutation: () => mutation() },
      adicionarPreferenciaCliente: { useMutation: () => mutation() },
      removerPreferenciaCliente: { useMutation: () => mutation() },
    },
    servicos: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    cobrancasLink: {
      configuracao: { useQuery: () => ({ data: { mercadoPagoConfigurado: true, webhookConfigurado: true }, isLoading: false }) },
      aberta: { useQuery: () => ({ data: null, isLoading: false }) },
      modelos: {
        list: { useQuery: () => ({ data: [], isLoading: false }) },
      },
      extrairDaConversa: { useMutation: () => mutation() },
      criarEEnviar: { useMutation: () => mutation() },
      cancelar: { useMutation: () => mutation() },
    },
    fluxos: {
      iniciarVisivel: { useMutation: () => mutation() },
      get: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
    agentes: {
      diagnostico: {
        conversa: { useQuery: () => ({ data: diagnosticos, isLoading: false }) },
      },
      fila: {
        pendenteConversa: { useQuery: (input: { conversaId: number }) => ({ data: revisaoAgente.pendente?.conversaId === input.conversaId ? revisaoAgente.pendente : undefined, isLoading: false }) },
        aprovarEEnviar: { useMutation: (options: any) => ({
          mutate: (input: any) => {
            revisaoAgente.aprovarMutation(input);
            options.onSuccess?.();
          },
          isPending: false,
        }) },
        liberarParaEdicao: { useMutation: (options: any) => ({
          mutate: (input: any) => {
            revisaoAgente.liberarMutation(input);
            options.onSuccess?.();
          },
          isPending: false,
        }) },
        reprovar: { useMutation: () => mutation() },
      },
    },
  };
  return { cliente, conversa, conversaAlternativa, page, diagnosticos, revisaoAgente, trpc };
});

vi.mock("@/lib/trpc", () => ({ trpc: state.trpc }));
vi.mock("@/contexts/UnidadeContext", () => ({
  useUnidade: () => ({ unidadeSelecionada: { id: 1, slug: "ssu", nome: "Shopping Santa Úrsula" } }),
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", name: "Teste" } }) }));
vi.mock("@/components/UnidadeSelector", () => ({ default: () => <div data-testid="unidade-selector" /> }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// wouter de verdade separa pathname (useLocation) de query string
// (useSearch) — mockar os dois só com useLocation retornando o path
// inteiro (como estava antes) escondia o bug real corrigido em
// 2026-08-17: Mensagens.tsx tentava ler ?conversaId= via
// location.split("?"), que nunca funciona com o useLocation() real.
vi.mock("wouter", () => ({
  useLocation: () => [state.page.location.split("?")[0], state.page.setLocation],
  useSearch: () => state.page.location.split("?")[1] ?? "",
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  AvatarImage: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
  AvatarFallback: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

import Clientes from "@/pages/Clientes";
import Mensagens from "@/pages/Mensagens";

beforeEach(() => {
  state.page.location = "/clientes";
  state.page.setLocation.mockReset();
  state.page.openMutation.mockReset();
  state.conversa.clienteNome = "Cliente Existente";
  state.conversa.nomeContato = "Cliente Existente";
  state.conversa.fotoUrl = null;
  state.conversa.isGrupo = "false";
  state.conversa.resumoRelacionamento.proximoAtendimento = undefined;
  state.diagnosticos.splice(0);
  state.revisaoAgente.pendente = null;
  state.revisaoAgente.aprovarMutation.mockReset();
  state.revisaoAgente.liberarMutation.mockReset();
  state.revisaoAgente.automacaoMutation.mockReset();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("fluxo completo Clientes → Inbox", () => {
  it("renderiza Clientes, clica no ícone e navega para a conversa localizada", async () => {
    render(<Clientes />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir WhatsApp de Cliente Existente" }));

    expect(state.page.openMutation).toHaveBeenCalledWith({ clienteId: 10, unidadeId: 1 });
    expect(state.page.setLocation).toHaveBeenCalledWith("/mensagens?conversaId=41");
  });

  it("exibe e ordena Último contato, mantendo clientes sem contato no fim", async () => {
    render(<Clientes />);

    expect((await screen.findAllByText("27/08/2026, 14:45")).length).toBeGreaterThan(0);
    const cabecalho = screen.getAllByText("Último contato")[0].closest("th")!;

    fireEvent.click(cabecalho);
    let linhas = screen.getAllByRole("row").slice(1);
    expect(linhas[0].textContent).toContain("Cliente Existente");

    fireEvent.click(cabecalho);
    linhas = screen.getAllByRole("row").slice(1);
    expect(linhas[0].textContent).toContain("Contato Recente");
  });

  it("renderiza Mensagens com conversaId e seleciona a conversa correta", async () => {
    state.page.location = "/mensagens?conversaId=41";
    render(<Mensagens />);

    await waitFor(() => {
      expect(screen.getAllByText("Cliente Existente").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Olá").length).toBeGreaterThan(0);
  });

  it("rola até o fim quando a página recente da conversa é carregada", async () => {
    state.page.location = "/mensagens?conversaId=41";
    render(<Mensagens />);

    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("exibe a imagem persistida quando a conversa selecionada é um grupo", async () => {
    state.page.location = "/mensagens?conversaId=41";
    state.conversa.clienteNome = null as any;
    state.conversa.nomeContato = "Grupo Recepção";
    state.conversa.isGrupo = "true";
    state.conversa.fotoUrl = "/manus-storage/inbox-fotos-perfil/grupo.jpg";
    render(<Mensagens />);

    await waitFor(() => {
      const imagens = screen.getAllByAltText("Grupo Recepção");
      expect(imagens.some((imagem) => imagem.getAttribute("src") === "/manus-storage/inbox-fotos-perfil/grupo.jpg")).toBe(true);
    });
  });

  it("leva uma sugestão pendente do agente para o rascunho editável do Inbox", async () => {
    state.page.location = "/mensagens?conversaId=41";
    state.revisaoAgente.pendente = {
      id: 44,
      conversaId: 41,
      texto: "Posso preparar as opções de voucher para você.",
      agenteNome: "Diana",
      acaoPendente: "script_fluxo:210001",
      fluxoPendenteNome: "Enviar informações sobre vouchers",
      createdAt: new Date().toISOString(),
    };

    render(<Mensagens />);

    const compositor = screen.getAllByPlaceholderText("Digite uma mensagem, / para scripts ou cole um print...").at(-1) as HTMLTextAreaElement;
    await waitFor(() => expect(compositor.value).toBe("Posso preparar as opções de voucher para você."));
    expect(screen.getByText("Sugestão em revisão")).toBeTruthy();
    expect(screen.queryByText(/Sugestão de Diana em revisão/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Aceitar como está e enviar/i })).toBeTruthy();
    expect(screen.getByText(/Texto abaixo \+ Fluxo/i)).toBeTruthy();
    expect(screen.getByText(/Enviar informações sobre vouchers/i)).toBeTruthy();
    expect(screen.getByText(/mensagem e o fluxo serão enviados/i)).toBeTruthy();

    fireEvent.change(compositor, { target: { value: "Posso preparar um voucher virtual para você." } });
    expect(screen.getByRole("button", { name: /Enviar edição/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Rejeitar$/i }));
    expect(screen.getByText("Rejeitar sugestão do agente")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Confirmar rejeição/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("permite bloquear a automação da conversa por duas horas ou permanentemente", async () => {
    state.page.location = "/mensagens?conversaId=41";
    render(<Mensagens />);

    const botaoAutomacao = await screen.findByRole("button", { name: "Configurar automação da conversa" });
    expect(botaoAutomacao.getAttribute("title")).toContain("Automação ativa");
    fireEvent.click(botaoAutomacao);
    const botaoDuasHoras = await screen.findByRole("button", { name: "2 horas" });
    expect(botaoDuasHoras.getAttribute("title")).toContain("2 horas");
    fireEvent.click(botaoDuasHoras);
    expect(state.revisaoAgente.automacaoMutation).toHaveBeenCalledWith({ id: 41, modo: "bloqueada_temporariamente" });

    fireEvent.click(screen.getByRole("button", { name: "Permanente" }));
    expect(state.revisaoAgente.automacaoMutation).toHaveBeenCalledWith({ id: 41, modo: "bloqueada_permanentemente" });
    expect(screen.getByRole("button", { name: "Ativa" }).getAttribute("title")).toContain("Ativa");
  });

  it("exibe data, terapia e terapeuta no último atendimento abaixo do relacionamento", async () => {
    state.page.location = "/mensagens?conversaId=41";
    cleanup();
    render(<Mensagens />);

    expect(await screen.findByText("Último atendimento")).toBeTruthy();
    expect(screen.getByText(/10\/08\/2026 · Massagem Relaxante/i)).toBeTruthy();
    expect(screen.getByText("Terapeuta: Terapeuta Teste")).toBeTruthy();
  });

  it("exibe ações compactas de IA e inclusão no próximo atendimento", async () => {
    state.page.location = "/mensagens?conversaId=41";
    state.conversa.resumoRelacionamento.proximoAtendimento = {
      id: 901,
      dataAtendimento: "2026-08-27",
      horario: "16:30",
      servicoNome: "Reflexologia 45",
      profissionalNome: null,
      status: "Confirmado",
    };
    cleanup();
    render(<Mensagens />);

    const botaoIa = await screen.findByRole("button", { name: "Atualizar de acordo com conversa (IA)" });
    expect(botaoIa.getAttribute("title")).toBe("Atualizar de acordo com conversa (IA)");
    expect(screen.getByRole("button", { name: "Incluir próximo atendimento" }).getAttribute("title")).toBe("Incluir próximo atendimento");

    fireEvent.click(screen.getByRole("button", { name: "Incluir próximo atendimento" }));
    expect(await screen.findByRole("button", { name: "Incluir" })).toBeTruthy();
  });

  it("abre o detalhamento do plano com terapias, sessões e utilização ao passar o mouse", async () => {
    state.page.location = "/mensagens?conversaId=41";
    cleanup();
    render(<Mensagens />);

    const cartaoPlano = await screen.findByLabelText("Detalhes do plano");
    fireEvent.pointerEnter(cartaoPlano);
    expect(await screen.findByText("Detalhes do plano")).toBeTruthy();
    expect(screen.getByText("Massagem Relaxante")).toBeTruthy();
    expect(screen.getByText("4 restantes · 4 utilizadas · 2 agendada(s)")).toBeTruthy();
    expect(screen.getByText("Total contratado: 10")).toBeTruthy();
  });

  it("resolve a sugestão como editada quando a recepção envia pelo botão principal", async () => {
    state.page.location = "/mensagens?conversaId=41";
    state.revisaoAgente.pendente = {
      id: 46,
      conversaId: 41,
      texto: "Posso explicar as opções de Day Spa para você.",
      agenteNome: "Fabricia",
      createdAt: new Date().toISOString(),
    };
    const tela = render(<Mensagens />);
    const inbox = within(tela.container);

    const compositor = inbox.getAllByPlaceholderText("Digite uma mensagem, / para scripts ou cole um print...").at(-1) as HTMLTextAreaElement;
    await waitFor(() => expect(compositor.value).toBe("Posso explicar as opções de Day Spa para você."));
    fireEvent.change(compositor, { target: { value: "Temos Mini Day Spa e Day Spa Home Vitalidade." } });
    fireEvent.click(inbox.getByTitle("Enviar mensagem"));

    expect(state.revisaoAgente.aprovarMutation).toHaveBeenCalledWith(expect.objectContaining({
      sugestaoId: 46,
      textoFinal: "Temos Mini Day Spa e Day Spa Home Vitalidade.",
      tipoRevisao: "editada",
    }));
  });

  it("libera o texto para edição e encerra a avaliação sem enviar", async () => {
    state.page.location = "/mensagens?conversaId=41";
    state.revisaoAgente.pendente = {
      id: 47,
      conversaId: 41,
      texto: "Posso explicar as opções de Day Spa para você.",
      agenteNome: "Fabricia",
      createdAt: new Date().toISOString(),
    };
    const tela = render(<Mensagens />);
    const inbox = within(tela.container);
    const compositor = inbox.getAllByPlaceholderText("Digite uma mensagem, / para scripts ou cole um print...").at(-1) as HTMLTextAreaElement;
    await waitFor(() => expect(compositor.value).toBe("Posso explicar as opções de Day Spa para você."));

    fireEvent.click(inbox.getByRole("button", { name: /^Editar$/i }));

    expect(state.revisaoAgente.liberarMutation).toHaveBeenCalledWith(expect.objectContaining({ sugestaoId: 47 }));
    await waitFor(() => expect(inbox.queryByText("Sugestão em revisão")).toBeNull());
    expect(compositor.value).toBe("Posso explicar as opções de Day Spa para você.");
    expect(state.revisaoAgente.aprovarMutation).not.toHaveBeenCalled();
  });

  it("mantém o rascunho na conversa de origem ao alternar entre clientes", async () => {
    state.page.location = "/mensagens?conversaId=41";
    state.revisaoAgente.pendente = {
      id: 45,
      conversaId: 41,
      texto: "Posso explicar as opções de Day Spa para você.",
      agenteNome: "Fabricia",
      createdAt: new Date().toISOString(),
    };

    const tela = render(<Mensagens />);
    const inbox = within(tela.container);
    const compositor = inbox.getAllByPlaceholderText("Digite uma mensagem, / para scripts ou cole um print...").at(-1) as HTMLTextAreaElement;
    await waitFor(() => expect(compositor.value).toBe("Posso explicar as opções de Day Spa para você."));

    fireEvent.click(inbox.getByRole("button", { name: /Outro Cliente/i }));
    await waitFor(() => expect(compositor.value).toBe(""));
    await waitFor(() => expect(inbox.queryByText("Sugestão em revisão")).toBeNull());

    fireEvent.click(inbox.getByRole("button", { name: /Cliente Existente/i }));
    await waitFor(() => expect(compositor.value).toBe("Posso explicar as opções de Day Spa para você."));
  });

});
