import { initEngine as init } from '../../engine';
import hre from 'hardhat';

export const initEngine = async () => {
    const signer = (await hre.ethers.getSigners())[0];

    await init(
        {
            reset: true,
            ledger: false,
            ledgerPath: '',
            gasPrice: 0,
            minBlockConfirmations: 0
        },
        hre,
        signer,
        signer.address,
        true
    );
};
