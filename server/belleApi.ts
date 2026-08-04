/**
 * Belle Software API Integration Layer
 * 
 * Respeita o rate limit de 40 requisições por minuto.
 * Base URL: https://app.bellesoftware.com.br/api/release/controller/IntegracaoExterna/v1.0
 * Autenticação: Header Authorization com token da unidade.
 */

import { ENV } from './_core/env';

const BELLE_BASE_URL = 'https://app.bellesoftware.com.br/api/release/controller/IntegracaoExterna/v1.0';

// Rate limiter: 40 req/min → ~1 req a cada 1.5s
const RATE_LIMIT_MS = 1500;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function belleRequest<T>(
  endpoint: string,
  token: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  await rateLimit();

  const url = new URL(`${BELLE_BASE_URL}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Belle API error ${response.status}: ${errorBody || response.statusText}`);
  }

  // Some endpoints return empty body (e.g. PUT cliente)
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function belleRequestWithBody<T>(
  endpoint: string,
  method: 'POST' | 'PUT',
  token: string,
  body: Record<string, unknown>,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  await rateLimit();

  const url = new URL(`${BELLE_BASE_URL}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Belle API error ${response.status}: ${errorBody || response.statusText}`);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ===== Types =====

export interface BelleCliente {
  codigo: number;
  nome: string;
  cpf: string;
  dtNascimento: string;
  celular: string;
  celular2: string;
  email: string;
  telefone: string;
  dtCadastro: string;
  sexo: string;
  profissao: string;
  UF: string;
  cidade: string;
  bairro: string;
  cep: string;
  rating: number;
  temperatura: string;
  endereco: string;
  numEndereco: string;
  tipoOrigem: string;
  origem: string;
  pontos: string | number;
  tags: { id: number; nome: string }[];
}

export interface BellePlanoCliente {
  codPlano: number;
  nome: string;
  label: string;
  servicos: {
    codServico: number;
    nome: string;
    saldoRestante: number;
  }[];
}

export interface BelleAgendamento {
  codigo: number;
  codCliente: number;
  nomeCliente: string;
  data: string;
  hora: string;
  servico: string;
  profissional: string;
  status: string;
  valor: number;
}

export interface BelleServico {
  codigo: number;
  nome: string;
  duracao: number;
  valor: number;
  descricao: string;
}

export interface BellePlano {
  codigo: number;
  nome: string;
  descricao: string;
  valor: number;
  servicos: { codServico: number; nome: string; qtdSessoes: number }[];
}

export interface BelleRelatorioVendas {
  totalVendas: number;
  valorTotal: number;
  vendas: {
    codigo: number;
    data: string;
    cliente: string;
    servico: string;
    valor: number;
    formaPagamento: string;
  }[];
}

export interface BelleRecebimento {
  codigo: number;
  data: string;
  descricao: string;
  valor: number;
  formaPagamento: string;
  status: string;
}

// ===== API Methods =====

export const belleApi = {
  // --- Clientes ---
  async listarClientes(token: string, codEstab: number, pagina: number = 0, filtros?: {
    dt_ultima_compra?: string;
    dt_ultima_presenca?: string;
    idade_minima?: number;
    idade_maxima?: number;
    sexo?: string;
    profissao?: string;
    dt_cadastro?: string;
    dt_alteracao?: string;
  }): Promise<BelleCliente[]> {
    return belleRequest<BelleCliente[]>('/clientes', token, {
      pagina,
      codEstab,
      ...filtros,
    });
  },

  async buscarCliente(token: string, codEstab: number, busca: {
    cpf?: string;
    id?: number;
    email?: string;
    celular?: string;
  }): Promise<BelleCliente> {
    return belleRequest<BelleCliente>('/cliente/buscar', token, {
      codEstab,
      ...busca,
    });
  },

  async planosCliente(token: string, codCliente: number, codEstab: number): Promise<BellePlanoCliente[]> {
    return belleRequest<BellePlanoCliente[]>('/cliente/planos', token, {
      codCliente,
      codEstab,
    });
  },

  async alterarCliente(token: string, codCliente: number, dados: Partial<{
    nome: string;
    cpf: string;
    dataNascimento: string;
    genero: string;
    celular: string;
    celular2: string;
    email: string;
    profissao: string;
    observacao: string;
    tipoOrigem: string;
    codOrigem: string;
    cep: string;
    classificacao: number;
    temperatura: string;
    rua: string;
    numeroRua: string;
    bairro: string;
    complemento: string;
    uf: string;
    cidade: string;
  }>): Promise<void> {
    await belleRequestWithBody('/cliente', 'PUT', token, dados, { codCliente });
  },

  async gravarLead(token: string, lead: {
    nome: string;
    codEstab: number;
    ddiCelular?: string;
    celular?: string;
    email?: string;
    cpf?: string;
    dataNascimento?: string;
    genero?: string;
    profissao?: string;
    observacao?: string;
    tipoOrigem?: string;
    codOrigem?: string;
  }): Promise<{ codigo: number }> {
    return belleRequestWithBody<{ codigo: number }>('/cliente/gravar-lead', 'POST', token, lead);
  },

  // --- Agenda ---
  async listarAgendamentos(token: string, codEstab: number, filtros?: {
    data_inicio?: string;
    data_fim?: string;
    codCliente?: number;
  }): Promise<BelleAgendamento[]> {
    return belleRequest<BelleAgendamento[]>('/agendamentos', token, {
      codEstab,
      ...filtros,
    });
  },

  // --- Serviços ---
  async listarServicos(token: string, codEstab: number): Promise<BelleServico[]> {
    return belleRequest<BelleServico[]>('/servicos', token, { codEstab });
  },

  // --- Planos ---
  async listarPlanos(token: string, codEstab: number): Promise<BellePlano[]> {
    return belleRequest<BellePlano[]>('/planos', token, { codEstab });
  },

  // --- Relatórios ---
  async relatorioVendas(token: string, codEstab: number, filtros?: {
    data_inicio?: string;
    data_fim?: string;
  }): Promise<BelleRelatorioVendas> {
    return belleRequest<BelleRelatorioVendas>('/relatorios/vendas', token, {
      codEstab,
      ...filtros,
    });
  },

  // --- Financeiro ---
  async listarRecebimentos(token: string, codEstab: number, filtros?: {
    data_inicio?: string;
    data_fim?: string;
  }): Promise<BelleRecebimento[]> {
    return belleRequest<BelleRecebimento[]>('/financeiro/recebimentos', token, {
      codEstab,
      ...filtros,
    });
  },
};
