import { BancorNetwork } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { toWei } from '../../utils/Types';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let network: BancorNetwork;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
    });

    it('should upgrade the network contract properly', async () => {
        expect(await network.version()).to.equal(11);
        expect(await network.minNetworkFeeBurn()).to.equal(toWei(1_000_000));
    });

    it('should have added bancor arbitrage contract address to fee exemption whitelist', async () => {
        const { bancorArbitrageAddress } = await getNamedAccounts();

        const whitelist = await network.feeExemptionWhitelist();
        expect(whitelist).to.include(bancorArbitrageAddress);
    });
});
