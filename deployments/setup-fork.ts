import Contracts from '../components/Contracts';
import { DeployedContracts, getNamedSigners, isTenderlyFork, runPendingDeployments } from '../utils/Deploy';
import Logger from '../utils/Logger';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { ZERO_ADDRESS } from '../utils/Constants';
import '@nomiclabs/hardhat-ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import '@tenderly/hardhat-tenderly';
import '@typechain/hardhat';
import AdmZip from 'adm-zip';
import { BigNumber } from 'ethers';
import { getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';
import path from 'path';

interface EnvOptions {
    DEV_ADDRESSES: string;
    FORK_NAME: string;
    FORK_RESEARCH: boolean;
    TENDERLY_PROJECT: string;
    TENDERLY_USERNAME: string;
    TENDERLY_FORK_ID: string;
}

const {
    DEV_ADDRESSES,
    FORK_NAME,
    FORK_RESEARCH: isResearch,
    TENDERLY_PROJECT,
    TENDERLY_USERNAME,
    TENDERLY_FORK_ID: forkId
}: EnvOptions = process.env as any as EnvOptions;

interface FundingRequest {
    token: string;
    amount: BigNumber;
    whale: SignerWithAddress;
}

const fundAccount = async (account: string, fundingRequests: FundingRequest[]) => {
    Logger.log(`Funding ${account}...`);

    for (const fundingRequest of fundingRequests) {
        // for tokens which are missing skip funding request
        if (fundingRequest.token === ZERO_ADDRESS) {
            continue;
        }
        const { whale } = fundingRequest;
        if (!whale) {
            continue;
        }
        if (fundingRequest.token === NATIVE_TOKEN_ADDRESS) {
            await fundingRequest.whale.sendTransaction({
                value: fundingRequest.amount,
                to: account
            });

            continue;
        }

        const tokenContract = await Contracts.ERC20.attach(fundingRequest.token);
        // check if whale has enough balance
        const whaleBalance = await tokenContract.balanceOf(whale.address);
        if (whaleBalance.lt(fundingRequest.amount)) {
            Logger.error(`Whale ${whale.address} has insufficient balance for ${fundingRequest.token}`);
            continue;
        }
        await tokenContract.connect(whale).transfer(account, fundingRequest.amount);
    }
};

const fundAccounts = async () => {
    Logger.log('Funding test accounts...');
    Logger.log();

    const { dai, link, usdc, wbtc } = await getNamedAccounts();
    const { ethWhale, bntWhale, daiWhale, linkWhale, usdcWhale, wbtcWhale } = await getNamedSigners();
    const bnt = await DeployedContracts.BNT.deployed();

    const fundingRequests = [
        {
            token: NATIVE_TOKEN_ADDRESS,
            amount: toWei(10_000),
            whale: ethWhale
        },
        {
            token: bnt.address,
            amount: toWei(10_000),
            whale: bntWhale
        },
        {
            token: dai,
            amount: toWei(100_000),
            whale: daiWhale
        },
        {
            token: link,
            amount: toWei(10_000),
            whale: linkWhale
        },
        {
            token: usdc,
            amount: toWei(100_000, 6),
            whale: usdcWhale
        },
        {
            token: wbtc,
            amount: toWei(100, 8),
            whale: wbtcWhale
        }
    ];

    if (DEV_ADDRESSES === undefined || DEV_ADDRESSES === '') {
        Logger.log('No dev addresses to fund');
        return;
    }

    const devAddresses = DEV_ADDRESSES.split(',');

    for(const fundingRequest of fundingRequests) {
        if(fundingRequest.token == ZERO_ADDRESS) {
            Logger.log(`Skipping funding for ${fundingRequest.token}`);
        }
        const { whale } = fundingRequest;
        if (!whale) {
            continue;
        }
        const whaleBalance = await whale.getBalance();
        // transfer ETH to the funding account if it doesn't have ETH

        if (whaleBalance.lt(toWei(1))) {
            await fundingRequests[0].whale.sendTransaction({
                value: toWei(1),
                to: whale.address
            });
        }
    }

    for (const account of devAddresses) {
        await fundAccount(account, fundingRequests);
    }

    Logger.log();
};

const setLockDuration = async (lockDuration: number) => {
    Logger.log(`Setting withdrawal lock duration to ${lockDuration} seconds...`);
    Logger.log();

    const { daoMultisig } = await getNamedSigners();

    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    await pendingWithdrawals.connect(daoMultisig).setLockDuration(lockDuration);
};

const runDeployments = async () => {
    Logger.log('Running pending deployments...');
    Logger.log();

    await runPendingDeployments();

    Logger.log();
};

const archiveArtifacts = async () => {
    const zip = new AdmZip();

    const srcDir = path.resolve(path.join(__dirname, './tenderly'));
    const dest = path.resolve(path.join(__dirname, `../fork-${forkId}.zip`));

    zip.addLocalFolder(srcDir);
    zip.writeZip(dest);

    Logger.log(`Archived ${srcDir} to ${dest}...`);
    Logger.log();
};

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    Logger.log();

    await runDeployments();

    await fundAccounts();

    const lockDuration = 2;

    if (isResearch) {
        await setLockDuration(lockDuration);
    }

    await archiveArtifacts();

    const description = FORK_NAME ? `Bancor V3 ${FORK_NAME} Fork` : 'Bancor V3 Mainnet Fork';

    Logger.log('********************************************************************************');
    Logger.log();
    Logger.log(description);
    Logger.log('‾'.repeat(description.length));
    Logger.log(`   RPC: https://rpc.tenderly.co/fork/${forkId}`);
    Logger.log(`   Dashboard: https://dashboard.tenderly.co/${TENDERLY_USERNAME}/${TENDERLY_PROJECT}/fork/${forkId}`);
    if (isResearch) {
        Logger.log();
        Logger.log(`   * Withdrawal locking duration was set to ${lockDuration} seconds`);
    }
    Logger.log();
    Logger.log('********************************************************************************');
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        Logger.error(error);
        process.exit(1);
    });
