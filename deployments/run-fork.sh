#!/bin/bash

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

# Read the network name from the environment variable, default to 'mainnet' if not set
network_name=${TENDERLY_NETWORK_NAME:-'mainnet'}

# Check if network_id is null or empty
if [ -z "$network_id" ] || [ "$network_id" == "null" ]; then
    # Fallback to the default network ID
    network_id=${TENDERLY_NETWORK_ID:-"1"}
fi

echo "Creating a $network_name Tenderly Fork with Chain Id $network_id... "
echo

TENDERLY_FORK_API="https://api.tenderly.co/api/v1/account/${username}/project/${project}/fork"

cleanup() {
    if [ -n "${fork_id}" ] && [ -n "${TEST_FORK}" ]; then
        echo "Deleting a fork ${fork_id} from ${username}/${project}..."
        echo

        curl -sX DELETE "${TENDERLY_FORK_API}/${fork_id}" \
            -H "Content-Type: application/json" -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}"
    fi
}

trap cleanup TERM EXIT

fork_id=$(curl -sX POST "${TENDERLY_FORK_API}" \
    -H "Content-Type: application/json" -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
    -d '{"network_id": "'${network_id}'"}' | jq -r '.simulation_fork.id')

echo "Created Tenderly Fork ${fork_id} at ${username}/${project}..."
echo

# if deployments/${network_name} doesn't exist, create it and create a .chainId file
if [ ! -d "./deployments/${network_name}" ]; then
    mkdir -p ./deployments/${network_name}
    echo ${network_id} > ./deployments/${network_name}/.chainId
fi

# if deploy/scripts/${network_name} doesn't exist, create it and copy the network scripts
if [ ! -d "./deploy/scripts/${network_name}" ]; then
    rsync -a --delete ./deploy/scripts/network/ ./deploy/scripts/${network_name}/
fi

# Create a new dir for the deploy script files and copy them there
rm -rf deployments/tenderly && cp -rf deployments/${network_name}/. deployments/tenderly

command="TENDERLY_FORK_ID=${fork_id} TENDERLY_NETWORK_NAME=${network_name} ${@:1}"

echo "Running:"
echo
echo ${command}

eval ${command}
