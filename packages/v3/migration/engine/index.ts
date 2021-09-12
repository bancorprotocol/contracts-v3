import { Engine } from './engine';
import { defaultArgs } from './types';
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

    const signerAddress = await signer.getAddress();

    return { signer, signerAddress };
};

export const initEngine = async (
    args: defaultArgs,
    hre: hre,
    signer: Signer,
    signerAddress: string,
    pathToRoot: string,
    isTest: boolean
) => {
    test = isTest;
    engine = new Engine(hre, args, signer, signerAddress, pathToRoot);
};

export default async (args: defaultArgs, hre: hre, task: (a: any, b: hre) => any) => {
    const { signer, signerAddress } = await initSigner(args);

    await initEngine(args, hre, signer, signerAddress, hre.config.paths.root, false);

    // now that engine is initialized, go to the actual task
    return task(args, hre);
};
