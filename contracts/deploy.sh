#!/bin/sh
# Deploys the ChainChat contracts and exports their ABIs to shared/deployments/abi/.
#
#   DEPLOYER_PRIVATE_KEY=0x... ./deploy.sh                       # local Anvil (default)
#   RPC_URL=https://... NETWORK=base-sepolia ./deploy.sh         # another network
#
# Used directly, or as the entrypoint of the contracts-deployer service in infra/local/docker-compose.yml.
set -eu

cd "$(dirname "$0")"

: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY must be set}"
export NETWORK="${NETWORK:-anvil}"
RPC_URL="${RPC_URL:-http://localhost:8545}"

forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast

mkdir -p ../shared/deployments/abi
for contract in Registry ChatToken ClassBadge Anchor TestToken; do
  forge inspect "$contract" abi --json > "../shared/deployments/abi/$contract.json"
done
echo "ABIs exported to shared/deployments/abi/"
