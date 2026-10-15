"""Offline Azure setup regression tests: python3 tests/setup_azure_npc_brains_test.py.

Runs the real Bash/Python setup against a fake az executable. No Azure login,
network access, SDK, or third-party Python packages are needed.
"""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SETUP_SCRIPT = Path(os.environ.get(
    "AZURE_NPC_SETUP_SCRIPT",
    Path(__file__).resolve().parents[1] / "scripts/setup-azure-npc-brains.sh",
))
SECRET = "fake-npc-key-must-not-appear-in-output"
FAKE_AZ = r'''#!/usr/bin/env python3
import json, os, pathlib, shutil, sys
args = sys.argv[1:]
root = pathlib.Path(os.environ['NPC_TEST_FIXTURES'])
secret = 'fake-npc-key-must-not-appear-in-output'
with (root / 'calls.jsonl').open('a') as log:
    log.write(json.dumps([arg.replace(secret, '[REDACTED]') for arg in args]) + '\n')
def emit(name):
    with (root / name).open('rb') as source:
        shutil.copyfileobj(source, sys.stdout.buffer)
    raise SystemExit(0)
def text(value):
    print(value)
    raise SystemExit(0)
if args[:2] == ['account', 'show']: emit('subscription.json')
if args[:2] == ['cloud', 'show']: text('AzureCloud')
if args[:2] == ['staticwebapp', 'list']: emit('apps.json')
if args[:2] == ['staticwebapp', 'show']: emit('app.json')
if args[:3] == ['cognitiveservices', 'account', 'list']: emit('accounts.json')
if args[:4] == ['cognitiveservices', 'account', 'deployment', 'list']: emit('deployments.json')
if args[:3] == ['cognitiveservices', 'account', 'list-models']:
    if (root / 'fail-model-command').exists():
        print('Mock model catalogue request failed', file=sys.stderr)
        raise SystemExit(3)
    emit('models.json')
if args[:3] == ['cognitiveservices', 'account', 'list-usage']: emit('usage.json')
if args[:4] == ['cognitiveservices', 'account', 'deployment', 'create']: text('')
if args[:4] == ['cognitiveservices', 'account', 'deployment', 'show']: text('Succeeded')
if args[:3] == ['cognitiveservices', 'account', 'show']:
    text('https://hanoverpark-game-npc-aaaaaaaa.openai.azure.com/')
if args[:4] == ['cognitiveservices', 'account', 'keys', 'list']: text(secret)
if args[:3] == ['staticwebapp', 'appsettings', 'set']:
    settings = args[args.index('--setting-names') + 1:args.index('--output')]
    assert 'AZURE_OPENAI_API_KEY=' + secret in settings
    assert 'AZURE_OPENAI_DEPLOYMENT=hanover-npc-brains' in settings
    assert 'AZURE_OPENAI_ENDPOINT=https://hanoverpark-game-npc-aaaaaaaa.openai.azure.com' in settings
    assert args[args.index('--output') + 1] == 'none'
    text('')
print('Unexpected Azure mutation or command: ' + str(args), file=sys.stderr)
raise SystemExit(2)
'''


class AzureNpcSetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="npc-setup-regression-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.fixtures = self.root / "fixtures"
        self.fixtures.mkdir()
        self.scratch = self.root / "metadata"
        self.scratch.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        az = self.bin / "az"
        az.write_text(FAKE_AZ)
        az.chmod(0o755)
        self.app = {
            "name": "hanoverpark-game", "resourceGroup": "game-group",
            "repositoryUrl": "https://github.com/ShadlieKamaldien/hanoverpark-game",
        }
        self.account = {
            "name": "hanoverpark-game-npc-aaaaaaaa", "kind": "OpenAI",
            "location": "westeurope", "sku": {"name": "S0"},
        }
        self.deployment = {
            "name": "hanover-npc-brains", "sku": {"name": "GlobalStandard", "capacity": 30},
            "properties": {"model": {"format": "OpenAI", "name": "gpt-4.1-mini", "version": "2025-04-14"}},
        }
        self.model = {
            "name": "gpt-4.1-mini", "format": "OpenAI", "version": "2025-04-14",
            "isDefaultVersion": True, "lifecycleStatus": "GenerallyAvailable",
            "skus": [
                {"name": "GlobalStandard", "usageName": "GlobalMini", "capacity": {"minimum": 1, "maximum": 1000, "step": 1}},
                {"name": "Standard", "usageName": "StandardMini", "capacity": {"minimum": 2, "maximum": 1000, "step": 2}},
            ],
        }
        self.write("subscription.json", {"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "name": "Game Subscription"})
        self.write("apps.json", [self.app])
        self.write("app.json", self.app)
        self.write("accounts.json", [self.account])
        self.write("deployments.json", [])
        self.write("models.json", [self.model])
        self.write("usage.json", [
            {"name": {"value": "GlobalMini"}, "limit": 0, "currentValue": 0},
            {"name": {"value": "StandardMini"}, "limit": 10, "currentValue": 3},
        ])

    def write(self, name, value):
        (self.fixtures / name).write_text(json.dumps(value))

    def large_prefix(self):
        # Every catalogue exceeds both Linux's 128 KiB per-argument ceiling and
        # common aggregate argument limits. Place the actual match at the end.
        return [{"name": f"unrelated-{index}", "description": "x" * 8192} for index in range(384)]

    def large_catalogues(self):
        unrelated = self.large_prefix()
        self.write("models.json", unrelated + [self.model])
        self.write("usage.json", [{**item, "name": {"value": item["name"]}} for item in unrelated] + [
            {"name": {"value": "GlobalMini"}, "limit": 0, "currentValue": 0},
            {"name": {"value": "StandardMini"}, "limit": 10, "currentValue": 3},
        ])

    def run_setup(self, success=True, discover=False):
        env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
               "TMPDIR": str(self.scratch), "NPC_TEST_FIXTURES": str(self.fixtures)}
        args = [] if discover else ["--static-app", self.app["name"], "--resource-group", self.app["resourceGroup"]]
        result = subprocess.run(["bash", "-x", str(SETUP_SCRIPT), *args], env=env,
                                text=True, capture_output=True, timeout=20)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn(SECRET, result.stdout + result.stderr)
        self.assertNotIn("Argument list too long", result.stdout + result.stderr)
        self.assertEqual(list(self.scratch.iterdir()), [], "Temporary Azure metadata must be removed on every exit")
        self.calls = [json.loads(line) for line in (self.fixtures / "calls.jsonl").read_text().splitlines()]
        self.assertNotIn(SECRET, (self.fixtures / "calls.jsonl").read_text())
        self.assertEqual(len(self.commands("staticwebapp", "appsettings", "set")), 1 if success else 0)
        # The account is already present in every fixture. Never create/upgrade it.
        self.assertEqual(self.commands("cognitiveservices", "account", "create"), [])
        return result

    def commands(self, *prefix):
        return [call for call in self.calls if call[:len(prefix)] == list(prefix)]

    def test_large_model_catalogue_and_usage_select_quota_without_argument_limits(self):
        self.large_catalogues()
        for name in ["models.json", "usage.json"]:
            self.assertGreater((self.fixtures / name).stat().st_size, 3 * 1024 * 1024)
        self.run_setup()
        creates = self.commands("cognitiveservices", "account", "deployment", "create")
        self.assertEqual(len(creates), 1)
        command = creates[0]
        for flag, expected in [("--model-version", "2025-04-14"), ("--sku-name", "Standard"), ("--sku-capacity", "6")]:
            self.assertEqual(command[command.index(flag) + 1], expected)

    def test_large_discovery_account_and_deployment_lists_reuse_existing_resources(self):
        unrelated = self.large_prefix()
        self.write("apps.json", unrelated + [self.app])
        self.write("app.json", {**self.app, "description": "a" * (3 * 1024 * 1024)})
        self.write("accounts.json", unrelated + [{**self.account, "description": "a" * 200000}])
        self.write("deployments.json", unrelated + [{**self.deployment, "description": "d" * 200000}])
        self.run_setup(discover=True)
        self.assertEqual(self.commands("cognitiveservices", "account", "deployment", "create"), [])
        self.assertEqual(self.commands("cognitiveservices", "account", "list-models"), [])

    def test_zero_quota_does_not_write_app_settings_or_fetch_keys(self):
        self.large_catalogues()
        self.write("usage.json", [{**item, "name": {"value": item["name"]}} for item in self.large_prefix()] + [
            {"name": {"value": "GlobalMini"}, "limit": 0, "currentValue": 0},
            {"name": {"value": "StandardMini"}, "limit": 0, "currentValue": 0},
        ])
        self.run_setup(success=False)
        self.assertEqual(self.commands("cognitiveservices", "account", "deployment", "create"), [])
        self.assertEqual(self.commands("cognitiveservices", "account", "keys", "list"), [])

    def test_mismatched_existing_deployment_is_preserved(self):
        mismatch = {**self.deployment, "properties": {"model": {"format": "OpenAI", "name": "different-model"}}}
        self.write("deployments.json", self.large_prefix() + [mismatch])
        self.run_setup(success=False)
        self.assertEqual(self.commands("cognitiveservices", "account", "deployment", "create"), [])
        self.assertEqual(self.commands("cognitiveservices", "account", "keys", "list"), [])

    def test_failed_azure_command_cleans_metadata_without_changing_settings(self):
        (self.fixtures / "fail-model-command").touch()
        self.run_setup(success=False)
        self.assertEqual(self.commands("cognitiveservices", "account", "deployment", "create"), [])
        self.assertEqual(self.commands("cognitiveservices", "account", "keys", "list"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
