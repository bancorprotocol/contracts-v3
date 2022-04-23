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
import { getNamedAccounts, tenderly } from 'hardhat';
import 'hardhat-deploy';
import path from 'path';

interface EnvOptions {
    DEV_ADDRESSES: string;
}

const { DEV_ADDRESSES }: EnvOptions = process.env as any as EnvOptions;

const tenderlyNetwork = tenderly.network();

const createTenderlyFork = async () => {
    await tenderlyNetwork.initializeFork();

    const forkId = tenderlyNetwork.getFork()!;

    console.log(`Fork ID: ${forkId}`);
    console.log();

    return forkId;
};

interface FundingRequest {
    token: string;
    amount: BigNumber;
    whale: SignerWithAddress;
}

const fundAccount = async (forkId: string, account: string, fundingRequests: FundingRequest[]) => {
    console.log(`Funding ${account} on fork ${forkId}...`);

    tenderlyNetwork.setFork(forkId);

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

const removeDepositLimits = async (forkId: string, tokens: string[]) => {
    console.log(`Removing deposit limits on fork ${forkId}...`);
    console.log();

    const { deployer } = await getNamedSigners();

    tenderlyNetwork.setFork(forkId);

    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    for (const token of tokens) {
        await poolCollection.connect(deployer).setDepositLimit(token, MAX_UINT256);
    }
};

const setLockDuration = async (forkId: string, lockDuration: number) => {
    console.log(`Setting withdrawal lock duration to ${lockDuration} seconds on fork ${forkId}`);
    console.log();

    const { deployer } = await getNamedSigners();

    tenderlyNetwork.setFork(forkId);

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

    console.log('Setting up main fork...');
    const mainForkId = await createTenderlyFork();

    console.log('Setting up research fork...');
    const researchForkId = await createTenderlyFork();

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

    for (const forkId of [mainForkId, researchForkId]) {
        for (const account of devAddresses) {
            await fundAccount(forkId, account, fundingRequests);
        }
    }

    console.log();

    for (const forkId of [mainForkId, researchForkId]) {
        await removeDepositLimits(forkId, [NATIVE_TOKEN_ADDRESS, dai, link]);
    }

    const lockDuration = 2;
    await setLockDuration(researchForkId, lockDuration);

    await archiveArtifacts();

    console.log('*********************************************************');
    console.log();
    console.log('Main Fork');
    console.log('‾‾‾‾‾‾‾‾‾');
    console.log(`   RPC: https://rpc.tenderly.co/fork/${mainForkId}`);
    console.log();
    console.log('Research Fork');
    console.log('‾‾‾‾‾‾‾‾‾‾‾‾‾');
    console.log(`   RPC: https://rpc.tenderly.co/fork/${researchForkId}`);
    console.log();
    console.log(`   * Unlimited deposits`);
    console.log(`   * Withdrawal locking duration was set to ${lockDuration} seconds`);
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
    console.log('*********************************************************');
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
