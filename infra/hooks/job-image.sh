#!/bin/sh
# Publica a imagem do Job de manutenção (apps/gestao/Dockerfile, target `job`) no ACR do ambiente e aponta o Job
# para ela. Roda depois do `azd deploy` (azure.yaml), da raiz do repositório, com as saídas do Bicep no ambiente.
set -eu

: "${AZURE_CONTAINER_REGISTRY_ENDPOINT:?rode azd provision antes}"
: "${AZURE_CONTAINER_REGISTRY_NAME:?}"
: "${AZURE_CONTAINER_JOB_NAME:?}"
: "${AZURE_RESOURCE_GROUP:?}"

image="${AZURE_CONTAINER_REGISTRY_ENDPOINT}/geas-gestao-job:azd-$(date -u +%Y%m%d%H%M%S)"

az acr login --name "$AZURE_CONTAINER_REGISTRY_NAME"
docker build --platform linux/amd64 -f apps/gestao/Dockerfile --target job -t "$image" .
docker push "$image"
az containerapp job update --name "$AZURE_CONTAINER_JOB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "$image" --args status --output none
# Job agendado da exclusão definitiva de associados (018): mesma imagem, comando purge
if [ -n "${AZURE_CONTAINER_PURGE_JOB_NAME:-}" ]; then
  az containerapp job update --name "$AZURE_CONTAINER_PURGE_JOB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "$image" --args purge --output none
fi
# o próximo `azd provision` mantém esta imagem (main.parameters.json: jobImage)
azd env set JOB_IMAGE "$image"
echo "Job ${AZURE_CONTAINER_JOB_NAME} usando ${image}"
