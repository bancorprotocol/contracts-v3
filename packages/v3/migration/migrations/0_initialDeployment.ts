import Contracts from 'components/Contracts';
import { parseUnits } from 'ethers/lib/utils';
import { Migration, token } from 'migration/engine/types';

export type State = {
    BNT: token;
};

const migration: Migration = {
    up: async (signer, _, { deploy, execute }): Promise<State> => {
        const contracts = Contracts.connect(signer);

        const BNT = await deploy('BNTContract', contracts.TestERC20Token.deploy, 'BNT', 'BNT', parseUnits('10000'));
        return {
            BNT: {
                address: BNT.address,
                tx: BNT.deployTransaction.hash
            }
        };
    },
    healthcheck: async (signer, state: State, { deploy, execute }) => {
        return true;
    }
};
export default migration;
