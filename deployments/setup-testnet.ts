import {
    DeployedContracts,
    deploymentTagExists,
    fundAccount,
    fundAccountWithToken,
    grantRole,
    InstanceName,
    isTenderly,
    runPendingDeployments
} from '../utils/Deploy';
import Logger from '../utils/Logger';
import { Roles } from '../utils/Roles';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import AdmZip from 'adm-zip';
import { BigNumber } from 'ethers';
import fs from 'fs';
import { getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';
import { capitalize } from 'lodash';
import path from 'path';

interface EnvOptions {
    DEV_ADDRESSES: string;
    TESTNET_NAME: string;
    TENDERLY_PROJECT: string;
    TENDERLY_USERNAME: string;
    TENDERLY_TESTNET_ID: string;
    TENDERLY_NETWORK_NAME: string;
    TENDERLY_TESTNET_PROVIDER_URL?: string;
}

const {
    DEV_ADDRESSES,
    TESTNET_NAME,
    TENDERLY_PROJECT,
    TENDERLY_USERNAME,
    TENDERLY_TESTNET_ID: testnetId = '',
    TENDERLY_NETWORK_NAME = 'mainnet',
    TENDERLY_TESTNET_PROVIDER_URL: testnetRpcUrl
}: EnvOptions = process.env as any as EnvOptions;

interface FundingRequest {
    token: string;
    tokenName: string;
    amount: BigNumber;
}

const fundAccountWith = async (account: string, fundingRequests: FundingRequest[]) => {
    Logger.log(`Funding ${account}...`);

    for (const { token, amount } of fundingRequests) {
        // the balances are credited directly through the testnet's tenderly_setBalance/tenderly_setErc20Balance cheat
        // methods rather than transferred from a whale, whose balance we don't control
        if (token === NATIVE_TOKEN_ADDRESS) {
            await fundAccount(account, amount);
        } else {
            await fundAccountWithToken(token, account, amount);
        }
    }
};

const fundAccounts = async () => {
    Logger.log('Funding test accounts...');
    Logger.log();

    const { dai, link, usdc, wbtc } = await getNamedAccounts();
    const bnt = (await DeployedContracts.BNT.deployed()).address;

    const fundingRequests: FundingRequest[] = [
        {
            token: NATIVE_TOKEN_ADDRESS,
            tokenName: 'eth',
            amount: toWei(1000)
        },
        {
            token: bnt,
            tokenName: 'bnt',
            amount: toWei(10_000)
        },
        {
            token: dai,
            tokenName: 'dai',
            amount: toWei(20_000)
        },
        {
            token: link,
            tokenName: 'link',
            amount: toWei(10_000)
        },
        {
            token: usdc,
            tokenName: 'usdc',
            amount: toWei(100_000, 6)
        },
        {
            token: wbtc,
            tokenName: 'wbtc',
            amount: toWei(100, 8)
        }
    ];

    const devAddresses = (DEV_ADDRESSES ?? '').split(',').filter((address) => address !== '');
    if (devAddresses.length === 0) {
        Logger.log('no dev addresses provided');
        return;
    }

    for (const account of devAddresses) {
        await fundAccountWith(account, fundingRequests);
    }

    Logger.log();
};

const prepareLiquidityProtectionUpgrade = async () => {
    // mirror the mainnet prerequisite of the liquidity protection upgrade while it's still pending: the foundation
    // multisig grants the deployer the BNT ROLE_GOVERNOR role beforehand (000100-revoke-roles renounces it at the end
    // of the pipeline)
    if (deploymentTagExists('66')) {
        return;
    }

    const { deployer, foundationMultisig } = await getNamedAccounts();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();

    if (!(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
        await grantRole({
            name: InstanceName.BNTGovernance,
            id: Roles.TokenGovernance.ROLE_GOVERNOR,
            member: deployer,
            from: foundationMultisig
        });
    }
};

const runDeployments = async () => {
    Logger.log('Running pending deployments...');
    Logger.log();

    await prepareLiquidityProtectionUpgrade();

    await runPendingDeployments();

    Logger.log();
};

const archiveArtifacts = async () => {
    const zip = new AdmZip();

    const srcDir = path.resolve(path.join(__dirname, './tenderly'));
    const destDir = path.resolve(path.join(__dirname, '..', 'testnets'));
    const dest = path.join(destDir, `testnet-${testnetId}.zip`);

    fs.mkdirSync(destDir, { recursive: true });

    zip.addLocalFolder(srcDir);
    zip.writeZip(dest);

    Logger.log(`Archived ${srcDir} to ${dest}...`);
    Logger.log();
};

const main = async () => {
    if (!isTenderly()) {
        throw new Error('Invalid network');
    }

    Logger.log();

    await runDeployments();

    await fundAccounts();

    await archiveArtifacts();

    const description = `${capitalize(TENDERLY_NETWORK_NAME)} ${TESTNET_NAME ? `${TESTNET_NAME} ` : ''}Tenderly Testnet`;

    Logger.log('********************************************************************************');
    Logger.log();
    Logger.log(description);
    Logger.log('‾'.repeat(description.length));
    Logger.log(`   RPC: ${testnetRpcUrl}`);
    Logger.log(
        `   Dashboard: https://dashboard.tenderly.co/${TENDERLY_USERNAME}/${TENDERLY_PROJECT}/testnet/${testnetId}`
    );
    Logger.log();
    Logger.log('********************************************************************************');
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        Logger.error(error);
        process.exit(1);
    });
