export function requireSupabaseEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada. Use as mesmas variáveis do Financeiro.`);
  return value;
}
