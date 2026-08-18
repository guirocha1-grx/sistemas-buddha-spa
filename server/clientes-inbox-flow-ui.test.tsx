/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  };
  const page = { location: "/clientes", setLocation: vi.fn(), openMutation: vi.fn() };
  const diagnosticos: any[] = [];
  const mutation = (options: any = {}) => ({ mutate: vi.fn(), isPending: false, ...options });
  const trpc = {
    useUtils: () => ({
      clientes: { resumoImportados: { invalidate: vi.fn() }, listImportados: { invalidate: vi.fn() } },
      inbox: {
        conversas: { list: { invalidate: vi.fn() }, get: { invalidate: vi.fn() } },
        mensagens: { list: { invalidate: vi.fn() } },
      },
      mensageria: { status: { invalidate: vi.fn() } },
    }),
    clientes: {
      resumoImportados: { useQuery: () => ({ data: { total: 1, ssu: 1, rbs: 0, ambas: 0 }, isLoading: false }) },
      listImportados: { useQuery: () => ({ data: [cliente], isLoading: false }) },
      importarXlsx: { useMutation: () => mutation() },
      reindexarTelefones: { useMutation: () => mutation() },
      resolverLids: { useMutation: () => mutation() },
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
        list: { useQuery: () => ({ data: [conversa], isLoading: false, refetch: vi.fn() }) },
        get: { useQuery: () => ({ data: conversa, isLoading: false }) },
        atualizarNome: { useMutation: () => mutation() },
        alterarStatus: { useMutation: () => mutation() },
        definirEtiquetas: { useMutation: () => mutation() },
        excluir: { useMutation: () => mutation() },
        criarClienteRapido: { useMutation: () => mutation() },
        vincularCliente: { useMutation: () => mutation() },
        membrosGrupo: { useQuery: () => ({ data: [], isLoading: false }) },
      },
      mensagens: {
        list: { useQuery: () => ({ data: [{ id: 1, direcao: "recebida", tipo: "texto", conteudo: "Olá", createdAt: new Date().toISOString() }], isLoading: false }) },
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
    mensageria: {
      status: { useQuery: () => ({ data: { enabled: true }, isLoading: false }) },
      setStatus: { useMutation: () => mutation() },
    },
    atendentes: {
      atual: { useQuery: () => ({ data: null, isLoading: false }) },
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
        aprovarEEnviar: { useMutation: () => mutation() },
        reprovar: { useMutation: () => mutation() },
      },
    },
  };
  return { cliente, conversa, page, diagnosticos, trpc };
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
  state.diagnosticos.splice(0);
  Element.prototype.scrollIntoView = vi.fn();
});

describe("fluxo completo Clientes → Inbox", () => {
  it("renderiza Clientes, clica no ícone e navega para a conversa localizada", async () => {
    render(<Clientes />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir WhatsApp de Cliente Existente" }));

    expect(state.page.openMutation).toHaveBeenCalledWith({ clienteId: 10, unidadeId: 1 });
    expect(state.page.setLocation).toHaveBeenCalledWith("/mensagens?conversaId=41");
  });

  it("renderiza Mensagens com conversaId e seleciona a conversa correta", async () => {
    state.page.location = "/mensagens?conversaId=41";
    render(<Mensagens />);

    await waitFor(() => {
      expect(screen.getAllByText("Cliente Existente").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Olá").length).toBeGreaterThan(0);
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
    state.diagnosticos.push({
      id: 91,
      createdAt: new Date().toISOString(),
      status: "concluida",
      classificacao: "diana",
      confianca: 98,
      receptor: { nome: "Aurea" },
      especialista: { nome: "Diana" },
      rastro: null,
      erro: null,
      sugestao: {
        id: 44,
        texto: "Posso preparar as opções de voucher para você.",
        avaliacao: "pendente",
        enviadaEm: null,
        acaoPendente: null,
      },
    });

    render(<Mensagens />);

    fireEvent.click(await screen.findByRole("button", { name: /Revisar no rascunho/i }));
    const compositor = screen.getAllByPlaceholderText("Digite uma mensagem, / para scripts ou cole um print...").at(-1) as HTMLTextAreaElement;
    expect(compositor.value).toBe("Posso preparar as opções de voucher para você.");
    expect(screen.getByText("Sugestão de Diana em revisão")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Aceitar como está e enviar/i })).toBeTruthy();

    fireEvent.change(compositor, { target: { value: "Posso preparar um voucher virtual para você." } });
    expect(screen.getByRole("button", { name: /Enviar edição/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Rejeitar$/i }));
    expect(screen.getByText("Rejeitar sugestão do agente")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Confirmar rejeição/i }) as HTMLButtonElement).disabled).toBe(true);
  });

});
