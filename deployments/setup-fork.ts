import Contracts from '../components/Contracts';
import { DeployedContracts, getNamedSigners, isTenderlyFork, runPendingDeployments } from '../utils/Deploy';
import Logger from '../utils/Logger';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toWei } from '../utils/Types';
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
        if (fundingRequest.token === NATIVE_TOKEN_ADDRESS) {
            await fundingRequest.whale.sendTransaction({
                value: fundingRequest.amount,
                to: account
            });

            continue;
        }

        const tokenContract = await Contracts.ERC20.attach(fundingRequest.token);
        await tokenContract.connect(fundingRequest.whale).transfer(account, fundingRequest.amount);
    }
};

const fundAccounts = async () => {
    Logger.log('Funding test accounts...');
    Logger.log();

    const { dai, link } = await getNamedAccounts();
    const { ethWhale, bntWhale, daiWhale, linkWhale } = await getNamedSigners();
    const bnt = await DeployedContracts.BNT.deployed();

    const ethAmount = 10_000;
    const bntAmount = 10_000;
    const daiAmount = 500_000;
    const linkAmount = 10_000;

    const fundingRequests = [
        {
            token: NATIVE_TOKEN_ADDRESS,
            amount: toWei(ethAmount),
            whale: ethWhale
        },
        {
            token: bnt.address,
            amount: toWei(bntAmount),
            whale: bntWhale
        },
        {
            token: dai,
            amount: toWei(daiAmount),
            whale: daiWhale
        },
        {
            token: link,
            amount: toWei(linkAmount),
            whale: linkWhale
        }
    ];

    const devAddresses = DEV_ADDRESSES.split(',');

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

    const description = `${FORK_NAME} Fork`;

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
