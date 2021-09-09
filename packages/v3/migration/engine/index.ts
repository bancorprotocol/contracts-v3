import { Engine } from './engine';
import { defaultArgs } from './types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment as hre } from 'hardhat/types';

export let engine: Engine;

export default async (args: defaultArgs, hre: hre, task: (a: any, b: hre) => any) => {
    // init signer
    const signer = args.ledger
        ? new LedgerSigner(ethers.provider, 'hid', args.ledgerPath)
        : (await ethers.getSigners())[0];

    engine = new Engine(hre, args, signer, await signer.getAddress(), hre.config.paths.root);

    // follow to the actual task
    return task(args, hre);
};
