import Contracts from '../components/Contracts';
import { MAX_UINT256 } from '../utils/Constants';
import { DeployedContracts, getNamedSigners, isTenderlyFork } from '../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import '@nomiclabs/hardhat-ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import '@tenderly/hardhat-tenderly';
import '@typechain/hardhat';
import AdmZip from 'adm-zip';
import { BigNumber } from 'ethers';
import { getNamedAccounts, network, tenderly } from 'hardhat';
import 'hardhat-deploy';
import { HttpNetworkUserConfig } from 'hardhat/types';
import path from 'path';

interface EnvOptions {
    FORK_NAME: string;
    FORK_RESEARCH: boolean;
    TENDERLY_PROJECT: string;
    TENDERLY_USERNAME: string;
    DEV_ADDRESSES: string;
}

const {
    TENDERLY_PROJECT,
    TENDERLY_USERNAME,
    DEV_ADDRESSES,
    FORK_NAME,
    FORK_RESEARCH: isResearch
}: EnvOptions = process.env as any as EnvOptions;

const tenderlyNetwork = tenderly.network();

const createTenderlyFork = async () => {
    console.log('Setting up new fork...');

    await tenderlyNetwork.initializeFork();

    const forkId = tenderlyNetwork.getFork()!;

    setForkId(forkId);

    console.log(`Fork ID: ${forkId}`);
    console.log();

    return forkId;
};

const setForkId = (forkId: string) => {
    tenderlyNetwork.setFork(forkId);

    (network.config as HttpNetworkUserConfig).url = `https://rpc.tenderly.co/fork/${forkId}`;
};

interface FundingRequest {
    token: string;
    amount: BigNumber;
    whale: SignerWithAddress;
}

const fundAccount = async (account: string, fundingRequests: FundingRequest[]) => {
    console.log(`Funding ${account}...`);

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

const removeDepositLimits = async (tokens: string[]) => {
    console.log('Removing deposit limits...');
    console.log();

    const { deployer } = await getNamedSigners();

    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    for (const token of tokens) {
        await poolCollection.connect(deployer).setDepositLimit(token, MAX_UINT256);
    }
};

const setLockDuration = async (lockDuration: number) => {
    console.log(`Setting withdrawal lock duration to ${lockDuration} seconds...`);
    console.log();

    const { deployer } = await getNamedSigners();

    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    await pendingWithdrawals.connect(deployer).setLockDuration(lockDuration);
};

const archiveArtifacts = async () => {
    const zip = new AdmZip();

    const srcDir = path.resolve(path.join(__dirname, './tenderly'));
    const dest = path.resolve(path.join(__dirname, `../fork-${new Date().toISOString()}.zip`));

    zip.addLocalFolder(srcDir);
    zip.writeZip(dest);

    console.log(`Archived ${srcDir} to ${dest}...`);
    console.log();
};

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    console.log();

    const forkId = await createTenderlyFork();

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

    console.log();

    const lockDuration = 2;

    if (isResearch) {
        await removeDepositLimits([NATIVE_TOKEN_ADDRESS, dai, link]);
        await setLockDuration(lockDuration);
    }

    await archiveArtifacts();

    const description = `${FORK_NAME} Fork`;

    console.log('********************************************************************************');
    console.log();
    console.log(description);
    console.log('‾'.repeat(description.length));
    console.log(`   RPC: https://rpc.tenderly.co/fork/${forkId}`);
    console.log(`   Dashboard: https://dashboard.tenderly.co/${TENDERLY_USERNAME}/${TENDERLY_PROJECT}/fork/${forkId}`);
    if (isResearch) {
        console.log();
        console.log(`   * Unlimited deposits`);
        console.log(`   * Withdrawal locking duration was set to ${lockDuration} seconds`);
    }
    console.log();
    console.log('********************************************************************************');
    console.log();
    console.log('Funding');
    console.log('‾‾‾‾‾‾‾');
    console.log(`   ETH: ${ethAmount}`);
    console.log(`   BNT: ${bntAmount}`);
    console.log(`   DAI: ${daiAmount}`);
    console.log(`   LINK: ${linkAmount}`);
    console.log();
    console.log('Funded Addresses');
    console.log('‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾');
    for (const address of devAddresses) {
        console.log(`   ${address}`);
    }
    console.log();
    console.log('********************************************************************************');
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
