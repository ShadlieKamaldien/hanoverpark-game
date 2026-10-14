#!/usr/bin/env bash
# Run manually in an authenticated Azure Cloud Shell. Never trace or print keys.
set +x
set -euo pipefail

azure_npc_api_key=''
trap 'unset azure_npc_api_key' EXIT

usage() {
  cat <<'HELP'
Usage: bash scripts/setup-azure-npc-brains.sh [options]

Finds this game's Azure Static Web App, creates/reuses an Azure OpenAI resource
and model deployment, and sets private API configuration on the Static Web App.
Azure OpenAI usage is token-billed; the Static Web App can remain on Free.

  --static-app NAME       Exact existing Static Web App (requires --resource-group)
  --resource-group NAME   Existing Static Web App resource group (requires --static-app)
  --resource-name NAME    Azure OpenAI account/custom subdomain (default: derived from app)
  --location REGION       OpenAI resource region (default: westeurope)
  --model NAME            Responses/structured-output model (default: gpt-4.1-mini)
  --model-version VERSION Pin a version; otherwise resolve Azure's available default
  --deployment NAME       Model deployment name (default: hanover-npc-brains)
  --sku NAME              GlobalStandard or Standard (default: first with available quota)
  --capacity NUMBER       Maximum requested capacity, 1-10 (default: 10)
  --requests-per-minute N Global API request limit, 1-6 (default: 6)
  --client-requests-per-minute N Client API request limit, 1-4 (default: 4)
  --help                  Show this help

Uses the currently selected Azure subscription; run az account set first if needed.
Never upgrades the Static Web App or resizes/overwrites an existing deployment.
HELP
}

fail() { printf 'Setup stopped: %s\n' "$*" >&2; exit 1; }
require_value() { [[ $# -ge 2 && -n $2 && $2 != --* ]] || fail "Missing value for $1."; }

azure_npc_static_app=''
azure_npc_group=''
azure_npc_resource=''
azure_npc_location='westeurope'
azure_npc_model='gpt-4.1-mini'
azure_npc_version=''
azure_npc_deployment='hanover-npc-brains'
azure_npc_sku=''
azure_npc_capacity=10
azure_npc_rpm=6
azure_npc_client_rpm=4
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --static-app) require_value "$@"; azure_npc_static_app=$2; shift 2 ;;
    --resource-group) require_value "$@"; azure_npc_group=$2; shift 2 ;;
    --resource-name) require_value "$@"; azure_npc_resource=$2; shift 2 ;;
    --location) require_value "$@"; azure_npc_location=${2,,}; shift 2 ;;
    --model) require_value "$@"; azure_npc_model=$2; shift 2 ;;
    --model-version) require_value "$@"; azure_npc_version=$2; shift 2 ;;
    --deployment) require_value "$@"; azure_npc_deployment=$2; shift 2 ;;
    --sku) require_value "$@"; azure_npc_sku=$2; shift 2 ;;
    --capacity) require_value "$@"; azure_npc_capacity=$2; shift 2 ;;
    --requests-per-minute) require_value "$@"; azure_npc_rpm=$2; shift 2 ;;
    --client-requests-per-minute) require_value "$@"; azure_npc_client_rpm=$2; shift 2 ;;
    *) fail "Unknown option $1. Use --help." ;;
  esac
done

command -v az >/dev/null || fail 'Azure CLI is required. Use Azure Cloud Shell or install az.'
command -v python3 >/dev/null || fail 'Python 3 is required (included in Azure Cloud Shell).'
[[ -n $azure_npc_static_app && -n $azure_npc_group || -z $azure_npc_static_app && -z $azure_npc_group ]] ||
  fail 'Supply both --static-app and --resource-group, or neither for discovery.'
[[ $azure_npc_location =~ ^[a-z0-9]+$ ]] || fail 'Use an Azure region identifier, for example westeurope.'
[[ $azure_npc_model =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || fail 'Invalid model name.'
[[ $azure_npc_deployment =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || fail 'Invalid deployment name.'
[[ -z $azure_npc_sku || $azure_npc_sku == GlobalStandard || $azure_npc_sku == Standard ]] ||
  fail 'Only token-billed GlobalStandard or Standard deployments are supported.'
[[ $azure_npc_capacity =~ ^([1-9]|10)$ ]] || fail 'Capacity must be a positive integer from 1 to 10.'
[[ $azure_npc_rpm =~ ^[1-6]$ ]] || fail 'The global request limit must be 1-6.'
[[ $azure_npc_client_rpm =~ ^[1-4]$ ]] || fail 'The client request limit must be 1-4.'

azure_npc_subscription=$(az account show --only-show-errors --output json) || fail 'Run az login, then select your subscription.'
[[ $(az cloud show --query name --output tsv --only-show-errors) == AzureCloud ]] ||
  fail 'This setup and API support the public Azure cloud (AzureCloud).'
azure_npc_subscription_id=$(AZURE_NPC_JSON="$azure_npc_subscription" python3 -c 'import json,os; print(json.loads(os.environ["AZURE_NPC_JSON"])["id"])')
azure_npc_subscription_name=$(AZURE_NPC_JSON="$azure_npc_subscription" python3 -c 'import json,os; x=json.loads(os.environ["AZURE_NPC_JSON"]); print(x.get("name", x["id"]))')

if [[ -z $azure_npc_static_app ]]; then
  azure_npc_apps=$(az staticwebapp list --output json --only-show-errors)
  azure_npc_target=$(AZURE_NPC_JSON="$azure_npc_apps" python3 - <<'PY'
import json, os, sys
apps = json.loads(os.environ['AZURE_NPC_JSON'])
repo = 'https://github.com/shadliekamaldien/hanoverpark-game'
matches = []
for app in apps:
    source = str(app.get('repositoryUrl') or app.get('properties', {}).get('repositoryUrl') or '').rstrip('/').lower()
    if source.endswith('.git'):
        source = source[:-4]
    if source == repo or str(app.get('name', '')).lower() == 'hanoverpark-game':
        group = app.get('resourceGroup')
        if not group:
            parts = str(app.get('id', '')).split('/')
            group = next((parts[i+1] for i, p in enumerate(parts[:-1]) if p.lower() == 'resourcegroups'), '')
        if group:
            matches.append((app['name'], group))
if len(matches) != 1:
    print(f'Found {len(matches)} matching Static Web Apps. Supply --static-app NAME --resource-group GROUP explicitly.', file=sys.stderr)
    print('List app names/groups: az staticwebapp list --query "[].{name:name,resourceGroup:resourceGroup,repository:repositoryUrl}" --output table', file=sys.stderr)
    sys.exit(1)
print('\t'.join(matches[0]))
PY
  ) || fail 'Could not select exactly one game Static Web App; no resource was created.'
  IFS=$'\t' read -r azure_npc_static_app azure_npc_group <<< "$azure_npc_target"
fi
azure_npc_app=$(az staticwebapp show --name "$azure_npc_static_app" --resource-group "$azure_npc_group" --output json --only-show-errors) ||
  fail 'The specified Static Web App does not exist or is not accessible in the selected subscription.'

if [[ -z $azure_npc_resource ]]; then
  azure_npc_resource=$(AZURE_NPC_APP="$azure_npc_static_app" AZURE_NPC_SUB="$azure_npc_subscription_id" python3 - <<'PY'
import os, re
app = re.sub(r'[^a-z0-9-]', '-', os.environ['AZURE_NPC_APP'].lower()).strip('-')[:35].rstrip('-') or 'hanoverpark-game'
print(f'{app}-npc-{os.environ["AZURE_NPC_SUB"].replace("-", "")[:8]}')
PY
  )
fi
[[ $azure_npc_resource =~ ^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$ ]] ||
  fail 'Resource name/custom subdomain must contain 2-64 lowercase letters, digits or hyphens and end with a letter/digit.'
printf 'Subscription: %s\nStatic Web App: %s / %s\nAzure OpenAI: %s (%s)\nModel: %s; deployment: %s\n' \
  "$azure_npc_subscription_name" "$azure_npc_group" "$azure_npc_static_app" "$azure_npc_resource" "$azure_npc_location" "$azure_npc_model" "$azure_npc_deployment"
printf 'Azure OpenAI requests are token-billed. The Static Web App tier will remain unchanged.\n'

azure_npc_accounts=$(az cognitiveservices account list --resource-group "$azure_npc_group" --output json --only-show-errors)
azure_npc_existing=$(AZURE_NPC_JSON="$azure_npc_accounts" AZURE_NPC_NAME="$azure_npc_resource" python3 -c '
import json,os
items=[x for x in json.loads(os.environ["AZURE_NPC_JSON"]) if x.get("name", "").lower()==os.environ["AZURE_NPC_NAME"].lower()]
print(json.dumps(items[0]) if items else "")')
if [[ -n $azure_npc_existing ]]; then
  AZURE_NPC_JSON="$azure_npc_existing" AZURE_NPC_LOCATION="$azure_npc_location" python3 - <<'PY' || fail 'Existing resource differs from the requested OpenAI configuration; choose another --resource-name or the correct --location.'
import json, os, sys
x=json.loads(os.environ['AZURE_NPC_JSON'])
if x.get('kind') != 'OpenAI' or str(x.get('location', '')).replace(' ', '').lower() != os.environ['AZURE_NPC_LOCATION'] or x.get('sku', {}).get('name') != 'S0':
    sys.exit(1)
PY
  printf 'Reusing the matching OpenAI resource.\n'
else
  azure_npc_provider=$(az provider show --namespace Microsoft.CognitiveServices --query registrationState --output tsv --only-show-errors)
  if [[ $azure_npc_provider != Registered ]]; then
    az provider register --namespace Microsoft.CognitiveServices --wait --output none --only-show-errors
  fi
  az cognitiveservices account create --name "$azure_npc_resource" --resource-group "$azure_npc_group" \
    --location "$azure_npc_location" --kind OpenAI --sku S0 --custom-domain "$azure_npc_resource" \
    --output none --only-show-errors || fail 'OpenAI account creation failed. Check resource permissions, region support and global subdomain availability.'
fi

azure_npc_deployments=$(az cognitiveservices account deployment list --name "$azure_npc_resource" --resource-group "$azure_npc_group" --output json --only-show-errors)
azure_npc_existing_deployment=$(AZURE_NPC_JSON="$azure_npc_deployments" AZURE_NPC_NAME="$azure_npc_deployment" python3 -c '
import json,os
items=[x for x in json.loads(os.environ["AZURE_NPC_JSON"]) if x.get("name")==os.environ["AZURE_NPC_NAME"]]
print(json.dumps(items[0]) if items else "")')
if [[ -n $azure_npc_existing_deployment ]]; then
  AZURE_NPC_JSON="$azure_npc_existing_deployment" AZURE_NPC_MODEL="$azure_npc_model" AZURE_NPC_VERSION="$azure_npc_version" AZURE_NPC_SKU="$azure_npc_sku" python3 - <<'PY' || fail 'Existing deployment has a different model/version/SKU; choose a new --deployment name. It was not modified.'
import json, os, sys
x=json.loads(os.environ['AZURE_NPC_JSON']); model=x.get('properties', {}).get('model', {})
sku=x.get('sku', {}).get('name')
if model.get('format') != 'OpenAI' or model.get('name') != os.environ['AZURE_NPC_MODEL'] or sku not in ('GlobalStandard','Standard'):
    sys.exit(1)
if os.environ['AZURE_NPC_VERSION'] and model.get('version') != os.environ['AZURE_NPC_VERSION']:
    sys.exit(1)
if os.environ['AZURE_NPC_SKU'] and sku != os.environ['AZURE_NPC_SKU']:
    sys.exit(1)
PY
  printf 'Reusing the matching deployment without upgrading its model or changing capacity.\n'
else
  azure_npc_models=$(az cognitiveservices account list-models --name "$azure_npc_resource" --resource-group "$azure_npc_group" --output json --only-show-errors)
  azure_npc_usage=$(az cognitiveservices account list-usage --name "$azure_npc_resource" --resource-group "$azure_npc_group" --output json --only-show-errors)
  azure_npc_selection=$(AZURE_NPC_MODELS="$azure_npc_models" AZURE_NPC_USAGE="$azure_npc_usage" \
    AZURE_NPC_MODEL="$azure_npc_model" AZURE_NPC_VERSION="$azure_npc_version" AZURE_NPC_SKU="$azure_npc_sku" AZURE_NPC_CAPACITY="$azure_npc_capacity" python3 - <<'PY'
import datetime, json, math, os, sys
models=json.loads(os.environ['AZURE_NPC_MODELS']); usages=json.loads(os.environ['AZURE_NPC_USAGE'])
if isinstance(models, dict): models=models.get('value', [])
if isinstance(usages, dict): usages=usages.get('value', [])
requested=int(os.environ['AZURE_NPC_CAPACITY']); wanted=os.environ['AZURE_NPC_MODEL']; pinned=os.environ['AZURE_NPC_VERSION']
today=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
quotas={x.get('name', {}).get('value'): max(0, float(x.get('limit', 0))-float(x.get('currentValue', 0))) for x in usages}
models=[x for x in models if x.get('format')=='OpenAI' and x.get('name')==wanted and x.get('version') and
        (not pinned or x['version']==pinned) and x.get('lifecycleStatus', 'GenerallyAvailable') not in ('Deprecating','Deprecated','Legacy') and
        (not x.get('deprecation', {}).get('inference') or x['deprecation']['inference'][:10]>today)]
models.sort(key=lambda x: (bool(x.get('isDefaultVersion')), x['version']), reverse=True)
sku_order=[os.environ['AZURE_NPC_SKU']] if os.environ['AZURE_NPC_SKU'] else ['GlobalStandard','Standard']
for sku_name in sku_order:
    for model in models:
        for sku in model.get('skus', []):
            if sku.get('name') != sku_name: continue
            config=sku.get('capacity') or {}; minimum=int(config.get('minimum', 1)); maximum=int(config.get('maximum', requested)); step=max(1,int(config.get('step',1)))
            available=quotas.get(sku.get('usageName')); ceiling=min(requested, maximum)
            if available is not None: ceiling=min(ceiling, math.floor(available))
            # If quota metadata is unavailable, request the smallest valid capacity.
            else: ceiling=min(ceiling, minimum)
            allowed=config.get('allowedValues') or []
            capacity=max((int(x) for x in allowed if minimum <= int(x) <= ceiling),default=0) if allowed else minimum+math.floor((ceiling-minimum)/step)*step
            if capacity < minimum or capacity <= 0: continue
            print(f'{model["version"]}\t{sku_name}\t{capacity}')
            sys.exit(0)
print(f'No usable {wanted} version/SKU/quota in this resource region. Check Azure model availability/quota, or rerun with --location, --model-version, --sku or a smaller --capacity.',file=sys.stderr)
sys.exit(1)
PY
  ) || fail 'No supported deployment configuration was available. No existing deployment was altered.'
  IFS=$'\t' read -r azure_npc_version azure_npc_sku azure_npc_capacity <<< "$azure_npc_selection"
  printf 'Creating model version %s, SKU %s, capacity %s.\n' "$azure_npc_version" "$azure_npc_sku" "$azure_npc_capacity"
  az cognitiveservices account deployment create --name "$azure_npc_resource" --resource-group "$azure_npc_group" \
    --deployment-name "$azure_npc_deployment" --model-format OpenAI --model-name "$azure_npc_model" \
    --model-version "$azure_npc_version" --sku-name "$azure_npc_sku" --sku-capacity "$azure_npc_capacity" \
    --output none --only-show-errors || fail 'Deployment creation failed. Azure may have changed quota or regional capacity; existing resources were preserved.'
fi

azure_npc_ready=false
for ((azure_npc_attempt=0; azure_npc_attempt<36; azure_npc_attempt++)); do
  azure_npc_state=$(az cognitiveservices account deployment show --name "$azure_npc_resource" --resource-group "$azure_npc_group" \
    --deployment-name "$azure_npc_deployment" --query properties.provisioningState --output tsv --only-show-errors)
  case "$azure_npc_state" in
    Succeeded) azure_npc_ready=true; break ;;
    Failed|Canceled) fail "Model deployment finished with state $azure_npc_state; the app's settings were not changed." ;;
  esac
  sleep 5
done
[[ $azure_npc_ready == true ]] || fail 'Deployment is still provisioning after three minutes. Rerun this script when it is ready.'

azure_npc_endpoint=$(az cognitiveservices account show --name "$azure_npc_resource" --resource-group "$azure_npc_group" \
  --query properties.endpoint --output tsv --only-show-errors)
[[ $azure_npc_endpoint =~ ^https://[a-zA-Z0-9-]+\.openai\.azure\.com/?$ ]] ||
  fail 'The resource endpoint is not a public Azure OpenAI custom-subdomain root; existing settings were not changed.'
azure_npc_api_key=$(az cognitiveservices account keys list --name "$azure_npc_resource" --resource-group "$azure_npc_group" \
  --query key1 --output tsv --only-show-errors)
[[ -n $azure_npc_api_key && $azure_npc_api_key != null && $azure_npc_api_key != None ]] || fail 'Azure returned no API key; existing app settings were not changed.'
az staticwebapp appsettings set --name "$azure_npc_static_app" --resource-group "$azure_npc_group" \
  --setting-names "AZURE_OPENAI_ENDPOINT=${azure_npc_endpoint%/}" "AZURE_OPENAI_DEPLOYMENT=$azure_npc_deployment" \
    "AZURE_OPENAI_API_KEY=$azure_npc_api_key" "NPC_BRAIN_REQUESTS_PER_MINUTE=$azure_npc_rpm" \
    "NPC_BRAIN_CLIENT_REQUESTS_PER_MINUTE=$azure_npc_client_rpm" \
  --output none --only-show-errors
unset azure_npc_api_key
printf 'NPC API settings saved privately on %s. No key was printed or saved to the repository.\n' "$azure_npc_static_app"
printf 'Now deploy the game/API from the updated branch:\n'
printf 'gh workflow run deploy-azure.yml --repo ShadlieKamaldien/hanoverpark-game --ref feat/playable-neighbourhood\n'
