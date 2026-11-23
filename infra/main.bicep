// Infraestrutura do Gestão no Azure (plano: .azure/deployment-plan.md, seção 5). Usado pelo azd (azure.yaml).
// Escopo de assinatura: cria o grupo de recursos e chama resources.bicep. Nada aqui é aplicado sem
// `azd provision --preview` revisado e aprovado (etapa 3 do plano).
targetScope = 'subscription'

@minLength(1)
@maxLength(20)
@description('Nome do ambiente do azd (ex.: prod). Entra no nome do grupo de recursos e nos sufixos.')
param environmentName string

@description('Região de tudo. brazilsouth: dados pessoais (inclusive de menores) ficam no país.')
param location string = 'brazilsouth'

@description('Login do administrador do Postgres (dono das tabelas; só o Job usa).')
param postgresAdminLogin string = 'geasadmin'

@secure()
@minLength(16)
@description('Senha do administrador do Postgres. Vai para o Key Vault; só o Job lê.')
param postgresAdminPassword string

@secure()
@minLength(16)
@description('Senha do papel de login do app (geas_app). O Job a aplica no banco com `setup`.')
param appDbPassword string

@description('Client ID do cliente OAuth do Google (Aplicativo da Web, redirect <APP_URL>/auth/callback).')
param googleClientId string = ''

@secure()
@description('Client secret do cliente OAuth do Google.')
param googleClientSecret string = ''

@description('Origem pública do app (ex.: https://gestao.escoteirosalbert.com.br). Vazio: o domínio padrão do Container Apps.')
param appUrl string = ''

@description('Imagem do app no ACR (preenchida pelo azd depois do primeiro deploy). Vazio: imagem de exemplo.')
param gestaoImage string = ''

@description('Imagem do Job de manutenção (preenchida pelo hook infra/hooks/job-image.sh). Vazio: imagem de exemplo.')
param jobImage string = ''

var tags = { 'azd-env-name': environmentName, app: 'geas-gestao' }

resource rg 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: 'rg-geas-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    environmentName: environmentName
    location: location
    tags: tags
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    appDbPassword: appDbPassword
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    appUrl: appUrl
    gestaoImage: gestaoImage
    jobImage: jobImage
  }
}

// Saídas lidas pelo azd (registro e deploy) e pelo hook do Job. Nenhuma é segredo.
output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.registryName
output AZURE_CONTAINER_APP_NAME string = resources.outputs.appName
output AZURE_CONTAINER_JOB_NAME string = resources.outputs.jobName
output AZURE_STORAGE_ACCOUNT_URL string = resources.outputs.storageAccountUrl
output APP_URL string = resources.outputs.appUrl
