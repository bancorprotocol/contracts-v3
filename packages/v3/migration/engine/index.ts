import { Engine } from './Engine';
import { defaultArgs } from './Types';
import { Signer } from '@ethersproject/abstract-signer';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment as hre } from 'hardhat/types';

export let engine: Engine;

// extra config
export let test = false;

const initSigner = async (args: defaultArgs) => {
    const signer = args.ledger
        ? new LedgerSigner(ethers.provider, 'hid', args.ledgerPath)
        : (await ethers.getSigners())[0];

    if (!signer) {
        throw new Error('Signer must be defined');
    }

    const signerAddress = await signer.getAddress();

    return { signer, signerAddress };
};

export const initEngine = async (
    args: defaultArgs,
    hre: hre,
    signer: Signer,
    signerAddress: string,
    isTest: boolean
) => {
    test = isTest;
    engine = new Engine(hre, args, signer, signerAddress);
};

export default async (args: defaultArgs, hre: hre, task: (a: any, b: hre) => any) => {
    const { signer, signerAddress } = await initSigner(args);

    await initEngine(args, hre, signer, signerAddress, false);

    // now that engine is initialized, go to the actual task
    return task(args, hre);
};
