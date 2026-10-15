# Azure OpenAI for NPC conversations

The browser sends NPC conversation requests to the game's `/api/npc-brain` managed Functions endpoint. Only that server calls Azure OpenAI. The deployment workflow publishes `dist` and `api`, and the managed API uses Node.js 22. The existing Static Web App can remain **Free**, but **Azure OpenAI is a separate token-billed service**. These commands create that resource and a pay-per-token model deployment; they do not create a paid Static Web App or a provisioned-throughput model.

Run this in your logged-in Azure Cloud Shell, from the repository checkout:

```bash
git fetch origin
git switch feat/playable-neighbourhood
git pull --ff-only origin feat/playable-neighbourhood
bash scripts/setup-azure-npc-brains.sh
gh workflow run deploy-azure.yml \
  --repo ShadlieKamaldien/hanoverpark-game \
  --ref feat/playable-neighbourhood
```

If the repository is not already cloned in Cloud Shell, start with:

```bash
git clone --branch feat/playable-neighbourhood https://github.com/ShadlieKamaldien/hanoverpark-game.git
cd hanoverpark-game
bash scripts/setup-azure-npc-brains.sh
gh workflow run deploy-azure.yml \
  --repo ShadlieKamaldien/hanoverpark-game \
  --ref feat/playable-neighbourhood
```

The script uses your currently selected Azure subscription. Run `az account show --query name --output tsv` to check it, and `az account set --subscription "YOUR SUBSCRIPTION NAME"` before setup if necessary. It selects an existing Static Web App only when exactly one app matches the game's GitHub repository URL or the exact name `hanoverpark-game`. With zero or multiple matches, it stops before creating resources. List the existing targets and specify the game's app explicitly:

```bash
az staticwebapp list \
  --query "[].{name:name,resourceGroup:resourceGroup,repository:repositoryUrl}" \
  --output table
bash scripts/setup-azure-npc-brains.sh \
  --static-app YOUR_GAME_APP_NAME \
  --resource-group YOUR_EXISTING_RESOURCE_GROUP
```

Setup creates an `OpenAI` account with SKU `S0` in that existing resource group. Its default name is derived from the Static Web App name and selected subscription ID; no subscription ID, API key or model credential is hard-coded. It defaults to **West Europe** and **`gpt-4.1-mini`**, and queries `az cognitiveservices account list-models` for an actually available version. It prefers a supported **GlobalStandard** deployment, then **Standard**, and requests at most capacity **10**, reduced to available quota and valid SKU increments. If quota metadata is unavailable, it requests only the smallest valid capacity. Azure remains the authority on current availability and quota; an unavailable model or insufficient quota stops setup with an explanation.

GlobalStandard can process requests globally rather than only in the resource's region. To request a regional Standard deployment, or use an account name/region/version you have chosen, use the optional flags:

```bash
bash scripts/setup-azure-npc-brains.sh \
  --static-app YOUR_GAME_APP_NAME \
  --resource-group YOUR_EXISTING_RESOURCE_GROUP \
  --resource-name YOUR_UNIQUE_OPENAI_NAME \
  --location westeurope \
  --deployment hanover-npc-brains \
  --model gpt-4.1-mini \
  --sku Standard \
  --capacity 10
```

`--model-version VERSION` pins an available version. A different `--model` must support the Azure OpenAI v1 Responses API and strict JSON structured outputs used by the server. The script checks deployment availability, not every model's API capabilities. `bash scripts/setup-azure-npc-brains.sh --help` lists all options.

Azure response JSON is read from a private temporary directory that is removed on success or failure. Large model catalogues are never passed through environment variables or command arguments. If an earlier version stopped with `Argument list too long`, download the latest script and rerun with the same options to reuse the resource already created.

Rerunning setup reuses a matching resource and deployment. It preserves an existing deployment's version and capacity, and refuses a conflicting resource kind, region, model, explicit model version or explicit SKU. It registers the Cognitive Services provider if needed, waits for deployment readiness, and merges these production API settings with the Static Web App's existing settings:

| Setting | Purpose |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Resource root, such as `https://YOUR_RESOURCE.openai.azure.com` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name used as the model in v1 Responses requests |
| `AZURE_OPENAI_API_KEY` | Private server credential stored only in Azure app settings |
| `NPC_BRAIN_REQUESTS_PER_MINUTE` | Global API request limit; default 6, allowed 1–6 |
| `NPC_BRAIN_CLIENT_REQUESTS_PER_MINUTE` | Per-client request limit; default 4, allowed 1–4 |

The key is captured silently, shell tracing is disabled, settings output is suppressed, and the key variable is cleared on exit. Do not paste the key into chat, add it to `VITE_*` variables, put it in GitHub source or commit a local settings file. The GitHub deployment workflow continues to use the existing `AZURE_STATIC_WEB_APPS_API_TOKEN` repository secret; the OpenAI key belongs in the Static Web App's private API settings.

After deployment, open the 3D game, speak to an NPC and use the conversation input. Normal dialogue remains available when the AI service is unconfigured, busy or unavailable. Requests go to the server's `/openai/v1/responses` call with strict structured output and `store: false`; `store: false` controls response storage and does not erase provider service logs or replace Azure's data-handling terms.

Request limits and bounded conversation sizes reduce accidental usage. They are not a monthly spending cap, and a scaled API can have multiple server instances. Set an Azure Cost Management budget/alerts for the OpenAI resource and review token usage. To stop new AI requests while retaining normal game dialogue, remove just the server credential:

```bash
az staticwebapp appsettings delete \
  --name YOUR_GAME_APP_NAME \
  --resource-group YOUR_EXISTING_RESOURCE_GROUP \
  --setting-names AZURE_OPENAI_API_KEY \
  --output none
```

The OpenAI resource/deployment is retained; deleting the credential does not delete or resize Azure resources. If setup stops after resource creation but before deployment, rerun with the same resource name once quota/availability is resolved. No live Azure resource creation or billed inference was performed while preparing this script; checks use mocked CLI responses.

Run the five offline setup regression tests with `python3 tests/setup_azure_npc_brains_test.py`. They exercise the real Bash/Python script against a mocked Azure CLI, including multi-megabyte catalogues, resource reuse, quota handling and temporary-file cleanup. CI runs these alongside the game checks.

References: [Azure CLI Cognitive Services account](https://learn.microsoft.com/cli/azure/cognitiveservices/account), [model deployment CLI](https://learn.microsoft.com/cli/azure/cognitiveservices/account/deployment), [Static Web App API settings](https://learn.microsoft.com/azure/static-web-apps/application-settings), [Azure OpenAI deployment types](https://learn.microsoft.com/azure/ai-foundry/openai/how-to/deployment-types), [Azure OpenAI quotas](https://learn.microsoft.com/azure/ai-foundry/openai/quotas-limits), and [Azure budgets](https://learn.microsoft.com/azure/cost-management-billing/costs/tutorial-acm-create-budgets). The script's model/SKU/quota resolution follows the [official account-model REST schema](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/cognitiveservices/resource-manager/Microsoft.CognitiveServices/CognitiveServices/stable/2026-09-01/cognitiveservices.json) and existing-setting merge behavior follows the [Azure CLI implementation](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/appservice/static_sites.py).
