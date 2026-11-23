// Recursos do Gestão num grupo de recursos (chamado por main.bicep). Decisões e custos: .azure/deployment-plan.md.
//
// Resumo das escolhas:
// - Rede privada: VNet própria; o Postgres não tem endereço público e só o ambiente do Container Apps o alcança.
//   Por isso migrations, papel do app, primeiro administrador e dump rodam num Container Apps Job (imagem `job`).
// - Sem segredos em variáveis de ambiente em texto: tudo no Key Vault (RBAC, purge protection), lido pelos
//   containers com identidades gerenciadas atribuídas pelo usuário. Só a identidade do Job lê a credencial de
//   administrador do banco; a do app lê só DATABASE_URL (papel geas_app, NOINHERIT, sujeito à RLS) e o secret do Google.
// - Storage sem chave compartilhada: o app emite SAS de delegação de usuário (lib/server/files.ts).
// - Custo: 0–1 réplica, Postgres B1ms sem HA, ACR Basic, Log Analytics com teto diário.

param environmentName string
param location string
param tags object
param postgresAdminLogin string
@secure()
param postgresAdminPassword string
@secure()
param appDbPassword string
param googleClientId string
@secure()
param googleClientSecret string
param appUrl string
param gestaoImage string
param jobImage string

// Nomes globais com sufixo estável por assinatura + grupo + ambiente.
var token = toLower(uniqueString(subscription().id, resourceGroup().id, environmentName))
var names = {
  vnet: 'vnet-geas-${environmentName}'
  logs: 'log-geas-${environmentName}'
  env: 'cae-geas-${environmentName}'
  app: 'ca-geas-${environmentName}'
  job: 'caj-geas-db-${environmentName}'
  appIdentity: 'id-geas-app-${environmentName}'
  jobIdentity: 'id-geas-job-${environmentName}'
  registry: 'crgeas${token}'
  vault: 'kv-geas-${take(token, 13)}'
  storage: 'stgeas${take(token, 16)}'
  postgres: 'psql-geas-${token}'
}

// Imagens de exemplo até o primeiro deploy (o azd troca a do app; o hook, a do Job).
var placeholderAppImage = 'mcr.microsoft.com/k8se/quickstart:latest'
var placeholderJobImage = 'mcr.microsoft.com/k8se/quickstart-jobs:latest'

// Papéis internos do Azure (IDs fixos e públicos).
var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  blobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  blobDelegator: 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
}

// ---------------------------------------------------------------------------------------------------------------------
// Rede: /27 para o ambiente (workload profiles exige /27 ou maior), /28 delegada ao Postgres. Subnets não mudam depois.

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: names.vnet
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/24'] }
    subnets: [
      {
        name: 'snet-apps'
        properties: {
          addressPrefix: '10.20.0.0/27'
          delegations: [{ name: 'apps', properties: { serviceName: 'Microsoft.App/environments' } }]
        }
      }
      {
        name: 'snet-postgres'
        properties: {
          addressPrefix: '10.20.0.32/28'
          delegations: [{ name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
    ]
  }
}

resource appsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'snet-apps'
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'snet-postgres'
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${names.postgres}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: 'vnet'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Observabilidade: só os logs do Container Apps. Teto diário para não estourar o crédito; o app não registra dados
// pessoais. (Application Insights fica para quando o app tiver instrumentação.)

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: names.logs
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.15') }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Identidades: uma do app, uma do Job.

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.appIdentity
  location: location
  tags: tags
}

resource jobIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.jobIdentity
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------------------------------------------------
// Registro de imagens: Basic, sem usuário admin e sem pull anônimo; só as identidades puxam.

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: names.registry
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource appAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, appIdentity.id, roles.acrPull)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource jobAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, jobIdentity.id, roles.acrPull)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
    principalId: jobIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Postgres 17, B1ms, sem HA, backup de 7 dias, só pela VNet. Autenticação por senha (papéis do schema), TLS obrigatório.

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: names.postgres
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '17'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: postgresSubnet.id
      privateDnsZoneArmResourceId: postgresDns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [postgresDnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'geas'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ambiente do Container Apps na VNet (ingresso público, perfil Consumption).

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: names.env
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: appsSubnet.id
      internal: false
    }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    zoneRedundant: false
  }
}

var appFqdn = '${names.app}.${environment.properties.defaultDomain}'
var publicUrl = empty(appUrl) ? 'https://${appFqdn}' : appUrl

// ---------------------------------------------------------------------------------------------------------------------
// Armazenamento: comprovantes (navegador envia e baixa por SAS curta) e backups (dumps do Job). Sem chave
// compartilhada, sem blob público, TLS 1.2. O CORS libera só a origem do app.

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: names.storage
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
    cors: {
      corsRules: [
        {
          allowedOrigins: [publicUrl]
          allowedMethods: ['GET', 'PUT', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource receipts 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: 'comprovantes'
  properties: { publicAccess: 'None' }
}

resource backups 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: 'backups'
  properties: { publicAccess: 'None' }
}

// Dumps manuais ficam 90 dias (os backups automáticos do Postgres cobrem os últimos 7).
resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2024-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'expirar-dumps'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['backups/'] }
            actions: { baseBlob: { delete: { daysAfterModificationGreaterThan: 90 } } }
          }
        }
      ]
    }
  }
}

// App: dados só em `comprovantes` + chave de delegação (SAS) na conta.
resource appReceiptsWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(receipts.id, appIdentity.id, roles.blobDataContributor)
  scope: receipts
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobDataContributor)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appBlobDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, appIdentity.id, roles.blobDelegator)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobDelegator)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Job: só grava em `backups`.
resource jobBackupsWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(backups.id, jobIdentity.id, roles.blobDataContributor)
  scope: backups
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.blobDataContributor)
    principalId: jobIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Key Vault (RBAC, purge protection). Cada identidade só lê os segredos de que precisa (papel no escopo do segredo).

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: names.vault
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

var postgresHost = postgres.properties.fullyQualifiedDomainName
var databaseUrl = 'postgres://geas_app:${uriComponent(appDbPassword)}@${postgresHost}:5432/${database.name}?sslmode=verify-full'
var databaseAdminUrl = 'postgres://${uriComponent(postgresAdminLogin)}:${uriComponent(postgresAdminPassword)}@${postgresHost}:5432/${database.name}?sslmode=verify-full'

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: databaseUrl }
}

resource secretGoogle 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'google-client-secret'
  // o Key Vault não aceita segredo vazio: até haver cliente OAuth, fica um marcador (o login responde com erro)
  properties: { value: empty(googleClientSecret) ? 'nao-configurado' : googleClientSecret }
}

resource secretDatabaseAdminUrl 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'database-admin-url'
  properties: { value: databaseAdminUrl }
}

resource secretAppDbPassword 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'app-db-password'
  properties: { value: appDbPassword }
}

resource appReadsDatabaseUrl 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(secretDatabaseUrl.id, appIdentity.id, roles.keyVaultSecretsUser)
  scope: secretDatabaseUrl
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource appReadsGoogle 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(secretGoogle.id, appIdentity.id, roles.keyVaultSecretsUser)
  scope: secretGoogle
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource jobReadsAdminUrl 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(secretDatabaseAdminUrl.id, jobIdentity.id, roles.keyVaultSecretsUser)
  scope: secretDatabaseAdminUrl
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: jobIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource jobReadsAppPassword 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(secretAppDbPassword.id, jobIdentity.id, roles.keyVaultSecretsUser)
  scope: secretAppDbPassword
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: jobIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// App: 0,5 vCPU / 1 GiB (0,5 GiB não basta, ver plano 4.1), 0–1 réplica, HTTPS só.

var usingPlaceholderApp = empty(gestaoImage)

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: names.app
  location: location
  tags: union(tags, { 'azd-service-name': 'gestao' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${appIdentity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        // a imagem de exemplo escuta na 80; a do Gestão, na 3000 (PORT no Dockerfile)
        targetPort: usingPlaceholderApp ? 80 : 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [{ server: registry.properties.loginServer, identity: appIdentity.id }]
      secrets: [
        { name: 'database-url', keyVaultUrl: secretDatabaseUrl.properties.secretUri, identity: appIdentity.id }
        { name: 'google-client-secret', keyVaultUrl: secretGoogle.properties.secretUri, identity: appIdentity.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'gestao'
          image: usingPlaceholderApp ? placeholderAppImage : gestaoImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_POOL_MAX', value: '5' }
            { name: 'APP_URL', value: publicUrl }
            { name: 'GOOGLE_CLIENT_ID', value: googleClientId }
            { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-client-secret' }
            { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
            { name: 'AZURE_CLIENT_ID', value: appIdentity.properties.clientId }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
  dependsOn: [appAcrPull, appReadsDatabaseUrl, appReadsGoogle]
}

// ---------------------------------------------------------------------------------------------------------------------
// Job de manutenção (manual): `az containerapp job start ... --args setup|migrate|status|bootstrap|dump`.
// Ver apps/gestao/scripts/maintenance.mjs e apps/gestao/db/README.md.

resource job 'Microsoft.App/jobs@2025-01-01' = {
  name: names.job
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${jobIdentity.id}': {} }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [{ server: registry.properties.loginServer, identity: jobIdentity.id }]
      secrets: [
        { name: 'database-admin-url', keyVaultUrl: secretDatabaseAdminUrl.properties.secretUri, identity: jobIdentity.id }
        { name: 'app-db-password', keyVaultUrl: secretAppDbPassword.properties.secretUri, identity: jobIdentity.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'maintenance'
          image: empty(jobImage) ? placeholderJobImage : jobImage
          args: empty(jobImage) ? [] : ['status']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'DATABASE_ADMIN_URL', secretRef: 'database-admin-url' }
            { name: 'APP_DB_ROLE', value: 'geas_app' }
            { name: 'APP_DB_PASSWORD', secretRef: 'app-db-password' }
            { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
            { name: 'AZURE_CLIENT_ID', value: jobIdentity.properties.clientId }
          ]
        }
      ]
    }
  }
  dependsOn: [jobAcrPull, jobReadsAdminUrl, jobReadsAppPassword]
}

output registryLoginServer string = registry.properties.loginServer
output registryName string = registry.name
output appName string = app.name
output jobName string = job.name
output storageAccountUrl string = storage.properties.primaryEndpoints.blob
output appUrl string = publicUrl
