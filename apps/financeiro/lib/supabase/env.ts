export function requireSupabaseEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} não configurada. Em desenvolvimento, execute \`npm run infra:start\` para gerar o .env.local.`,
    );
  }

  return value;
}
