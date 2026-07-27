#!/bin/bash
set -e

dotenv=$(dirname $0)/../.env
if [ -f "${dotenv}" ]; then
    source ${dotenv}
fi

username=${TENDERLY_USERNAME}
if [ -n "${TEST_FORK}" ]; then
    project=${TENDERLY_TEST_PROJECT}
else
    project=${TENDERLY_PROJECT}
fi

# resolve the chain id of the network we're forking off of. the repo is effectively mainnet-only (the tenderly network
# in hardhat.config.ts is pinned to chain id 1), but the mechanism is kept generic
chain_ids_json="$(dirname $0)/../utils/chainIds.json"
network_name=${TENDERLY_NETWORK_NAME:-'mainnet'}

network_id=$(jq -r --arg name "$network_name" '.[$name]' "$chain_ids_json")
if [ -z "$network_id" ] || [ "$network_id" == "null" ]; then
    network_id=${TENDERLY_NETWORK_ID:-"1"}
fi
network_id=$((network_id + 0))

echo "Creating a ${network_name} Tenderly Testnet with chain id ${network_id}..."
echo

TENDERLY_TESTNET_API="https://api.tenderly.co/api/v1/account/${username}/project/${project}/vnets"

# unique per-run slug
timestamp=$(date +"%s")

cleanup() {
    if [ -n "${testnet_id}" ] && [ -n "${TEST_FORK}" ]; then
        echo "Deleting testnet ${testnet_id} from ${username}/${project}..."
        echo

        curl -sX DELETE "${TENDERLY_TESTNET_API}/${testnet_id}" \
            -H "Content-Type: application/json" -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}"
    fi
}

trap cleanup TERM EXIT

response=$(curl -sX POST "${TENDERLY_TESTNET_API}" \
    -H "Content-Type: application/json" -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
    -d '{
        "slug": "bancor-v3-testnet-'${timestamp}'",
        "display_name": "Bancor v3 Testnet",
        "fork_config": {
            "network_id": '"${network_id}"',
            "block_number": "latest"
        },
        "virtual_network_config": {
            "chain_config": {
                "chain_id": '"${network_id}"'
            }
        },
        "sync_state_config": {
            "enabled": false
        }
    }')

testnet_id=$(echo "$response" | jq -r '.id')
if [ -z "${testnet_id}" ] || [ "${testnet_id}" == "null" ]; then
    echo "Unable to create a Tenderly Testnet:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    exit 1
fi

# the admin RPC is the one that accepts the tenderly_* cheat methods (e.g. tenderly_setBalance)
provider_url=$(echo "$response" | jq -r 'first(.rpcs[] | select(.name == "Admin RPC") | .url) // .rpcs[0].url')

echo "Created Tenderly Testnet ${testnet_id} at ${username}/${project}..."
echo

# Create a new dir for the deploy script files and copy them there
rm -rf deployments/tenderly && cp -rf deployments/${network_name}/. deployments/tenderly

command="TENDERLY_TESTNET_ID=${testnet_id} TENDERLY_TESTNET_PROVIDER_URL=${provider_url} ${@:1}"

echo "Running:"
echo
echo ${command}

eval ${command}
